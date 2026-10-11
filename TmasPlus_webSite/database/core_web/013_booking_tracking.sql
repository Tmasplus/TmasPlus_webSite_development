-- Ejecutar despues de 001. NO aplicado: entregar a quien despliega core. Solo lectura; no crea tablas.
-- RPC para el mapa del Historico de reservas: devuelve los puntos GPS guardados de UNA reserva
-- (reserva_tracking), en orden cronologico. p_since permite pedir solo los puntos nuevos al hacer polling
-- en viajes en curso, para no releer toda la ruta (menos consumo). Maximo 5000 puntos por llamada.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.web_booking_tracking(p_booking_id uuid,p_since timestamptz DEFAULT NULL)
RETURNS TABLE(lat numeric,lng numeric,recorded_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 RETURN QUERY SELECT t.lat::numeric,t.lng::numeric,t.registrado_en
 FROM public.reserva_tracking t
 WHERE t.id_reserva=p_booking_id AND t.lat IS NOT NULL AND t.lng IS NOT NULL
  AND (p_since IS NULL OR t.registrado_en>p_since)
 ORDER BY t.registrado_en,t.id LIMIT 5000;
END $$;
REVOKE ALL ON FUNCTION public.web_booking_tracking(uuid,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_booking_tracking(uuid,timestamptz) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
