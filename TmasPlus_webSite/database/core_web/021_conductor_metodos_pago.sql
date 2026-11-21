-- M?todos de pago del conductor: efectivo, DaviPlata (obligatorio, 10 d?gitos) y Nequi (+ llave Bre-b).
-- Sirven para liquidar recomendaciones (c?mo pagarle al que hizo el viaje) y para pagos empresariales (DaviPlata).

CREATE TABLE IF NOT EXISTS public.conductor_metodo_pago (
  id_persona uuid PRIMARY KEY REFERENCES public.persona(id) ON DELETE CASCADE,
  efectivo boolean NOT NULL DEFAULT true,
  daviplata boolean NOT NULL DEFAULT true,
  daviplata_numero varchar(10),
  nequi boolean NOT NULL DEFAULT false,
  nequi_numero varchar(10),
  nequi_breb varchar(80),
  breb_activo boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conductor_metodo_pago_daviplata_digitos_ck
    CHECK (daviplata_numero IS NULL OR daviplata_numero ~ '^[0-9]{10}$'),
  CONSTRAINT conductor_metodo_pago_nequi_digitos_ck
    CHECK (nequi_numero IS NULL OR nequi_numero ~ '^[0-9]{10}$'),
  CONSTRAINT conductor_metodo_pago_breb_len_ck
    CHECK (nequi_breb IS NULL OR char_length(nequi_breb) BETWEEN 1 AND 80)
);

DROP TRIGGER IF EXISTS trg_conductor_metodo_pago_actualizado ON public.conductor_metodo_pago;
CREATE TRIGGER trg_conductor_metodo_pago_actualizado BEFORE UPDATE ON public.conductor_metodo_pago
 FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

ALTER TABLE public.conductor_metodo_pago ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_conductor_metodo_pago_select ON public.conductor_metodo_pago;
CREATE POLICY p_conductor_metodo_pago_select ON public.conductor_metodo_pago FOR SELECT TO authenticated
 USING (
  id_persona = public.persona_actual_id()
  OR public.es_admin()
  OR EXISTS (
    SELECT 1 FROM public.reserva_recomendada rr
    JOIN public.reserva r ON r.id = rr.id_reserva
    WHERE rr.id_solicitante = public.persona_actual_id()
      AND r.id_conductor = conductor_metodo_pago.id_persona
  )
 );

DROP POLICY IF EXISTS p_conductor_metodo_pago_own ON public.conductor_metodo_pago;
CREATE POLICY p_conductor_metodo_pago_own ON public.conductor_metodo_pago FOR ALL TO authenticated
 USING (id_persona = public.persona_actual_id())
 WITH CHECK (id_persona = public.persona_actual_id());

