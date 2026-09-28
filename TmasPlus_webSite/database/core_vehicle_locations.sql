-- Solo core (zvplcamcyldcquxqnftb). Vista de lectura; no crea tablas ni modifica datos.
-- Ya incluida en la instalacion core_web de la rama prueba_nueva_db.
-- Requiere las tablas nativas core, es_admin() y sus permisos/RLS existentes.
BEGIN;
SET LOCAL lock_timeout='5s';
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
REVOKE ALL ON public.web_vehicle_locations FROM PUBLIC,anon;
GRANT SELECT ON public.web_vehicle_locations TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
