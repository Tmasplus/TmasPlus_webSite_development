-- One-time canonicalization of the existing synthetic Prueba fixtures only.
-- Keeps profile/vehicle UUIDs; the original legacy rows are not changed/deleted.
DO $guard$ BEGIN
  IF EXISTS (SELECT 1 FROM public.persona) OR EXISTS (SELECT 1 FROM public.vehiculo)
    OR EXISTS (SELECT 1 FROM public.categoria_vehiculo) THEN
    RAISE EXCEPTION 'Core is not empty: explicit reconciliation required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE email IS NULL OR email NOT LIKE '%@tmasplus.test') THEN
    RAISE EXCEPTION 'Only synthetic Prueba profiles may be copied by this migration';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users WHERE user_type NOT IN ('admin','driver','customer')
    OR mobile IS NULL OR length(mobile)>30) THEN
    RAISE EXCEPTION 'Unsupported fixture role/phone; do not infer identity data';
  END IF;
END $guard$;

CREATE TABLE booking_v2.core_category_ids (
  booking_category_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  core_category_id integer NOT NULL UNIQUE REFERENCES public.categoria_vehiculo(id) ON DELETE RESTRICT
);
ALTER TABLE booking_v2.core_category_ids ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON booking_v2.core_category_ids FROM PUBLIC,anon,authenticated;

INSERT INTO public.persona(id,auth_id,nombre,apellido,telefono,email,imagen_perfil,
  numero_documento,bloqueado,verificado,creado_en,actualizado_en)
SELECT id,auth_id,first_name,last_name,mobile,email,profile_image,document_number,
  coalesce(blocked,false),coalesce(is_verified,false),coalesce(created_at,now()),coalesce(updated_at,now())
FROM public.users;
INSERT INTO public.persona_rol(id_persona,rol)
SELECT id,(CASE user_type WHEN 'driver' THEN 'conductor' WHEN 'customer' THEN 'cliente'
  ELSE 'admin' END)::public.rol_persona FROM public.users;
INSERT INTO public.perfil_conductor(id_persona,aprobado,activo,en_servicio,numero_licencia)
SELECT id,coalesce(approved,false),coalesce(is_active,true),coalesce(driver_active_status,false),license_number
FROM public.users WHERE user_type='driver';
INSERT INTO public.perfil_cliente(id_persona)
SELECT id FROM public.users WHERE user_type='customer';

DO $categories$
DECLARE old public.car_types%rowtype; category_id integer;
BEGIN
  FOR old IN SELECT * FROM public.car_types ORDER BY id LOOP
    INSERT INTO public.categoria_vehiculo(nombre,descripcion,imagen_url,capacidad,activo,
      tarifa_base,tarifa_base_inter,valor_km,valor_km_inter,valor_hora,valor_hora_inter,
      tarifa_minima,tarifa_minima_inter,delta_aeropuerto,delta_aeropuerto_prog,
      convenience_fee,convenience_fee_tipo,umbral_intermunicipal_km)
    VALUES(old.name,old.description,old.image,coalesce(old.capacity,4),coalesce(old.is_active,false),
      coalesce(old.base_price,0),coalesce(old.base_price_inter,0),coalesce(old.price_per_km,0),coalesce(old.price_per_km_inter,0),
      coalesce(old.rate_per_hour,old.valor_hora,0),coalesce(old.rate_per_hour_inter,0),
      coalesce(old.min_fare,0),coalesce(old.min_fare_inter,0),coalesce(old.delta_aeropuerto,0),coalesce(old.delta_aeropuerto_prog,0),
      coalesce(old.convenience_fee,0),coalesce(old.convenience_fee_type,'percentage')::public.tipo_descuento,
      coalesce(old.umbral_intermunicipal_km,29)) RETURNING id INTO category_id;
    INSERT INTO booking_v2.core_category_ids VALUES(old.id,category_id);
  END LOOP;
END $categories$;

INSERT INTO public.marca_vehiculo(nombre)
SELECT DISTINCT make FROM public.cars WHERE make IS NOT NULL;
DO $cars$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.cars c WHERE
      (SELECT count(*) FROM public.car_types t WHERE booking_v2.category_matches(t.id,c.service_type))<>1
  ) THEN RAISE EXCEPTION 'Vehicle category is ambiguous; explicit mapping required'; END IF;