CREATE OR REPLACE FUNCTION public._metodo_pago_digitos10(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT nullif(right(regexp_replace(coalesce(p,''),'\D','','g'),10),'');
$$;

CREATE OR REPLACE FUNCTION public.app_conductor_metodos_pago_get()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE yo uuid:=public._conductor_activo(); m public.conductor_metodo_pago%rowtype;
BEGIN
 SELECT * INTO m FROM public.conductor_metodo_pago WHERE id_persona=yo;
 IF NOT FOUND THEN
  RETURN jsonb_build_object(
    'efectivo', true, 'daviplata', true, 'daviplata_numero', null,
    'nequi', false, 'nequi_numero', null, 'nequi_breb', null, 'breb_activo', false, 'completo', false
  );
 END IF;
 RETURN jsonb_build_object(
   'efectivo', true, 'daviplata', m.daviplata, 'daviplata_numero', m.daviplata_numero,
   'nequi', m.nequi, 'nequi_numero', m.nequi_numero, 'nequi_breb', m.nequi_breb,
   'breb_activo', coalesce(m.breb_activo, false),
   'completo', m.daviplata AND coalesce(m.daviplata_numero,'') ~ '^[0-9]{10}$'
 );
END $$;

-- Si la tabla ya exist?a sin breb_activo:
ALTER TABLE public.conductor_metodo_pago
  ADD COLUMN IF NOT EXISTS breb_activo boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.app_conductor_metodos_pago_guardar(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE yo uuid:=public._conductor_activo();
 dav text:=public._metodo_pago_digitos10(p_input->>'daviplata_numero');
 neq text:=public._metodo_pago_digitos10(p_input->>'nequi_numero');
 breb text:=nullif(trim(coalesce(p_input->>'nequi_breb','')),'');
 nequi boolean:=coalesce((p_input->>'nequi')::boolean,false);
 breb_activo boolean:=coalesce((p_input->>'breb_activo')::boolean,false);
 dav_ok boolean:=(dav IS NOT NULL AND length(dav)=10);
BEGIN
 -- DaviPlata opcional al guardar Nequi/Bre-b; si escriben digitos, deben ser 10.
 IF coalesce(nullif(regexp_replace(coalesce(p_input->>'daviplata_numero',''), '\D', '', 'g'), ''), '') <> ''
    AND NOT dav_ok THEN
  RAISE EXCEPTION 'DaviPlata: deja el campo vacio o escribe exactamente 10 digitos';
 END IF;
 IF nequi AND (neq IS NULL OR length(neq)<>10) THEN
  RAISE EXCEPTION 'Si activas Nequi, indica un numero de 10 digitos';
 END IF;
 IF breb_activo AND breb IS NULL THEN
  RAISE EXCEPTION 'Si activas la llave Bre-b, escribelas';
 END IF;
 IF NOT nequi THEN neq:=NULL; END IF;
 IF NOT breb_activo THEN breb:=NULL; END IF;
 IF NOT dav_ok THEN dav:=NULL; END IF;

 INSERT INTO public.conductor_metodo_pago AS t(
   id_persona,efectivo,daviplata,daviplata_numero,nequi,nequi_numero,nequi_breb,breb_activo)
 VALUES(yo,true,dav_ok,dav,nequi,neq,breb,breb_activo)
 ON CONFLICT (id_persona) DO UPDATE SET
  efectivo=true, daviplata=EXCLUDED.daviplata, daviplata_numero=EXCLUDED.daviplata_numero,
  nequi=EXCLUDED.nequi, nequi_numero=EXCLUDED.nequi_numero,
  nequi_breb=EXCLUDED.nequi_breb, breb_activo=EXCLUDED.breb_activo;

 RETURN public.app_conductor_metodos_pago_get();
END $$;

CREATE OR REPLACE FUNCTION public.app_conductor_metodos_pago_de(p_persona uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE yo uuid:=public.persona_actual_id(); m public.conductor_metodo_pago%rowtype; ok boolean:=false;
BEGIN
 IF yo IS NULL OR p_persona IS NULL THEN RETURN NULL; END IF;
 ok := yo=p_persona OR public.es_admin() OR EXISTS (
   SELECT 1 FROM public.reserva_recomendada rr
   JOIN public.reserva r ON r.id=rr.id_reserva
   WHERE (rr.id_solicitante=yo AND r.id_conductor=p_persona)
      OR (rr.id_solicitante=p_persona AND r.id_conductor=yo)
 );
 IF NOT ok THEN RETURN NULL; END IF;
 SELECT * INTO m FROM public.conductor_metodo_pago WHERE id_persona=p_persona;
 IF NOT FOUND THEN
  RETURN jsonb_build_object(
    'efectivo', true, 'daviplata', false, 'daviplata_numero', null,
    'nequi', false, 'nequi_numero', null, 'nequi_breb', null, 'breb_activo', false
  );
 END IF;
 RETURN jsonb_build_object(
   'efectivo', true,
   'daviplata', m.daviplata AND m.daviplata_numero IS NOT NULL,
   'daviplata_numero', CASE WHEN m.daviplata THEN m.daviplata_numero END,
   'nequi', m.nequi AND m.nequi_numero IS NOT NULL,
   'nequi_numero', CASE WHEN m.nequi THEN m.nequi_numero END,
   'breb_activo', coalesce(m.breb_activo,false) AND m.nequi_breb IS NOT NULL,
   'nequi_breb', CASE WHEN coalesce(m.breb_activo,false) THEN m.nequi_breb END
 );
END $$;

-- Ampl?a el detalle existente (020_parche_recomendadas_detalle) con m?todos del conductor del viaje.
CREATE OR REPLACE FUNCTION public.app_recomendacion_detalle(p_reserva uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE yo uuid:=public.persona_actual_id(); rr public.reserva_recomendada%rowtype;
 l public.reserva_recomendada_liquidacion%rowtype; conductor uuid; rol text; viaje jsonb; ruta jsonb:='[]'; eventos jsonb;
 metodos jsonb;
BEGIN
 SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva=p_reserva;
 IF rr.id_reserva IS NULL OR yo IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE='42501'; END IF;
 SELECT id_conductor INTO conductor FROM public.reserva WHERE id=p_reserva;
 rol:=CASE WHEN yo=rr.id_solicitante THEN 'solicitante' WHEN yo=conductor THEN 'conductor' END;
 IF rol IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE='42501'; END IF;

 SELECT jsonb_build_object('id',b.id,'reference',b.reference,'status',b.status,'booking_type',b.booking_type,
   'booking_date',b.booking_date,'created_at',b.created_at,'car_type',b.car_type,
   'pickup_address',b.pickup_address,'pickup_lat',b.pickup_lat,'pickup_lng',b.pickup_lng,
   'drop_address',b.drop_address,'drop_lat',b.drop_lat,'drop_lng',b.drop_lng,
   'distance',b.distance,'duration',b.duration,'observations',b.observations,
   'customer_name',b.customer_name,'customer_contact',b.customer_contact,
   'driver_name',b.driver_name,'driver_contact',b.driver_contact,'driver_image',b.driver_image,
   'plate_number',b.plate_number,'vehicle_make',b.vehicle_make,'vehicle_color',b.vehicle_color,
   'driver_arrived_time',b.driver_arrived_time,'trip_start_time',b.trip_start_time,'trip_end_time',b.trip_end_time,
   'final_price',CASE WHEN b.status IN ('COMPLETE','PAID') THEN b.total_cost END)
 INTO viaje FROM public.bookings b WHERE b.id=p_reserva;

 BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object('lat',t.lat,'lng',t.lng) ORDER BY t.created_at),'[]'::jsonb) INTO ruta
  FROM (SELECT lat,lng,created_at FROM public.booking_tracking WHERE booking_id=p_reserva
   ORDER BY created_at DESC LIMIT 600) t;
 EXCEPTION WHEN undefined_table OR undefined_column THEN ruta:='[]'::jsonb;
 END;

 SELECT coalesce(jsonb_agg(jsonb_build_object('type',e.tipo,'created_at',e.creado_en,
   'note',CASE WHEN rol='solicitante' OR e.tipo IN ('resuelta','soporte_reportado','soporte_atendido','pago_no_recibido')
    THEN e.nota END) ORDER BY e.creado_en),'[]'::jsonb)
 INTO eventos FROM public.reserva_recomendada_evento e
 WHERE e.id_reserva=p_reserva AND (rol='solicitante' OR e.tipo NOT IN ('creada','monto_actualizado'));

 SELECT * INTO l FROM public.reserva_recomendada_liquidacion WHERE id_reserva=p_reserva;
 IF conductor IS NOT NULL THEN metodos:=public.app_conductor_metodos_pago_de(conductor); END IF;

 RETURN coalesce(viaje,'{}'::jsonb)||jsonb_build_object(
  'role',rol,
  'requester_name',public._recomendacion_nombre(rr.id_solicitante),
  'requester_contact',(SELECT telefono FROM public.persona WHERE id=rr.id_solicitante),
  'fare_source',rr.tarifa_origen,'fare_min',rr.tarifa_min,'fare_max',rr.tarifa_max,
  'agreed_value',CASE WHEN rol='solicitante' THEN rr.valor_acordado END,
  'receiver_payment_methods',metodos,
  'settlement',CASE WHEN l.id_reserva IS NULL THEN NULL ELSE jsonb_build_object(
   'status',l.estado,'amount',l.monto,'due_at',l.vence_en,
   'overdue',public._liquidacion_vencida(l.estado,l.vence_en),
   'paid_reported_at',l.pago_reportado_en,'received',l.recibido,'received_reported_at',l.recibido_reportado_en,
   'resolution',l.resultado_admin,'resolution_note',l.nota_resolucion) END,
  'support',CASE WHEN rr.soporte_solicitado_en IS NULL THEN NULL ELSE jsonb_build_object(
   'requested_at',rr.soporte_solicitado_en,'requested_by',public._recomendacion_nombre(rr.soporte_solicitado_por),
   'mine',rr.soporte_solicitado_por=yo,'note',rr.soporte_nota,
   'attended_at',rr.soporte_atendido_en,'response',rr.soporte_respuesta) END,
  'route',ruta,'events',eventos);
END $$;

-- Documento obligatorio al registrar cliente recomendado.
CREATE OR REPLACE FUNCTION public.app_conductor_registrar_cliente(p_auth_id uuid,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE yo uuid:=public._conductor_activo(); correo text:=lower(public._txt(p_input,'email'));
 doc text:=public._txt(p_input,'document_number'); pid uuid; mobile text;
BEGIN
 mobile:=public._metodo_pago_digitos10(public._txt(p_input,'mobile'));
 IF correo IS NULL OR public._txt(p_input,'first_name') IS NULL OR public._txt(p_input,'last_name') IS NULL
  OR mobile IS NULL OR doc IS NULL
 THEN RAISE EXCEPTION 'Nombre, apellido, celular, correo y documento son obligatorios'; END IF;
 IF length(mobile)<>10 THEN RAISE EXCEPTION 'El celular debe tener 10 d?gitos'; END IF;
 IF EXISTS(SELECT 1 FROM public.persona WHERE lower(email)=correo)
 THEN RAISE EXCEPTION 'Ese correo ya esta registrado: busca al cliente y agregalo a tu cartera'; END IF;
 IF p_auth_id IS NULL OR NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=correo)
 THEN RAISE EXCEPTION 'La cuenta Auth no coincide con el correo del cliente'; END IF;
 BEGIN
  INSERT INTO public.persona(auth_id,nombre,apellido,email,telefono,id_tipo_documento,numero_documento,bloqueado,verificado)
  VALUES(p_auth_id,public._txt(p_input,'first_name'),public._txt(p_input,'last_name'),correo,mobile,
   public._tipo_documento_id(coalesce(public._txt(p_input,'document_type'),'CC')),doc,false,false)
  RETURNING id INTO pid;
 EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'El correo o el celular ya estan registrados en otra cuenta: busca al cliente y agregalo'
   USING DETAIL=SQLERRM;
 END;
 INSERT INTO public.persona_rol(id_persona,rol) VALUES(pid,'cliente');
 INSERT INTO public.perfil_cliente(id_persona) VALUES(pid);
 INSERT INTO public.wallet(id_persona) VALUES(pid);
 INSERT INTO public.conductor_cliente(id_conductor,id_cliente,origen) VALUES(yo,pid,'registrado');
 RETURN jsonb_build_object('id_cliente',pid,'registrado',true);
END $$;

REVOKE ALL ON FUNCTION public.app_conductor_metodos_pago_get(),
 public.app_conductor_metodos_pago_guardar(jsonb),
 public.app_conductor_metodos_pago_de(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.app_conductor_metodos_pago_get(),
 public.app_conductor_metodos_pago_guardar(jsonb),
 public.app_conductor_metodos_pago_de(uuid) TO authenticated;

-- Vista admin: m?todos del conductor que hizo el viaje (para liquidaci?n).
CREATE OR REPLACE VIEW public.web_bookings_recomendadas WITH (security_invoker=true) AS
SELECT b.*, rr.id_solicitante AS requester_id,
 nullif(trim(concat_ws(' ',ps.nombre,ps.apellido)),'') AS requester_name, ps.telefono AS requester_contact,
 rr.tarifa_origen AS fare_source, rr.tarifa_min AS fare_min, rr.tarifa_max AS fare_max,
 rr.valor_acordado AS agreed_value, rr.valor_acordado-coalesce(l.monto,rr.tarifa_max) AS requester_margin,
 l.estado AS settlement_status, l.monto AS settlement_amount, l.vence_en AS settlement_due_at,
 coalesce(public._liquidacion_vencida(l.estado,l.vence_en),false) AS settlement_overdue,
 (coalesce(l.estado='en_disputa',false) OR coalesce(public._liquidacion_vencida(l.estado,l.vence_en),false)
  OR (rr.soporte_solicitado_en IS NOT NULL AND rr.soporte_atendido_en IS NULL)) AS needs_support,
 l.resultado_admin AS resolution,
 rr.soporte_solicitado_en AS support_requested_at, rr.soporte_atendido_en AS support_attended_at,
 mp.efectivo AS driver_pay_cash,
 (mp.daviplata AND mp.daviplata_numero IS NOT NULL) AS driver_pay_daviplata,
 mp.daviplata_numero AS driver_daviplata_numero,
 (mp.nequi AND (mp.nequi_numero IS NOT NULL OR mp.nequi_breb IS NOT NULL)) AS driver_pay_nequi,
 mp.nequi_numero AS driver_nequi_numero,
 mp.nequi_breb AS driver_nequi_breb
FROM public.reserva_recomendada rr
CROSS JOIN LATERAL (SELECT wb.* FROM public.web_bookings wb WHERE wb.id=rr.id_reserva OFFSET 0) b
JOIN public.persona ps ON ps.id=rr.id_solicitante
LEFT JOIN public.reserva_recomendada_liquidacion l ON l.id_reserva=rr.id_reserva
LEFT JOIN public.conductor_metodo_pago mp ON mp.id_persona = b.driver_id
WHERE (SELECT public.es_admin());
