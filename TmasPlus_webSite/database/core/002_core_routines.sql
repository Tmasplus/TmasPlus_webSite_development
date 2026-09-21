-- New core functions are isolated from the legacy RPC names and closed to API roles.
-- The event trigger helper is deliberately not imported; existing DDL watchers are unchanged.
CREATE FUNCTION public.persona_actual_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id from persona where auth_id = auth.uid() limit 1;
$function$;
ALTER FUNCTION public."persona_actual_id"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."persona_actual_id"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.al_aprobar_conductor()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v_nombre        text;
  v_codigo_usado  varchar(20);
  v_id_referente  uuid;
  v_id_codigo     uuid;
begin
  if new.aprobado = true and old.aprobado = false then
    select nombre, codigo_referido_usado into v_nombre, v_codigo_usado
      from persona where id = new.id_persona;

    -- A) Código propio
    if not exists (select 1 from codigo_referido where id_persona = new.id_persona) then
      insert into codigo_referido (id_persona, codigo, activo, total_referidos)
        values (new.id_persona, generar_codigo_referido(v_nombre), true, 0);
    end if;

    -- B) Recompensa al referente
    if v_codigo_usado is not null and v_codigo_usado <> '' then
      select id, id_persona into v_id_codigo, v_id_referente
        from codigo_referido where codigo = v_codigo_usado and activo = true limit 1;

      if v_id_codigo is not null then
        update codigo_referido set total_referidos = total_referidos + 1 where id = v_id_codigo;
        insert into referido (id_codigo_referido, id_referente, id_conductor_referido, codigo, estado, recompensa_reclamada)
          values (v_id_codigo, v_id_referente, new.id_persona, v_codigo_usado, 'approved', false)
        on conflict (id_conductor_referido) do nothing;
      end if;
    end if;
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."al_aprobar_conductor"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."al_aprobar_conductor"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.aplicar_movimiento_wallet()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  insert into wallet (id_persona, saldo)
    values (new.id_persona, new.saldo_resultante)
  on conflict (id_persona)
    do update set saldo = new.saldo_resultante, actualizado_en = now();
  return new;
end;
$function$;
ALTER FUNCTION public."aplicar_movimiento_wallet"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."aplicar_movimiento_wallet"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.buscar_reservas_inmediatas(p_lat numeric, p_lng numeric, p_rango_km numeric, p_id_conductor uuid)
 RETURNS TABLE(id uuid, referencia character varying, origen_direccion text, destino_direccion text, origen_lat numeric, origen_lng numeric, destino_lat numeric, destino_lng numeric, solicitado_en timestamp with time zone, distancia_a_origen_km numeric, distancia_km numeric, duracion_seg integer, precio_estimado numeric, id_categoria integer, modo_pago public.modo_pago, observaciones text, id_cliente uuid, estado public.estado_reserva)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  return query
  select
    r.id, r.referencia, r.origen_direccion, r.destino_direccion,
    r.origen_lat, r.origen_lng, r.destino_lat, r.destino_lng, r.solicitado_en,
    round((3959 * acos(
      cos(radians(p_lat)) * cos(radians(r.origen_lat)) *
      cos(radians(r.origen_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.origen_lat))
    ))::numeric / 1.60934, 2) as distancia_a_origen_km,
    r.distancia_km, r.duracion_seg, r.precio_estimado, r.id_categoria,
    r.modo_pago, r.observaciones, r.id_cliente, r.estado
  from reserva r
  where r.tipo_reserva = 'immediate'
    and r.estado = 'NEW'
    and r.id_conductor is null
    and (3959 * acos(
      cos(radians(p_lat)) * cos(radians(r.origen_lat)) *
      cos(radians(r.origen_lng) - radians(p_lng)) +
      sin(radians(p_lat)) * sin(radians(r.origen_lat))
    )) / 1.60934 <= p_rango_km
    and not exists (
      select 1 from reserva_oferta_conductor o
      where o.id_reserva = r.id and o.id_conductor = p_id_conductor
    )
  order by distancia_a_origen_km asc, r.creado_en desc
  limit 50;
