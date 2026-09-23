-- GENERADO por scripts/build-core-sql.mjs. Revisar 000_revision_y_entrega.sql primero.
-- Destino: zvplcamcyldcquxqnftb. No ejecutar ademas los archivos individuales.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='90s';

-- 001_views.sql
-- CORE ONLY: revisar y ejecutar en zvplcamcyldcquxqnftb, antes de 002_commands.sql.
-- No ejecutar schema_aplicacioncore.sql: es un dump de referencia, no una migracion.
-- No crea tablas, no copia datos, no modifica las vistas que consume la app.

SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE VIEW public.web_car_types WITH (security_invoker=true) AS
SELECT id, nombre AS name, descripcion AS description, imagen_url AS image,
 tarifa_base AS base_price, valor_km AS price_per_km, valor_hora AS rate_per_hour,
 tarifa_minima AS min_fare, capacidad AS capacity, activo AS is_active,
 tarifa_base_inter AS base_price_inter, valor_km_inter AS price_per_km_inter,
 tarifa_minima_inter AS min_fare_inter, valor_hora_inter AS rate_per_hour_inter,
 convenience_fee, convenience_fee_tipo AS convenience_fee_type,
 delta_aeropuerto, delta_aeropuerto_prog, umbral_intermunicipal_km,
 creado_en AS created_at, actualizado_en AS updated_at
FROM public.categoria_vehiculo;

CREATE OR REPLACE VIEW public.web_bookings WITH (security_invoker=true) AS
SELECT b.*,r.cancelado_en AS cancelled_at,r.cancelado_en AS cancellation_time,
 dr.puntaje AS rating,dr.comentario AS review,dr.puntaje AS driver_rating,
 cr.puntaje AS customer_rating,cr.comentario AS customer_review
FROM public.bookings b JOIN public.reserva r ON r.id=b.id
LEFT JOIN LATERAL (
 SELECT puntaje,comentario FROM public.calificacion WHERE id_reserva=r.id AND id_persona=r.id_conductor
 ORDER BY creado_en DESC,id DESC LIMIT 1
) dr ON true
LEFT JOIN LATERAL (
 SELECT puntaje,comentario FROM public.calificacion WHERE id_reserva=r.id AND id_persona=r.id_cliente
 ORDER BY creado_en DESC,id DESC LIMIT 1
) cr ON true;

CREATE OR REPLACE VIEW public.web_car_brands WITH (security_invoker=true) AS
SELECT id, nombre AS name, activo AS is_active, creado_en AS created_at,
 creado_en AS updated_at FROM public.marca_vehiculo;

CREATE OR REPLACE VIEW public.web_users WITH (security_invoker=true) AS
SELECT u.*, coalesce(d.activo,true) AS is_active, d.numero_cuenta_bancaria AS bank_number,
 d.calificacion_promedio AS rating, e.razon_social AS company_name,
 d.tipo_servicio AS car_type,
 docs.fields->>'identidad:frontal' AS verify_id_image,
 docs.fields->>'identidad:posterior' AS verify_id_image_bk,
 docs.fields->>'licencia:frontal' AS license_image,
 docs.fields->>'licencia:posterior' AS license_image_back
FROM public.users u
LEFT JOIN public.perfil_conductor d ON d.id_persona=u.id
LEFT JOIN public.perfil_empresa e ON e.id_persona=u.id
LEFT JOIN LATERAL (
 SELECT jsonb_object_agg(x.key,x.storage_path) AS fields FROM (
  SELECT DISTINCT ON (tipo,lado) tipo||':'||lado::text AS key, storage_path
  FROM public.documento_persona WHERE id_persona=u.id
  ORDER BY tipo,lado,creado_en DESC,id DESC
 ) x
) docs ON true;

CREATE OR REPLACE VIEW public.web_cars WITH (security_invoker=true) AS
SELECT c.*, v.tipo_combustible AS fuel_type, v.transmision AS transmission,
 v.anio AS vehicle_year, v.placa AS vehicle_number,
 docs.fields->>'soat:frontal' AS soat_image,
 docs.fields->>'tecnomecanica:frontal' AS tecnomecanica_image,
 docs.fields->>'tarjeta_propiedad:frontal' AS card_prop_image,
 docs.fields->>'tarjeta_propiedad:posterior' AS card_prop_image_back,
 docs.fields->>'camara_comercio:frontal' AS camara_comercio_image,
 (docs.expiries->>'soat:frontal')::date AS soat_expiry_date,
 (docs.expiries->>'tecnomecanica:frontal')::date AS tecnomecanica_expiry_date
FROM public.cars c JOIN public.vehiculo v ON v.id=c.id
LEFT JOIN LATERAL (
 SELECT jsonb_object_agg(x.key,x.storage_path) AS fields,
 jsonb_object_agg(x.key,x.fecha_vencimiento) AS expiries FROM (
  SELECT DISTINCT ON (tipo,coalesce(lado,'frontal'))
   tipo::text||':'||coalesce(lado,'frontal')::text AS key,storage_path,fecha_vencimiento
  FROM public.documento_vehiculo WHERE id_vehiculo=c.id
  ORDER BY tipo,coalesce(lado,'frontal'),creado_en DESC,id DESC
 ) x
) docs ON true;

