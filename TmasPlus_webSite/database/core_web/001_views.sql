-- CORE ONLY: revisar y ejecutar en zvplcamcyldcquxqnftb, antes de 002_commands.sql.
-- No ejecutar schema_aplicacioncore.sql: es un dump de referencia, no una migracion.
-- No crea tablas, no copia datos, no modifica las vistas que consume la app.
BEGIN;
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
COMMIT;