end;
$function$;
ALTER FUNCTION public."buscar_reservas_inmediatas"(p_lat numeric, p_lng numeric, p_rango_km numeric, p_id_conductor uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."buscar_reservas_inmediatas"(p_lat numeric, p_lng numeric, p_rango_km numeric, p_id_conductor uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.calcular_costo_total()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.costo_total := greatest(
    coalesce(new.costo_viaje, 0)
      + coalesce(new.convenience_fees, 0)
      - coalesce(new.descuento, 0),
    coalesce(new.tarifa_minima_snapshot, 0)
  );
  return new;
end;
$function$;
ALTER FUNCTION public."calcular_costo_total"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."calcular_costo_total"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.capturar_snapshot_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  etapa_val etapa_servicio;
begin
  -- En UPDATE, solo actuar si cambió el estado. En INSERT, siempre.
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;

  etapa_val := case new.estado
    when 'NEW'       then 'created'::etapa_servicio
    when 'ARRIVED'   then 'arrival_pickup'::etapa_servicio
    when 'STARTED'   then 'started'::etapa_servicio
    when 'REACHED'   then 'arrival_destination'::etapa_servicio
    when 'COMPLETE'  then 'completed'::etapa_servicio
    when 'PAID'      then 'paid'::etapa_servicio
    when 'CANCELLED' then 'cancelled'::etapa_servicio
    else null
  end;
  if etapa_val is null then return new; end if;

  begin
    insert into reserva_snapshot (
      id_reserva, etapa, id_conductor, id_cliente,
      lat, lng, distancia_km, duracion_seg, precio_calculado, datos_crudos
    ) values (
      new.id, etapa_val, new.id_conductor, new.id_cliente,
      new.origen_lat, new.origen_lng, new.distancia_km, new.duracion_seg,
      case when etapa_val in ('created','arrival_pickup','started')
           then new.precio_estimado else new.costo_total end,
      jsonb_build_object(
        'status_from',         coalesce(old.estado::text, 'NULL'),
        'status_to',           new.estado::text,
        'category',            new.id_categoria,
        'estimated_price',     new.precio_estimado,
        'driver_arrived_time', new.conductor_llego_en,
        'trip_end_time',       new.viaje_fin_en,
        'final_price',         new.costo_total,
        'otp_verified',        new.otp_verificado,
        'payment_mode',        new.modo_pago::text,
        'cancelled_by',        new.cancelado_por::text,
        'reason',              new.motivo_cancelacion
      )
    )
    on conflict (id_reserva, etapa)
    do update set
      capturado_en = excluded.capturado_en,
      datos_crudos = reserva_snapshot.datos_crudos || excluded.datos_crudos;
  exception when others then
    raise warning 'capturar_snapshot_reserva falló para reserva % etapa %: %', new.id, etapa_val, sqlerrm;
  end;

  return new;
end;
$function$;
ALTER FUNCTION public."capturar_snapshot_reserva"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."capturar_snapshot_reserva"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.core_check_email_exists(check_email text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  return exists (select 1 from persona where lower(email) = lower(check_email))
      or exists (select 1 from auth.users where lower(email) = lower(check_email));
end;
$function$;
ALTER FUNCTION public."core_check_email_exists"(check_email text) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."core_check_email_exists"(check_email text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.completar_pasajero_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.id_beneficiario is not null and new.pasajero_telefono is null then
    select b.nombre, b.telefono, b.id_persona
      into new.pasajero_nombre, new.pasajero_telefono, new.id_pasajero
    from persona_beneficiario b
    where b.id = new.id_beneficiario;
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."completar_pasajero_reserva"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."completar_pasajero_reserva"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from persona_rol where id_persona = persona_actual_id() and rol = 'admin');
$function$;
ALTER FUNCTION public."es_admin"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."es_admin"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.es_conductor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from persona_rol where id_persona = persona_actual_id() and rol = 'conductor');
$function$;
ALTER FUNCTION public."es_conductor"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."es_conductor"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.generar_codigo_referido(p_nombre text)
 RETURNS character varying
 LANGUAGE plpgsql
AS $function$
declare
  base_prefix text;
  nuevo_codigo text;
  existe boolean;
begin
  base_prefix := upper(substring(coalesce(nullif(regexp_replace(coalesce(p_nombre,''), '[^a-zA-Z]', '', 'g'), ''), 'DRV') from 1 for 3));
  loop
    nuevo_codigo := base_prefix || '-' || upper(substring(md5(random()::text) from 1 for 5));
    select exists(select 1 from codigo_referido where codigo = nuevo_codigo) into existe;
    exit when not existe;
  end loop;
  return nuevo_codigo;
end;
$function$;
ALTER FUNCTION public."generar_codigo_referido"(p_nombre text) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."generar_codigo_referido"(p_nombre text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.generar_otp_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.otp is null or new.otp = '' then
    new.otp := lpad((floor(random() * 10000))::int::text, 4, '0');
    new.otp_verificado  := coalesce(new.otp_verificado, false);
    new.otp_generado_en := coalesce(new.otp_generado_en, now());
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."generar_otp_reserva"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."generar_otp_reserva"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.generar_referencia_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  chars  text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  result text := '';
  i      integer;
begin
  if new.referencia is null then
    for i in 1..6 loop
      result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    end loop;
    new.referencia := result;
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."generar_referencia_reserva"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."generar_referencia_reserva"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.core_get_active_booking_by_plate(p_plate text)
 RETURNS TABLE(id_reserva uuid, conductor_lat numeric, conductor_lng numeric, ultima_actualizacion timestamp with time zone, estado text, conductor_nombre text, modelo text, color text, placa text)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  return query
  select
    r.id,
    t.lat, t.lng, t.registrado_en,
    r.estado::text,
    trim(coalesce(pc.nombre,'') || ' ' || coalesce(pc.apellido,'')),
    v.linea, v.color, v.placa
  from reserva r
  join vehiculo v on v.id = r.id_vehiculo
  left join persona pc on pc.id = r.id_conductor
  left join lateral (
    select rt.lat, rt.lng, rt.registrado_en
    from reserva_tracking rt
    where rt.id_reserva = r.id
    order by rt.registrado_en desc
    limit 1
  ) t on true
  where lower(trim(v.placa)) = lower(trim(p_plate))
    and r.estado in ('ACCEPTED','ARRIVED','STARTED')
  order by t.registrado_en desc nulls last
  limit 1;
end;
$function$;
ALTER FUNCTION public."core_get_active_booking_by_plate"(p_plate text) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."core_get_active_booking_by_plate"(p_plate text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.core_get_auth_profile()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare v_persona record;
begin
  select * into v_persona from persona where auth_id = auth.uid() limit 1;
  if v_persona is null then return null; end if;
  return row_to_json(v_persona)::jsonb;
end;
$function$;
ALTER FUNCTION public."core_get_auth_profile"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."core_get_auth_profile"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_membresias_conductor(p_id_conductor uuid)
 RETURNS SETOF public.membresia
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select * from membresia where id_conductor = p_id_conductor order by creado_en desc;
$function$;
ALTER FUNCTION public."get_membresias_conductor"(p_id_conductor uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."get_membresias_conductor"(p_id_conductor uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.core_get_my_memberships(conductor_id uuid)
 RETURNS SETOF public.membresia
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  select * from membresia where id_conductor = conductor_id order by creado_en desc;
$function$;
ALTER FUNCTION public."core_get_my_memberships"(conductor_id uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."core_get_my_memberships"(conductor_id uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_perfil_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v        persona;
  v_roles  text[];
  v_aprob  boolean;
  v_ciudad text;
begin
  select * into v from persona where auth_id = auth.uid() limit 1;
  if v.id is null then
    return null;
  end if;

  select array_agg(rol::text) into v_roles
    from persona_rol where id_persona = v.id;

  select aprobado into v_aprob
    from perfil_conductor where id_persona = v.id;

  select nombre into v_ciudad
    from ciudad where id = v.id_ciudad_actual;

  return jsonb_build_object(
    'id',            v.id,
    'auth_id',       v.auth_id,
    'nombre',        v.nombre,
    'apellido',      v.apellido,
    'telefono',      v.telefono,
    'email',         v.email,
    'imagen_perfil', v.imagen_perfil,
    'ciudad',        v_ciudad,
    'codigo_referido_usado', v.codigo_referido_usado,
    'bloqueado',     v.bloqueado,
    'verificado',    v.verificado,
    'roles',         coalesce(v_roles, array[]::text[]),
    'es_admin',      'admin'     = any(coalesce(v_roles, '{}')),
    'es_conductor',  'conductor' = any(coalesce(v_roles, '{}')),
    'es_cliente',    'cliente'   = any(coalesce(v_roles, '{}')),
    'aprobado',      coalesce(v_aprob, false)
  );
end;
$function$;
ALTER FUNCTION public."get_perfil_dashboard"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."get_perfil_dashboard"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_perfil_movil()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  v          persona;
  v_roles    text[];
  v_cond     perfil_conductor;
  v_cli      perfil_cliente;
  v_saldo    numeric;
  v_ciudad   text;
  v_doc      text;
  v_utype    text;
begin
  select * into v from persona where auth_id = auth.uid() limit 1;
  if v.id is null then
    return null;
  end if;

  select array_agg(rol::text) into v_roles from persona_rol where id_persona = v.id;
  select * into v_cond from perfil_conductor where id_persona = v.id;
  select * into v_cli  from perfil_cliente  where id_persona = v.id;
  select saldo into v_saldo from wallet where id_persona = v.id;
  select nombre into v_ciudad from ciudad where id = v.id_ciudad_actual;
  select coalesce(acronimo, nombre) into v_doc from tipo_documento where id = v.id_tipo_documento;

  v_utype := case
    when 'admin'     = any(coalesce(v_roles,'{}')) then 'admin'
    when 'conductor' = any(coalesce(v_roles,'{}')) then 'driver'
    when 'empresa'   = any(coalesce(v_roles,'{}')) then 'company'
    else 'customer'
  end;

  return jsonb_build_object(
    'id',                   v.id,
    'auth_id',              v.auth_id,
    'email',               v.email,
    'first_name',          v.nombre,
    'last_name',           v.apellido,
    'mobile',              v.telefono,
    'city',                v_ciudad,
    'user_type',           v_utype,
    'profile_image',       v.imagen_perfil,
    'is_verified',         v.verificado,
    'blocked',             v.bloqueado,
    'document_type',       v_doc,
    'document_number',     v.numero_documento,
    'referral_id',         v.codigo_referido_usado,
    'wallet_balance',      coalesce(v_saldo, 0),
    -- Campos de conductor (null si no es conductor)
    'approved',            coalesce(v_cond.aprobado, true),
    'driver_active_status',coalesce(v_cond.en_servicio, false),
    'license_number',      v_cond.numero_licencia,
    'total_trips',         coalesce(v_cond.total_viajes, 0),
    'total_earnings',      coalesce(v_cond.total_ganancias, 0),
    -- Campos de cliente
    'total_rides',         coalesce(v_cli.total_viajes, 0),
    'roles',               coalesce(v_roles, array[]::text[])
  );
end;
$function$;
ALTER FUNCTION public."get_perfil_movil"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."get_perfil_movil"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.core_get_service_timeline(p_id_reserva uuid)
 RETURNS SETOF public.reserva_snapshot
 LANGUAGE sql
 STABLE
AS $function$
  select * from reserva_snapshot where id_reserva = p_id_reserva order by capturado_en asc;
$function$;
ALTER FUNCTION public."core_get_service_timeline"(p_id_reserva uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."core_get_service_timeline"(p_id_reserva uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.notificar_nueva_reserva()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if new.estado = 'NEW' then
    perform pg_notify('nueva_reserva', json_build_object(
      'id_reserva',       new.id,
      'origen_direccion', new.origen_direccion,
      'destino_direccion',new.destino_direccion,
      'id_categoria',     new.id_categoria,
      'costo_viaje',      new.costo_viaje,
      'distancia_km',     new.distancia_km
    )::text);
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."notificar_nueva_reserva"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."notificar_nueva_reserva"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.posee_reserva(bid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from reserva r
    where r.id = bid
      and (r.id_cliente   = persona_actual_id()
        or r.id_conductor = persona_actual_id()
        or r.id_pasajero  = persona_actual_id())
  );
$function$;
ALTER FUNCTION public."posee_reserva"(bid uuid) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."posee_reserva"(bid uuid) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.set_actualizado_en()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.actualizado_en := now();
  return new;
end;
$function$;
ALTER FUNCTION public."set_actualizado_en"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."set_actualizado_en"() FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.verificar_disponibilidad(p_email text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email_existe    boolean := false;
  v_telefono_existe boolean := false;
  v_tel_norm        text    := regexp_replace(coalesce(p_telefono,''), '\D', '', 'g');
begin
  if p_email is not null and p_email <> '' then
    select exists(select 1 from persona where lower(email) = lower(p_email)) into v_email_existe;
  end if;
  if v_tel_norm <> '' then
    select exists(select 1 from persona where regexp_replace(coalesce(telefono,''), '\D','','g') = v_tel_norm)
      into v_telefono_existe;
  end if;
  return json_build_object('email_exists', v_email_existe, 'mobile_exists', v_telefono_existe)::jsonb;
end;
$function$;
ALTER FUNCTION public."verificar_disponibilidad"(p_email text, p_telefono text) SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."verificar_disponibilidad"(p_email text, p_telefono text) FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.verificar_limite_favoritos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  cuenta integer;
begin
  if new.es_favorito = true then
    select count(*) into cuenta
      from lugar_guardado
     where id_persona = new.id_persona and es_favorito = true;
    if cuenta >= 5 then
      raise exception 'Límite alcanzado: máximo 5 lugares favoritos por usuario.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$function$;
ALTER FUNCTION public."verificar_limite_favoritos"() SET search_path = pg_catalog, public, extensions, pg_temp;
REVOKE ALL ON FUNCTION public."verificar_limite_favoritos"() FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX idx_calificacion_persona ON public.calificacion USING btree (id_persona);
CREATE INDEX idx_dispositivo_push_persona ON public.dispositivo_push USING btree (id_persona);
CREATE INDEX idx_documento_persona ON public.documento_persona USING btree (id_persona);
CREATE INDEX idx_documento_vehiculo ON public.documento_vehiculo USING btree (id_vehiculo);
CREATE INDEX idx_estado_bot_timeout ON public.estado_usuario_bot USING btree (ultima_actividad) WHERE ((estado)::text <> 'IDLE'::text);
CREATE INDEX idx_evento_notif_persona_tiempo ON public.evento_notificacion USING btree (id_persona, enviado_en DESC);
CREATE INDEX idx_interaccion_bot_jornada ON public.interaccion_bot USING btree (id_jornada);
CREATE INDEX idx_interaccion_bot_wa ON public.interaccion_bot USING btree (wa_id, recibido_en DESC);
CREATE INDEX idx_jornada_bot_wa ON public.jornada_bot USING btree (wa_id);
CREATE INDEX idx_lugar_favorito ON public.lugar_guardado USING btree (id_persona, es_favorito) WHERE es_favorito;
CREATE INDEX idx_lugar_persona ON public.lugar_guardado USING btree (id_persona);
CREATE INDEX idx_membresia_conductor ON public.membresia USING btree (id_conductor);
CREATE INDEX idx_membresia_estado ON public.membresia USING btree (estado);
CREATE INDEX idx_membresia_fecha_fin ON public.membresia USING btree (fecha_fin);
CREATE INDEX idx_mensaje_chat_reserva ON public.mensaje_chat USING btree (id_reserva, creado_en);
CREATE INDEX idx_movimiento_wallet_persona ON public.movimiento_wallet USING btree (id_persona);
CREATE INDEX idx_notificacion_persona ON public.notificacion USING btree (id_persona);
CREATE INDEX idx_persona_auth_id ON public.persona USING btree (auth_id);
CREATE INDEX idx_persona_ciudad ON public.persona USING btree (id_ciudad_actual);
CREATE INDEX idx_persona_documento ON public.persona USING btree (id_tipo_documento, numero_documento);
CREATE INDEX idx_persona_telefono ON public.persona USING btree (telefono);
CREATE INDEX idx_beneficiario_titular ON public.persona_beneficiario USING btree (id_titular);
CREATE INDEX idx_queja_estado ON public.queja USING btree (estado);
CREATE INDEX idx_queja_reportante ON public.queja USING btree (id_reportante);
CREATE INDEX idx_referido_codigo ON public.referido USING btree (id_codigo_referido);
CREATE INDEX idx_referido_referente ON public.referido USING btree (id_referente);
CREATE INDEX idx_reserva_beneficiario ON public.reserva USING btree (id_beneficiario);
CREATE INDEX idx_reserva_cliente ON public.reserva USING btree (id_cliente);
CREATE INDEX idx_reserva_conductor ON public.reserva USING btree (id_conductor);
CREATE INDEX idx_reserva_estado ON public.reserva USING btree (estado);
CREATE INDEX idx_reserva_estado_creado ON public.reserva USING btree (estado, creado_en DESC);
CREATE INDEX idx_reserva_inmediata_pendiente ON public.reserva USING btree (creado_en DESC) WHERE ((tipo_reserva = 'immediate'::public.tipo_reserva) AND (estado = 'NEW'::public.estado_reserva) AND (id_conductor IS NULL));
CREATE INDEX idx_reserva_pasajero ON public.reserva USING btree (id_pasajero);
CREATE INDEX idx_reserva_solicitado ON public.reserva USING btree (solicitado_en);
CREATE INDEX idx_reserva_tipo_estado ON public.reserva USING btree (tipo_reserva, estado);
CREATE INDEX idx_snapshot_reserva ON public.reserva_snapshot USING btree (id_reserva);
CREATE INDEX idx_tracking_reserva ON public.reserva_tracking USING btree (id_reserva);
CREATE INDEX idx_tracking_reserva_tiempo ON public.reserva_tracking USING btree (id_reserva, registrado_en DESC);
CREATE INDEX idx_vehiculo_categoria ON public.vehiculo USING btree (id_categoria);
CREATE INDEX idx_vehiculo_conductor ON public.vehiculo USING btree (id_conductor);
CREATE VIEW public."v_reserva_detalle" WITH (security_invoker = true) AS SELECT r.id,
    r.referencia,
    r.estado,
    r.tipo_reserva,
    r.solicitado_en,
    r.origen_direccion,
    r.destino_direccion,
    r.precio,
    r.costo_total,
    r.id_cliente,
    (((pc.nombre)::text || ' '::text) || (pc.apellido)::text) AS titular_nombre,
    pc.telefono AS titular_telefono,
    pc.email AS titular_email,
    r.id_beneficiario,
    r.pasajero_nombre,
    r.pasajero_telefono,
    b.parentesco,
    ((r.id_beneficiario IS NOT NULL) OR (r.pasajero_telefono IS NOT NULL)) AS es_para_tercero,
    r.id_conductor,
    (((pd.nombre)::text || ' '::text) || (pd.apellido)::text) AS conductor_nombre,
    pd.telefono AS conductor_telefono,
    pd.imagen_perfil AS conductor_imagen,
    cat.nombre AS categoria,
    v.placa,
    mv.nombre AS marca,
    v.linea AS modelo,
    v.color
   FROM ((((((public.reserva r
     LEFT JOIN public.persona pc ON ((r.id_cliente = pc.id)))
     LEFT JOIN public.persona pd ON ((r.id_conductor = pd.id)))
     LEFT JOIN public.persona_beneficiario b ON ((r.id_beneficiario = b.id)))
     LEFT JOIN public.vehiculo v ON ((r.id_vehiculo = v.id)))
     LEFT JOIN public.marca_vehiculo mv ON ((v.id_marca = mv.id)))
     LEFT JOIN public.categoria_vehiculo cat ON ((r.id_categoria = cat.id)));
REVOKE ALL ON public."v_reserva_detalle" FROM PUBLIC, anon, authenticated, service_role;
CREATE VIEW public."v_reserva_activa" WITH (security_invoker = true) AS SELECT id,
    referencia,
    estado,
    tipo_reserva,
    solicitado_en,
    origen_direccion,
    destino_direccion,
    precio,
    costo_total,
    id_cliente,
    titular_nombre,
    titular_telefono,
    titular_email,
    id_beneficiario,
    pasajero_nombre,
    pasajero_telefono,
    parentesco,
    es_para_tercero,
    id_conductor,
    conductor_nombre,
    conductor_telefono,
    conductor_imagen,
    categoria,
    placa,
    marca,
    modelo,
    color
   FROM public.v_reserva_detalle
  WHERE (estado = ANY (ARRAY['NEW'::public.estado_reserva, 'ACCEPTED'::public.estado_reserva, 'STARTED'::public.estado_reserva, 'ARRIVED'::public.estado_reserva]));
REVOKE ALL ON public."v_reserva_activa" FROM PUBLIC, anon, authenticated, service_role;
CREATE VIEW public."v_estadisticas_cliente" WITH (security_invoker = true) AS SELECT id_cliente,
    count(*) AS total_reservas,
    count(*) FILTER (WHERE (estado = 'COMPLETE'::public.estado_reserva)) AS completadas,
    count(*) FILTER (WHERE (estado = 'CANCELLED'::public.estado_reserva)) AS canceladas,
    COALESCE(sum(costo_total) FILTER (WHERE (estado = 'PAID'::public.estado_reserva)), (0)::numeric) AS total_gastado,
    avg(duracion_seg) FILTER (WHERE (estado = 'COMPLETE'::public.estado_reserva)) AS duracion_promedio_seg
   FROM public.reserva
  GROUP BY id_cliente;
REVOKE ALL ON public."v_estadisticas_cliente" FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER trg_categoria_actualizado BEFORE UPDATE ON public.categoria_vehiculo FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."categoria_vehiculo" DISABLE TRIGGER "trg_categoria_actualizado";
CREATE TRIGGER trg_contrato_actualizado BEFORE UPDATE ON public.contrato_empresa FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."contrato_empresa" DISABLE TRIGGER "trg_contrato_actualizado";
CREATE TRIGGER trg_estado_bot_actualizado BEFORE UPDATE ON public.estado_usuario_bot FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."estado_usuario_bot" DISABLE TRIGGER "trg_estado_bot_actualizado";
CREATE TRIGGER trg_limite_favoritos_insert BEFORE INSERT ON public.lugar_guardado FOR EACH ROW EXECUTE FUNCTION public.verificar_limite_favoritos();
ALTER TABLE public."lugar_guardado" DISABLE TRIGGER "trg_limite_favoritos_insert";
CREATE TRIGGER trg_limite_favoritos_update BEFORE UPDATE ON public.lugar_guardado FOR EACH ROW WHEN (((old.es_favorito = false) AND (new.es_favorito = true))) EXECUTE FUNCTION public.verificar_limite_favoritos();
ALTER TABLE public."lugar_guardado" DISABLE TRIGGER "trg_limite_favoritos_update";
CREATE TRIGGER trg_lugar_actualizado BEFORE UPDATE ON public.lugar_guardado FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."lugar_guardado" DISABLE TRIGGER "trg_lugar_actualizado";
CREATE TRIGGER trg_membresia_actualizado BEFORE UPDATE ON public.membresia FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."membresia" DISABLE TRIGGER "trg_membresia_actualizado";
CREATE TRIGGER trg_aplicar_movimiento_wallet AFTER INSERT ON public.movimiento_wallet FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimiento_wallet();
ALTER TABLE public."movimiento_wallet" DISABLE TRIGGER "trg_aplicar_movimiento_wallet";
CREATE TRIGGER trg_notif_llamada_actualizado BEFORE UPDATE ON public.notificacion_llamada FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."notificacion_llamada" DISABLE TRIGGER "trg_notif_llamada_actualizado";
CREATE TRIGGER trg_al_aprobar_conductor AFTER UPDATE ON public.perfil_conductor FOR EACH ROW EXECUTE FUNCTION public.al_aprobar_conductor();
ALTER TABLE public."perfil_conductor" DISABLE TRIGGER "trg_al_aprobar_conductor";
CREATE TRIGGER trg_perfil_conductor_actualizado BEFORE UPDATE ON public.perfil_conductor FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."perfil_conductor" DISABLE TRIGGER "trg_perfil_conductor_actualizado";
CREATE TRIGGER trg_persona_actualizado BEFORE UPDATE ON public.persona FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."persona" DISABLE TRIGGER "trg_persona_actualizado";
CREATE TRIGGER trg_beneficiario_actualizado BEFORE UPDATE ON public.persona_beneficiario FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."persona_beneficiario" DISABLE TRIGGER "trg_beneficiario_actualizado";
CREATE TRIGGER trg_pregunta_actualizado BEFORE UPDATE ON public.pregunta_entrenamiento FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."pregunta_entrenamiento" DISABLE TRIGGER "trg_pregunta_actualizado";
CREATE TRIGGER trg_queja_actualizado BEFORE UPDATE ON public.queja FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."queja" DISABLE TRIGGER "trg_queja_actualizado";
CREATE TRIGGER trg_calcular_costo_total BEFORE INSERT OR UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.calcular_costo_total();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_calcular_costo_total";
CREATE TRIGGER trg_completar_pasajero BEFORE INSERT ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.completar_pasajero_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_completar_pasajero";
CREATE TRIGGER trg_generar_otp_reserva BEFORE INSERT ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.generar_otp_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_generar_otp_reserva";
CREATE TRIGGER trg_generar_referencia_reserva BEFORE INSERT ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.generar_referencia_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_generar_referencia_reserva";
CREATE TRIGGER trg_notificar_nueva_reserva AFTER INSERT ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.notificar_nueva_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_notificar_nueva_reserva";
CREATE TRIGGER trg_reserva_actualizado BEFORE UPDATE ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_reserva_actualizado";
CREATE TRIGGER trg_snapshot_estado AFTER UPDATE OF estado ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.capturar_snapshot_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_snapshot_estado";
CREATE TRIGGER trg_snapshot_insert AFTER INSERT ON public.reserva FOR EACH ROW EXECUTE FUNCTION public.capturar_snapshot_reserva();
ALTER TABLE public."reserva" DISABLE TRIGGER "trg_snapshot_insert";
CREATE TRIGGER trg_vehiculo_actualizado BEFORE UPDATE ON public.vehiculo FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();
ALTER TABLE public."vehiculo" DISABLE TRIGGER "trg_vehiculo_actualizado";
-- All imported row triggers remain disabled until their workflows are tested.