CREATE OR REPLACE VIEW public.web_vehicle_locations WITH (security_invoker=true) AS
SELECT v.id AS vehicle_id,p.id AS driver_id,v.placa AS plate_number,
 trim(coalesce(p.nombre,'')||' '||coalesce(p.apellido,'')) AS driver_name,
 coalesce(r.estado::text,'AVAILABLE') AS booking_status,
 CASE WHEN t.registrado_en > coalesce(p.ubicacion_actualizada_en,'-infinity')
  THEN t.lat ELSE p.ultima_lat END AS driver_lat,
 CASE WHEN t.registrado_en > coalesce(p.ubicacion_actualizada_en,'-infinity')
  THEN t.lng ELSE p.ultima_lng END AS driver_lng,
 greatest(t.registrado_en,p.ubicacion_actualizada_en) AS recorded_at,
 coalesce(greatest(t.registrado_en,p.ubicacion_actualizada_en)<now()-interval '60 seconds',true) AS is_stale
FROM public.vehiculo v
JOIN public.persona p ON p.id=v.id_conductor
JOIN public.perfil_conductor d ON d.id_persona=p.id
LEFT JOIN LATERAL (
 SELECT id,estado FROM public.reserva WHERE id_vehiculo=v.id AND id_conductor=p.id
 AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED')
 ORDER BY solicitado_en DESC,id DESC LIMIT 1
) r ON true
LEFT JOIN LATERAL (
 SELECT lat,lng,registrado_en FROM public.reserva_tracking WHERE id_reserva=r.id
 ORDER BY registrado_en DESC,id DESC LIMIT 1
) t ON true
WHERE public.es_admin() AND v.activo AND d.activo AND NOT p.bloqueado
 -- GPS de persona es del conductor: no atribuirlo a todos sus vehiculos.
 AND (r.id IS NOT NULL OR (NOT EXISTS (
  SELECT 1 FROM public.reserva a WHERE a.id_conductor=p.id
   AND a.estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED')
 ) AND v.id=(SELECT v2.id FROM public.vehiculo v2 WHERE v2.id_conductor=p.id AND v2.activo
  ORDER BY v2.actualizado_en DESC,v2.id LIMIT 1)));

REVOKE ALL ON public.web_car_types,public.web_car_brands,public.web_users,
 public.web_cars,public.web_vehicle_locations FROM anon;
GRANT SELECT ON public.web_car_types,public.web_car_brands TO anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.web_car_types,public.web_car_brands TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.web_users,public.web_cars TO authenticated;
GRANT SELECT ON public.web_vehicle_locations TO authenticated;
REVOKE ALL ON public.web_bookings FROM anon;
GRANT SELECT ON public.web_bookings TO authenticated;
NOTIFY pgrst,'reload schema';


-- 002_booking_commands.sql
-- Ejecutar despues de 001_views.sql. Solo funciones sobre tablas de core.
-- Los triggers existentes de reserva siguen activos y pueden enviar PUSH reales.

SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.web_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.es_admin() OR NOT EXISTS (
  SELECT 1 FROM public.persona WHERE auth_id=auth.uid() AND NOT bloqueado
 ) THEN RAISE EXCEPTION 'Administrador autorizado requerido' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.web_create_booking(p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE bid uuid; cid integer; scheduled boolean; requested timestamptz; trip_cost numeric; fees numeric; rebate numeric;
BEGIN
 PERFORM public.web_require_admin();
 cid := (p_input->>'car_type_id')::integer;
 IF NOT EXISTS (SELECT 1 FROM public.categoria_vehiculo WHERE id=cid AND activo AND autorizado)
 THEN RAISE EXCEPTION 'Categoria invalida o inactiva'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.persona p JOIN public.persona_rol r ON r.id_persona=p.id
  WHERE p.id=(p_input->>'customer_id')::uuid AND NOT p.bloqueado AND r.rol IN ('cliente','empresa'))
 THEN RAISE EXCEPTION 'Cliente invalido o bloqueado'; END IF;
 IF p_input->>'booking_type' NOT IN ('reservation','immediate') OR p_input->>'booking_type' IS NULL
 THEN RAISE EXCEPTION 'Tipo de reserva invalido'; END IF;
 scheduled := p_input->>'booking_type'='reservation';
 requested := CASE WHEN scheduled THEN (p_input->>'booking_date')::timestamptz ELSE now() END;
 IF requested IS NULL OR (scheduled AND requested<=now()) THEN RAISE EXCEPTION 'Fecha de reserva invalida'; END IF;
 IF NOT coalesce((p_input#>>'{pickup,lat}')::numeric BETWEEN -90 AND 90,false)
 OR NOT coalesce((p_input#>>'{destination,lat}')::numeric BETWEEN -90 AND 90,false)
 OR NOT coalesce((p_input#>>'{pickup,lng}')::numeric BETWEEN -180 AND 180,false)
 OR NOT coalesce((p_input#>>'{destination,lng}')::numeric BETWEEN -180 AND 180,false)
 OR coalesce(trim(p_input#>>'{pickup,address}'),'')='' OR coalesce(trim(p_input#>>'{destination,address}'),'')=''
 THEN RAISE EXCEPTION 'Origen o destino invalido'; END IF;
 IF NOT coalesce((p_input->>'total_cost')::numeric>=0,false)
 OR NOT coalesce((p_input->>'distance_km')::numeric>=0,false)
 OR NOT coalesce((p_input->>'duration_min')::numeric>=0,false)
 THEN RAISE EXCEPTION 'Importe, distancia o duracion invalida'; END IF;
 fees := coalesce((p_input->>'convenience_fees')::numeric,0);
 rebate := coalesce((p_input->>'discount')::numeric,0);
 -- total_cost is the final amount shown by the web, inclusive of fees/discount.
 -- Core recalculates it on every write: costo_viaje + fees - descuento.
 trip_cost := (p_input->>'total_cost')::numeric-fees+rebate;
 IF fees<0 OR rebate<0 OR trip_cost<0 THEN RAISE EXCEPTION 'Desglose de importe invalido'; END IF;
 INSERT INTO public.reserva(id_cliente,id_categoria,estado,tipo_reserva,solicitado_en,
  origen_direccion,origen_lat,origen_lng,destino_direccion,destino_lat,destino_lng,
  distancia_km,duracion_seg,precio,precio_estimado,costo_total,ganancia_conductor,
  convenience_fees,descuento,modo_pago,observaciones,costo_viaje)
 VALUES ((p_input->>'customer_id')::uuid,cid,'NEW',
  (CASE WHEN scheduled THEN 'scheduled' ELSE 'immediate' END)::public.tipo_reserva,requested,
  p_input#>>'{pickup,address}',(p_input#>>'{pickup,lat}')::numeric,(p_input#>>'{pickup,lng}')::numeric,
  p_input#>>'{destination,address}',(p_input#>>'{destination,lat}')::numeric,(p_input#>>'{destination,lng}')::numeric,
  (p_input->>'distance_km')::numeric,round((p_input->>'duration_min')::numeric*60)::integer,
  (p_input->>'total_cost')::numeric,(p_input->>'estimate')::numeric,(p_input->>'total_cost')::numeric,
  coalesce((p_input->>'driver_share')::numeric,0),coalesce((p_input->>'convenience_fees')::numeric,0),
  coalesce((p_input->>'discount')::numeric,0),(p_input->>'payment_mode')::public.modo_pago,p_input->>'observations',trip_cost)
 RETURNING id INTO bid;
 RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.web_assignable_drivers(p_query text DEFAULT '') RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 RETURN QUERY SELECT to_jsonb(u)||jsonb_build_object('vehicle',to_jsonb(v))
 FROM public.web_users u JOIN public.perfil_conductor d ON d.id_persona=u.id
 JOIN LATERAL (SELECT c.id,c.make,c.model,c.plate,c.service_type FROM public.web_cars c
  WHERE c.driver_id=u.id AND c.is_active ORDER BY c.updated_at DESC,c.id LIMIT 1) v ON true
 WHERE d.aprobado AND d.activo AND NOT d.ocupado AND NOT u.blocked
 AND NOT EXISTS(SELECT 1 FROM public.reserva r WHERE r.id_conductor=u.id
  AND r.estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED'))
 AND concat_ws(' ',u.first_name,u.last_name,u.mobile,v.plate) ILIKE '%'||coalesce(p_query,'')||'%';
END $$;

CREATE OR REPLACE FUNCTION public.web_assign_booking(p_booking_id uuid,p_driver_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.reserva%rowtype; d public.perfil_conductor%rowtype; car uuid;
BEGIN
 PERFORM public.web_require_admin();
 SELECT * INTO STRICT d FROM public.perfil_conductor WHERE id_persona=p_driver_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.reserva WHERE id=p_booking_id FOR UPDATE;
 IF r.estado NOT IN ('NEW','PENDING') OR r.id_conductor IS NOT NULL THEN RAISE EXCEPTION 'La reserva ya no esta disponible'; END IF;
 IF NOT d.aprobado OR NOT d.activo OR d.ocupado OR EXISTS(SELECT 1 FROM public.persona WHERE id=p_driver_id AND bloqueado)
 OR EXISTS(SELECT 1 FROM public.reserva WHERE id_conductor=p_driver_id AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED'))
 THEN RAISE EXCEPTION 'Conductor no disponible'; END IF;
 SELECT id INTO car FROM public.vehiculo WHERE id_conductor=p_driver_id AND activo AND id_categoria=r.id_categoria
 ORDER BY actualizado_en DESC,id LIMIT 1 FOR UPDATE;
 IF car IS NULL THEN RAISE EXCEPTION 'El conductor no tiene vehiculo activo de esta categoria'; END IF;
 UPDATE public.reserva SET id_conductor=p_driver_id,id_vehiculo=car,estado='ACCEPTED' WHERE id=r.id;
 UPDATE public.perfil_conductor SET ocupado=true WHERE id_persona=p_driver_id;
END $$;

CREATE OR REPLACE FUNCTION public.web_cancel_booking(p_booking_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.reserva%rowtype; driver uuid;
BEGIN
 PERFORM public.web_require_admin();
 SELECT id_conductor INTO driver FROM public.reserva WHERE id=p_booking_id;
 IF driver IS NOT NULL THEN PERFORM 1 FROM public.perfil_conductor WHERE id_persona=driver FOR UPDATE; END IF;
 SELECT * INTO STRICT r FROM public.reserva WHERE id=p_booking_id FOR UPDATE;
 IF r.id_conductor IS DISTINCT FROM driver THEN RAISE EXCEPTION 'La reserva cambio; vuelva a consultar'; END IF;
 IF r.estado IN ('COMPLETE','PAID','CANCELLED') THEN RAISE EXCEPTION 'Reserva finalizada'; END IF;
 UPDATE public.reserva SET estado='CANCELLED',cancelado_por='admin',cancelado_en=now(),
  motivo_cancelacion=coalesce(nullif(trim(p_reason),''),'Cancelada por administrador') WHERE id=r.id;
 IF driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reserva WHERE id_conductor=driver
  AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED')) THEN
  UPDATE public.perfil_conductor SET ocupado=false WHERE id_persona=driver;
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.web_require_admin(),public.web_create_booking(jsonb),
 public.web_assignable_drivers(text),public.web_assign_booking(uuid,uuid),public.web_cancel_booking(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_require_admin(),public.web_create_booking(jsonb),
 public.web_assignable_drivers(text),public.web_assign_booking(uuid,uuid),public.web_cancel_booking(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';


-- 003_profile_commands.sql
-- Despues de 001 y 002. Sin tablas nuevas. No cambia triggers/vistas de la app.

SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.web_users_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_ok boolean; changed jsonb; k text; val text; city_id integer; doc_id integer; n integer; doc record;
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Use el alta autenticada para crear perfiles'; END IF;
 SELECT coalesce(public.es_admin() AND NOT p.bloqueado,false) INTO admin_ok FROM public.persona p WHERE p.auth_id=auth.uid();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(admin_ok,false) AND NOT EXISTS(SELECT 1 FROM public.persona p
  LEFT JOIN public.perfil_conductor d ON d.id_persona=p.id WHERE p.id=old.id AND p.auth_id=auth.uid()
  AND (NOT p.bloqueado OR d.aprobado=false)) THEN RAISE EXCEPTION 'Perfil no autorizado' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.persona WHERE id=old.id FOR UPDATE;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO changed FROM jsonb_each(to_jsonb(new)) e
 WHERE e.value IS DISTINCT FROM to_jsonb(old)->e.key AND e.key<>'updated_at';
 FOR k IN SELECT jsonb_object_keys(changed) LOOP
  IF NOT (k=ANY(ARRAY['first_name','last_name','mobile','city','document_number','document_type','license_number',
   'profile_image','verify_id_image','verify_id_image_bk','license_image','license_image_back','bank_number',
   'company_name','car_type','approved','blocked','is_active','driver_active_status']))
  THEN RAISE EXCEPTION 'Campo no editable en core: %',k; END IF;
  IF NOT coalesce(admin_ok,false) AND k=ANY(ARRAY['approved','blocked','is_active','driver_active_status','company_name','car_type'])
  THEN RAISE EXCEPTION 'Campo reservado al administrador: %',k USING ERRCODE='42501'; END IF;
 END LOOP;
 IF old.auth_id=auth.uid() AND (new.blocked OR NOT new.is_active) THEN
  IF coalesce(admin_ok,false) THEN RAISE EXCEPTION 'No puede deshabilitar su propio administrador'; END IF;
 END IF;
 IF changed ? 'city' THEN
  IF nullif(trim(new.city),'') IS NOT NULL THEN
   SELECT count(*),min(id) INTO n,city_id FROM public.ciudad WHERE lower(nombre)=lower(trim(new.city));
   IF n<>1 THEN RAISE EXCEPTION 'Ciudad inexistente o ambigua: %',new.city; END IF;
  END IF;
  UPDATE public.persona SET id_ciudad_actual=city_id WHERE id=old.id;
 END IF;
 IF changed ? 'document_type' THEN
  IF nullif(trim(new.document_type),'') IS NOT NULL THEN
   SELECT count(*),min(id) INTO n,doc_id FROM public.tipo_documento
   WHERE lower(acronimo)=lower(trim(new.document_type)) OR lower(nombre)=lower(trim(new.document_type)) OR id::text=new.document_type;
   IF n<>1 THEN RAISE EXCEPTION 'Tipo de documento inexistente o ambiguo'; END IF;
  END IF;
  UPDATE public.persona SET id_tipo_documento=doc_id WHERE id=old.id;
 END IF;
 UPDATE public.persona SET nombre=new.first_name,apellido=new.last_name,telefono=new.mobile,
  numero_documento=new.document_number,imagen_perfil=new.profile_image,bloqueado=new.blocked WHERE id=old.id;
 UPDATE public.perfil_conductor SET numero_licencia=new.license_number,numero_cuenta_bancaria=new.bank_number,
  aprobado=new.approved,activo=new.is_active,en_servicio=new.driver_active_status,tipo_servicio=new.car_type WHERE id_persona=old.id;
 IF changed ? 'company_name' THEN UPDATE public.perfil_empresa SET razon_social=new.company_name WHERE id_persona=old.id; END IF;
 FOR doc IN SELECT * FROM (VALUES
  ('verify_id_image','identidad','frontal'),('verify_id_image_bk','identidad','posterior'),
  ('license_image','licencia','frontal'),('license_image_back','licencia','posterior')) AS x(field,kind,side)
 LOOP
  IF changed ? doc.field THEN
   val:=changed->>doc.field;
   IF nullif(trim(val),'') IS NULL THEN RAISE EXCEPTION 'Para documentos, adjunte un reemplazo; no se elimina el historial'; END IF;
   INSERT INTO public.documento_persona(id_persona,tipo,lado,storage_path)
   VALUES(old.id,doc.kind,doc.side::public.lado_documento,val);
  END IF;
 END LOOP;
 SELECT * INTO new FROM public.web_users WHERE id=old.id;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS web_users_write ON public.web_users;
CREATE TRIGGER web_users_write INSTEAD OF UPDATE ON public.web_users FOR EACH ROW EXECUTE FUNCTION public.web_users_write();

CREATE OR REPLACE FUNCTION public.web_cars_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_ok boolean; changed jsonb; k text; cid integer; brand uuid; n integer; doc record; val text; expiry date;
BEGIN
 SELECT coalesce(public.es_admin() AND NOT p.bloqueado,false) INTO admin_ok FROM public.persona p WHERE p.auth_id=auth.uid();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(admin_ok,false) AND NOT EXISTS (SELECT 1 FROM public.persona p JOIN public.perfil_conductor d ON d.id_persona=p.id
  WHERE p.id=new.driver_id AND p.auth_id=auth.uid() AND (NOT p.bloqueado OR NOT d.aprobado))
 THEN RAISE EXCEPTION 'Vehiculo no autorizado' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF new.id IS DISTINCT FROM old.id OR new.driver_id IS DISTINCT FROM old.driver_id THEN
   RAISE EXCEPTION 'No se permite cambiar identidad o propietario del vehiculo'; END IF;
  PERFORM 1 FROM public.vehiculo WHERE id=old.id FOR UPDATE;
 END IF;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO changed FROM jsonb_each(to_jsonb(new)) e
 WHERE (TG_OP='INSERT' AND e.value<>'null'::jsonb) OR (TG_OP='UPDATE' AND e.value IS DISTINCT FROM to_jsonb(old)->e.key);
 FOR k IN SELECT jsonb_object_keys(changed) LOOP
  IF NOT (k=ANY(ARRAY['id','driver_id','make','model','plate','color','capacity','fuel_type','transmission','vehicle_year',
   'service_type','car_type_id','is_active','features','car_image_1','car_image_2','created_at','updated_at',
   'soat_image','soat_expiry_date','tecnomecanica_image','tecnomecanica_expiry_date',
   'card_prop_image','card_prop_image_back','camara_comercio_image']))
  THEN RAISE EXCEPTION 'Campo de vehiculo no editable: %',k; END IF;
 END LOOP;
 IF NOT coalesce(admin_ok,false) AND TG_OP='UPDATE' AND changed ? 'is_active'
 THEN RAISE EXCEPTION 'Solo el administrador cambia la activacion'; END IF;
 IF TG_OP='INSERT' OR changed ? 'service_type' OR changed ? 'car_type_id' THEN
  SELECT count(*),min(id) INTO n,cid FROM public.categoria_vehiculo WHERE activo AND autorizado AND
   (id::text=CASE WHEN changed ? 'service_type' THEN new.service_type ELSE new.car_type_id::text END OR lower(nombre)=lower(new.service_type)
    OR regexp_replace(lower(nombre),'[^a-z0-9]+','_','g')=new.service_type);
  IF n<>1 THEN RAISE EXCEPTION 'Seleccione una categoria valida de core'; END IF;
 ELSE SELECT id_categoria INTO cid FROM public.vehiculo WHERE id=old.id; END IF;
 IF TG_OP='INSERT' OR changed ? 'make' THEN
  SELECT count(*),(array_agg(id))[1] INTO n,brand FROM public.marca_vehiculo WHERE activo AND lower(nombre)=lower(trim(new.make));
  IF n<>1 THEN RAISE EXCEPTION 'Seleccione una marca existente y activa'; END IF;
 ELSE SELECT id_marca INTO brand FROM public.vehiculo WHERE id=old.id; END IF;
 new.plate:=regexp_replace(upper(trim(new.plate)),'[^A-Z0-9]','','g');
 IF new.plate IS NULL OR length(new.plate)<3 OR length(new.plate)>20 THEN RAISE EXCEPTION 'Placa invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-plate:'||new.plate,0));
 IF EXISTS(SELECT 1 FROM public.vehiculo WHERE regexp_replace(upper(placa),'[^A-Z0-9]','','g')=new.plate
  AND (TG_OP='INSERT' OR id<>old.id)) THEN RAISE EXCEPTION 'La placa ya existe' USING ERRCODE='23505'; END IF;
 IF TG_OP='INSERT' THEN
  new.id:=gen_random_uuid();
  INSERT INTO public.vehiculo(id,id_conductor,id_categoria,id_marca,placa,linea,capacidad,activo)
  VALUES(new.id,new.driver_id,cid,brand,new.plate,new.model,coalesce(new.capacity,4),true);
 END IF;
 UPDATE public.vehiculo SET id_categoria=cid,id_marca=brand,placa=new.plate,linea=new.model,color=new.color,
  anio=new.vehicle_year,tipo_combustible=new.fuel_type,transmision=new.transmission,
  capacidad=coalesce(new.capacity,4),activo=coalesce(new.is_active,true),
  tipo_servicio=(SELECT nombre FROM public.categoria_vehiculo WHERE id=cid),
  foto_1=new.car_image_1,foto_2=new.car_image_2,caracteristicas=new.features WHERE id=new.id;
 FOR doc IN SELECT * FROM (VALUES
  ('soat_image','soat','frontal','soat_expiry_date'),('tecnomecanica_image','tecnomecanica','frontal','tecnomecanica_expiry_date'),
  ('card_prop_image','tarjeta_propiedad','frontal',NULL),('card_prop_image_back','tarjeta_propiedad','posterior',NULL),
  ('camara_comercio_image','camara_comercio','frontal',NULL)) AS x(field,kind,side,expiry_field)
 LOOP
  IF changed ? doc.field OR (doc.expiry_field IS NOT NULL AND changed ? doc.expiry_field) THEN
   val:=to_jsonb(new)->>doc.field; expiry:=(to_jsonb(new)->>doc.expiry_field)::date;
   IF nullif(trim(val),'') IS NULL THEN RAISE EXCEPTION 'Adjunte el documento antes de guardar su vencimiento'; END IF;
   INSERT INTO public.documento_vehiculo(id_vehiculo,tipo,lado,storage_path,fecha_vencimiento)
   VALUES(new.id,doc.kind::public.tipo_documento_vehiculo,doc.side::public.lado_documento,val,expiry);
  END IF;
 END LOOP;
 SELECT * INTO new FROM public.web_cars WHERE id=new.id;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS web_cars_write ON public.web_cars;
CREATE TRIGGER web_cars_write INSTEAD OF INSERT OR UPDATE ON public.web_cars FOR EACH ROW EXECUTE FUNCTION public.web_cars_write();

CREATE OR REPLACE FUNCTION public.web_admin_update_profile(p_id uuid,p_user jsonb,p_car jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE u public.web_users%rowtype; c public.web_cars%rowtype; k text;
BEGIN
 PERFORM public.web_require_admin();
 PERFORM 1 FROM public.persona WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT u FROM public.web_users WHERE id=p_id;
 FOR k IN SELECT jsonb_object_keys(p_user) LOOP
  IF NOT to_jsonb(u) ? k THEN RAISE EXCEPTION 'Campo de perfil desconocido: %',k; END IF;
  IF p_user->k IS DISTINCT FROM to_jsonb(u)->k AND NOT (k=ANY(ARRAY[
   'first_name','last_name','mobile','city','document_type','document_number','license_number',
   'blocked','approved','is_active','company_name','bank_number','car_type'])) THEN
   RAISE EXCEPTION 'Campo no editable por esta operacion: %',k;
  END IF;
 END LOOP;
 u:=jsonb_populate_record(u,p_user);
 IF u.id<>p_id THEN RAISE EXCEPTION 'Identidad inmutable'; END IF;
 UPDATE public.web_users SET first_name=u.first_name,last_name=u.last_name,mobile=u.mobile,city=u.city,
  document_type=u.document_type,document_number=u.document_number,license_number=u.license_number,
  blocked=u.blocked,approved=u.approved,is_active=u.is_active,company_name=u.company_name,
  bank_number=u.bank_number,car_type=u.car_type WHERE id=p_id RETURNING * INTO u;
 IF p_car IS NOT NULL THEN
  SELECT * INTO STRICT c FROM public.web_cars WHERE id=(p_car->>'id')::uuid AND driver_id=p_id;
  FOR k IN SELECT jsonb_object_keys(p_car) LOOP
   IF NOT to_jsonb(c) ? k AND k<>'features_car_type' THEN RAISE EXCEPTION 'Campo de vehiculo desconocido: %',k; END IF;
  END LOOP;
  c:=jsonb_populate_record(c,p_car);
  UPDATE public.web_cars SET make=c.make,model=c.model,plate=c.plate,color=c.color,fuel_type=c.fuel_type,
   transmission=c.transmission,capacity=c.capacity,service_type=c.service_type,is_active=c.is_active
  WHERE id=c.id AND driver_id=p_id RETURNING * INTO c;
 END IF;
 RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
REVOKE ALL ON FUNCTION public.web_users_write(),public.web_cars_write() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.web_admin_update_profile(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_admin_update_profile(uuid,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';


-- 004_onboarding.sql
-- Requiere 001,002,003. Altas usan Auth + persona/perfiles/vehiculo existentes.
-- Ademas del SQL se debe desplegar la Edge Function core-create-user en core.

SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.web_insert_profile(p_auth_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid; car public.web_cars%rowtype; u public.web_users%rowtype; role_name text:=p_input->>'user_type';
BEGIN
 IF role_name IS NULL OR role_name NOT IN ('driver','customer','company') THEN RAISE EXCEPTION 'Rol invalido'; END IF;
 IF nullif(trim(p_input->>'mobile'),'') IS NULL THEN RAISE EXCEPTION 'Telefono obligatorio'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-auth:'||p_auth_id::text,0));
 IF EXISTS(SELECT 1 FROM public.persona WHERE auth_id=p_auth_id) THEN RAISE EXCEPTION 'Ya existe un perfil para esta cuenta'; END IF;
 INSERT INTO public.persona(auth_id,nombre,apellido,email,telefono,bloqueado,verificado,codigo_referido_usado)
 VALUES(p_auth_id,trim(p_input->>'first_name'),trim(p_input->>'last_name'),lower(trim(p_input->>'email')),
  trim(p_input->>'mobile'),role_name='driver',false,nullif(trim(p_input->>'referral_id'),'')) RETURNING id INTO pid;
 INSERT INTO public.persona_rol(id_persona,rol) VALUES(pid,
  (CASE role_name WHEN 'driver' THEN 'conductor' WHEN 'company' THEN 'empresa' ELSE 'cliente' END)::public.rol_persona);
 IF role_name='driver' THEN INSERT INTO public.perfil_conductor(id_persona,aprobado,activo,en_servicio) VALUES(pid,false,true,false);
 ELSIF role_name='company' THEN INSERT INTO public.perfil_empresa(id_persona,razon_social)
  VALUES(pid,coalesce(nullif(trim(p_input->>'company_name'),''),trim(concat_ws(' ',p_input->>'first_name',p_input->>'last_name'))));
 ELSE INSERT INTO public.perfil_cliente(id_persona) VALUES(pid); END IF;
 INSERT INTO public.wallet(id_persona) VALUES(pid);
 UPDATE public.web_users SET city=nullif(p_input->>'city',''),document_type=nullif(p_input->>'document_type',''),
  document_number=nullif(p_input->>'document_number',''),bank_number=nullif(p_input->>'bank_number','')
 WHERE id=pid RETURNING * INTO u;
 IF role_name='driver' AND nullif(p_input->>'plate','') IS NOT NULL THEN
  INSERT INTO public.web_cars(driver_id,make,model,plate,service_type,vehicle_year)
  VALUES(pid,p_input->>'make',p_input->>'model',p_input->>'plate',p_input->>'vehicle_type',nullif(p_input->>'vehicle_year','')::integer)
  RETURNING * INTO car;
 END IF;
 RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN car.id IS NULL THEN NULL ELSE to_jsonb(car) END);
END $$;
REVOKE ALL ON FUNCTION public.web_insert_profile(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.web_admin_create_profile(p_auth_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=lower(trim(p_input->>'email')))
 THEN RAISE EXCEPTION 'La cuenta Auth no coincide con el perfil'; END IF;
 RETURN public.web_insert_profile(p_auth_id,p_input);
END $$;

CREATE OR REPLACE FUNCTION public.web_ensure_driver_profile() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE account auth.users%rowtype; profile public.web_users%rowtype; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-auth:'||auth.uid()::text,0));
 SELECT * INTO profile FROM public.web_users WHERE auth_id=auth.uid();
 IF profile.id IS NOT NULL THEN RETURN to_jsonb(profile); END IF;
 SELECT * INTO STRICT account FROM auth.users WHERE id=auth.uid();
 IF account.email_confirmed_at IS NULL OR account.raw_user_meta_data->>'user_type' IS DISTINCT FROM 'driver'
 THEN RAISE EXCEPTION 'Confirme el correo del registro de conductor'; END IF;
 result:=public.web_insert_profile(auth.uid(),jsonb_build_object(
  'user_type','driver','email',account.email,'first_name',account.raw_user_meta_data->>'first_name',
  'last_name',account.raw_user_meta_data->>'last_name','mobile',account.raw_user_meta_data->>'mobile',
  'city',account.raw_user_meta_data->>'city','referral_id',account.raw_user_meta_data->>'referral_id'));
 RETURN result->'user';
END $$;
REVOKE ALL ON FUNCTION public.web_admin_create_profile(uuid,jsonb),public.web_ensure_driver_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_admin_create_profile(uuid,jsonb),public.web_ensure_driver_profile() TO authenticated;
NOTIFY pgrst,'reload schema';


-- 005_notifications.sql
-- Cola pg_net y auditoria existentes. No crea tablas. queued NO confirma entrega.

CREATE OR REPLACE VIEW public.web_push_history WITH (security_invoker=true) AS
SELECT tipo_evento AS request_id,titulo AS title,cuerpo AS body,estado AS status,
 count(*) AS recipients,min(enviado_en) AS created_at FROM public.evento_notificacion
WHERE tipo_evento LIKE 'web:%' AND public.es_admin() GROUP BY tipo_evento,titulo,cuerpo,estado;
REVOKE ALL ON public.web_push_history FROM anon;
GRANT SELECT ON public.web_push_history TO authenticated;
CREATE OR REPLACE FUNCTION public.web_send_mass_push(p_request_id uuid,p_title text,p_body text,
 p_audience text,p_platform text) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE tag text:='web:'||p_request_id::text; n integer:=0; messages jsonb:='[]'; device record;
BEGIN
 PERFORM public.web_require_admin();
 IF p_request_id IS NULL OR coalesce(length(trim(p_title)),0) NOT BETWEEN 1 AND 100
 OR coalesce(length(trim(p_body)),0) NOT BETWEEN 1 AND 1000
 OR p_audience IS NULL OR p_audience NOT IN ('driver','customer')
 OR p_platform IS NULL OR p_platform NOT IN ('ALL','ANDROID','IOS') THEN RAISE EXCEPTION 'Notificacion invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tag,0));
 SELECT count(*) INTO n FROM public.evento_notificacion WHERE tipo_evento=tag;
 IF n>0 THEN
  IF EXISTS(SELECT 1 FROM public.evento_notificacion WHERE tipo_evento=tag AND (titulo<>trim(p_title) OR cuerpo<>trim(p_body)))
  THEN RAISE EXCEPTION 'Identificador ya utilizado'; END IF;
  RETURN n;
 END IF;
 FOR device IN SELECT dp.* FROM public.dispositivo_push dp JOIN public.persona p ON p.id=dp.id_persona
  WHERE NOT p.bloqueado AND dp.push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$'
  AND (p_platform='ALL' OR upper(dp.plataforma::text)=p_platform)
  AND EXISTS(SELECT 1 FROM public.persona_rol pr WHERE pr.id_persona=p.id
   AND pr.rol::text=CASE p_audience WHEN 'driver' THEN 'conductor' ELSE 'cliente' END) ORDER BY dp.id
 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'Mas de 10000 dispositivos: requiere segmentar'; END IF;
  -- Es el canal Android de la app; no es una dependencia del esquema SQL retirado.
  messages:=messages||jsonb_build_array(jsonb_build_object('to',device.push_token,'title',trim(p_title),
   'body',trim(p_body),'sound','default','channelId','bookings-v2','priority','high',
   'data',jsonb_build_object('type','announcement','requestId',p_request_id)));
  INSERT INTO public.evento_notificacion(id_persona,tipo_evento,titulo,cuerpo,estado)
  VALUES(device.id_persona,tag,trim(p_title),trim(p_body),'queued');
  IF jsonb_array_length(messages)=100 THEN
   PERFORM net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=messages,headers:='{"Content-Type":"application/json"}'::jsonb);
   messages:='[]';
  END IF;
 END LOOP;
 IF jsonb_array_length(messages)>0 THEN
  PERFORM net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=messages,headers:='{"Content-Type":"application/json"}'::jsonb);
 END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.web_send_mass_push(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_send_mass_push(uuid,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';


-- 006_support_views.sql
-- Membresias, referidos y quejas: adaptadores sobre las tablas existentes.

SET LOCAL lock_timeout='5s';
CREATE OR REPLACE VIEW public.web_memberships WITH (security_invoker=true) AS
SELECT id AS uid,id_conductor AS conductor,estado AS status,costo,fecha_inicio,
 fecha_fin AS fecha_terminada,periodo_dias AS periodo,creado_en AS created_at,
 actualizado_en AS updated_at FROM public.membresia;

CREATE OR REPLACE VIEW public.web_referral_codes WITH (security_invoker=true) AS
SELECT c.id,c.id_persona AS driver_id,c.codigo AS referral_code,c.activo AS is_active,
 (SELECT count(*) FROM public.referido r WHERE r.id_codigo_referido=c.id) AS total_referrals,
 c.creado_en AS created_at,
 (SELECT jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
  'email',u.email,'mobile',u.mobile,'user_type',u.user_type) FROM public.web_users u WHERE u.id=c.id_persona) AS driver
FROM public.codigo_referido c;

CREATE OR REPLACE VIEW public.web_referrals WITH (security_invoker=true) AS
SELECT r.id,r.id_codigo_referido AS referral_code_id,r.id_referente AS referrer_id,
 r.id_conductor_referido AS referred_driver_id,r.codigo AS referral_code,r.estado AS status,
 r.recompensa_reclamada AS reward_claimed,r.referido_en AS referred_at,
 (SELECT jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
  'email',u.email,'mobile',u.mobile,'user_type',u.user_type,'approved',u.approved)
  FROM public.web_users u WHERE u.id=r.id_conductor_referido) AS referred_driver,
 (SELECT jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
  'email',u.email,'mobile',u.mobile,'user_type',u.user_type)
  FROM public.web_users u WHERE u.id=r.id_referente) AS referrer_driver
FROM public.referido r;

CREATE OR REPLACE VIEW public.web_complaints WITH (security_invoker=true) AS
SELECT q.id,q.id_reportante AS user_id,q.id_reportado AS reported_user_id,q.id_reserva AS booking_id,
 q.tipo AS complaint_type,q.asunto AS subject,q.cuerpo AS body,q.prioridad AS priority,
 q.estado AS status,q.evidencias AS evidence_urls,q.respuesta_admin AS admin_response,
 q.id_resuelto_por AS resolved_by,q.resuelto_en AS resolved_at,q.creado_en AS created_at,q.actualizado_en AS updated_at,
 (SELECT u.user_type FROM public.web_users u WHERE u.id=q.id_reportante) AS user_type
FROM public.queja q;
REVOKE ALL ON public.web_memberships,public.web_referrals,public.web_referral_codes,public.web_complaints FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.web_memberships TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.web_referrals,public.web_referral_codes,public.web_complaints TO authenticated;

CREATE OR REPLACE FUNCTION public.web_validate_referral(p_code text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('id',id,'driver_id',id_persona,'referral_code',codigo,'is_active',activo)
 FROM public.codigo_referido WHERE codigo=upper(trim(p_code)) AND activo LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.web_validate_referral(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.web_validate_referral(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.web_reconcile_referrals() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 PERFORM public.web_require_admin();
 UPDATE public.codigo_referido c SET total_referidos=(SELECT count(*) FROM public.referido r WHERE r.id_codigo_referido=c.id);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.web_reconcile_referrals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_reconcile_referrals() TO authenticated;
NOTIFY pgrst,'reload schema';


-- 007_account_access.sql

CREATE OR REPLACE FUNCTION public.web_bind_auth(p_id uuid,p_auth_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.persona%rowtype; result jsonb;
BEGIN
 PERFORM public.web_require_admin();
 SELECT * INTO STRICT p FROM public.persona WHERE id=p_id FOR UPDATE;
 IF p.auth_id IS NOT NULL AND p.auth_id<>p_auth_id THEN RAISE EXCEPTION 'Perfil ya vinculado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=lower(p.email))
 THEN RAISE EXCEPTION 'La cuenta Auth no corresponde al correo del perfil'; END IF;
 UPDATE public.persona SET auth_id=p_auth_id WHERE id=p_id;
 SELECT to_jsonb(u) INTO result FROM public.web_users u WHERE u.id=p_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.web_bind_auth(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_bind_auth(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';


-- 008_storage_access.sql
-- Solo permisos sobre Storage existente. NO crea buckets ni cambia su privacidad.

CREATE OR REPLACE FUNCTION public.web_storage_owner(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.persona p LEFT JOIN public.perfil_conductor d ON d.id_persona=p.id
  WHERE p.auth_id=auth.uid() AND (NOT p.bloqueado OR d.aprobado=false)
  AND ((public.es_admin() AND NOT p.bloqueado)
   OR split_part(p_name,'/',1) IN (p.id::text,p.auth_id::text)
   OR EXISTS (SELECT 1 FROM public.vehiculo v WHERE v.id_conductor=p.id AND v.id::text=split_part(p_name,'/',1)))
 )
$$;
REVOKE ALL ON FUNCTION public.web_storage_owner(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_storage_owner(text) TO authenticated;
DROP POLICY IF EXISTS web_core_storage_read ON storage.objects;
CREATE POLICY web_core_storage_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));
DROP POLICY IF EXISTS web_core_storage_insert ON storage.objects;
CREATE POLICY web_core_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));
DROP POLICY IF EXISTS web_core_storage_update ON storage.objects;
CREATE POLICY web_core_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name))
WITH CHECK (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));

COMMIT;
