-- Ejecutar despues de 002. NO aplicado: entregar a quien despliega core.
-- Regla: un conductor NO verificado (perfil_conductor.aprobado = false) o bloqueado no puede quedar asignado
-- a una reserva, ya la tome desde la App (UPDATE sobre la vista bookings), la asigne el dashboard o cualquier otro camino.
-- Solo se evalua cuando id_conductor cambia o se inserta, para no romper viajes ya en curso de un conductor
-- al que despues se le quite la aprobacion.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.reserva_requiere_conductor_aprobado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NEW.id_conductor IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.id_conductor IS NOT DISTINCT FROM OLD.id_conductor THEN RETURN NEW; END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.perfil_conductor d JOIN public.persona p ON p.id=d.id_persona
  WHERE d.id_persona=NEW.id_conductor AND d.aprobado AND NOT p.bloqueado
 ) THEN
  RAISE EXCEPTION 'CONDUCTOR_NO_VERIFICADO: la cuenta del conductor aun no esta verificada' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS reserva_requiere_conductor_aprobado ON public.reserva;
CREATE TRIGGER reserva_requiere_conductor_aprobado
 BEFORE INSERT OR UPDATE OF id_conductor ON public.reserva
 FOR EACH ROW WHEN (NEW.id_conductor IS NOT NULL)
 EXECUTE FUNCTION public.reserva_requiere_conductor_aprobado();
COMMIT;