END $cars$;
INSERT INTO public.vehiculo(id,id_conductor,id_categoria,id_marca,linea,color,placa,capacidad,tipo_servicio,activo)
SELECT c.id,c.driver_id,m.core_category_id,b.id,c.model,c.color,c.plate,coalesce(c.capacity,4),c.service_type,coalesce(c.is_active,false)
FROM public.cars c
JOIN public.car_types t ON booking_v2.category_matches(t.id,c.service_type)
JOIN booking_v2.core_category_ids m ON m.booking_category_id=t.id
LEFT JOIN public.marca_vehiculo b ON b.nombre=c.make;
INSERT INTO public.membresia(id,id_conductor,estado,fecha_inicio,fecha_fin)
SELECT m.uid,u.id,upper(m.status)::public.estado_membresia,m.fecha_inicio,m.fecha_terminada
FROM public.memberships m JOIN public.users u ON coalesce(u.auth_id,u.id)=m.conductor;

-- Internal compatibility projections: business records live in core, not here.
CREATE VIEW booking_v2.core_users WITH (security_invoker=true) AS
SELECT p.id,p.auth_id,p.nombre AS first_name,p.apellido AS last_name,p.telefono AS mobile,p.email,
  p.imagen_perfil AS profile_image,p.bloqueado AS blocked,p.verificado AS is_verified,
  CASE WHEN 'admin'=ANY(r.roles) THEN 'admin' WHEN 'conductor'=ANY(r.roles) THEN 'driver'
    WHEN 'empresa'=ANY(r.roles) THEN 'company' ELSE 'customer' END::text AS user_type,
  CASE WHEN 'admin'=ANY(r.roles) THEN true ELSE coalesce(d.aprobado AND d.activo,false) END AS approved,
  coalesce(d.en_servicio,false) AND coalesce(d.activo,false) AS driver_active_status,
  p.creado_en AS created_at,p.actualizado_en AS updated_at
FROM public.persona p
JOIN LATERAL (SELECT array_agg(rol::text) AS roles FROM public.persona_rol WHERE id_persona=p.id) r ON r.roles IS NOT NULL
LEFT JOIN public.perfil_conductor d ON d.id_persona=p.id;
CREATE VIEW booking_v2.core_cars WITH (security_invoker=true) AS
SELECT v.id,v.id_conductor AS driver_id,b.nombre AS make,v.linea AS model,v.color,v.placa AS plate,
  v.capacidad AS capacity,v.activo AS is_active,c.nombre AS service_type,
  v.creado_en AS created_at,v.actualizado_en AS updated_at
FROM public.vehiculo v LEFT JOIN public.marca_vehiculo b ON b.id=v.id_marca
LEFT JOIN public.categoria_vehiculo c ON c.id=v.id_categoria;
CREATE VIEW booking_v2.core_car_types WITH (security_invoker=true) AS
SELECT m.booking_category_id AS id,c.id AS core_id,c.nombre AS name,c.descripcion AS description,
  c.imagen_url AS image,c.capacidad AS capacity,c.activo AS is_active,
  c.tarifa_base AS base_price,c.tarifa_base_inter AS base_price_inter,
  c.valor_km AS price_per_km,c.valor_km_inter AS price_per_km_inter,
  c.valor_hora AS rate_per_hour,c.valor_hora,c.valor_hora_inter AS rate_per_hour_inter,
  c.tarifa_minima AS min_fare,c.tarifa_minima_inter AS min_fare_inter,
  c.delta_aeropuerto,c.delta_aeropuerto_prog,c.convenience_fee,
  c.convenience_fee_tipo::text AS convenience_fee_type,c.umbral_intermunicipal_km,
  c.creado_en AS created_at,c.actualizado_en AS updated_at
FROM public.categoria_vehiculo c JOIN booking_v2.core_category_ids m ON m.core_category_id=c.id;
CREATE VIEW booking_v2.core_memberships WITH (security_invoker=true) AS
SELECT m.id,coalesce(p.auth_id,p.id) AS conductor,m.estado::text AS status,
  m.fecha_inicio,m.fecha_fin AS fecha_terminada
FROM public.membresia m JOIN public.persona p ON p.id=m.id_conductor;
REVOKE ALL ON booking_v2.core_users,booking_v2.core_cars,booking_v2.core_car_types,booking_v2.core_memberships
FROM PUBLIC,anon,authenticated;
