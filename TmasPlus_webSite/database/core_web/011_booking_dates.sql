-- Ejecutar despues de 001_views.sql. NO aplicado: entregar a quien despliega core.
-- Agrega a web_bookings las fechas reales del servicio para el historial de reservas:
--   trip_started_at -> reserva.viaje_inicio_en   (fecha de EJECUCION: cuando el viaje realmente inicio)
--   trip_ended_at   -> reserva.viaje_fin_en
--   driver_arrived_at -> reserva.conductor_llego_en
-- Las columnas nuevas van AL FINAL (CREATE OR REPLACE VIEW no permite reordenar las existentes).
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE VIEW public.web_bookings WITH (security_invoker=true) AS
SELECT b.*,r.cancelado_en AS cancelled_at,r.cancelado_en AS cancellation_time,
 dr.puntaje AS rating,dr.comentario AS review,dr.puntaje AS driver_rating,
 cr.puntaje AS customer_rating,cr.comentario AS customer_review,
 r.viaje_inicio_en AS trip_started_at,r.viaje_fin_en AS trip_ended_at,r.conductor_llego_en AS driver_arrived_at
FROM public.bookings b JOIN public.reserva r ON r.id=b.id
LEFT JOIN LATERAL (
 SELECT puntaje,comentario FROM public.calificacion WHERE id_reserva=r.id AND id_persona=r.id_conductor
 ORDER BY creado_en DESC,id DESC LIMIT 1
) dr ON true
LEFT JOIN LATERAL (
 SELECT puntaje,comentario FROM public.calificacion WHERE id_reserva=r.id AND id_persona=r.id_cliente
 ORDER BY creado_en DESC,id DESC LIMIT 1
) cr ON true;
NOTIFY pgrst,'reload schema';
COMMIT;
