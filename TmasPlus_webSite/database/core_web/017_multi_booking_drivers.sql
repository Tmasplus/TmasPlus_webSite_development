-- Ejecutar despues de 009_reassign_and_assignable_filter.sql. NO aplicado: entregar a quien despliega core.
-- Un conductor puede tener multiples reservas asignadas. Se elimina de web_assignable_drivers y web_assign_booking
-- la exclusion de conductores con perfil_conductor.ocupado o con reservas activas (ACCEPTED/ARRIVED/STARTED/REACHED).
-- Se mantienen: aprobado, activo, no bloqueado, vehiculo activo de la categoria de la reserva y estado de reserva NEW/PENDING/ACCEPTED.
-- La liberacion del conductor anterior (ocupado=false) solo si no le quedan servicios activos se conserva.
-- Los triggers existentes de reserva siguen activos y pueden enviar PUSH reales.
BEGIN;
SET LOCAL lock_timeout='5s';

DROP FUNCTION IF EXISTS public.web_assignable_drivers(text,uuid);

CREATE OR REPLACE FUNCTION public.web_assignable_drivers(p_query text DEFAULT '',p_booking_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE cat integer;
BEGIN
 PERFORM public.web_require_admin();
 IF p_booking_id IS NOT NULL THEN SELECT id_categoria INTO cat FROM public.reserva WHERE id=p_booking_id; END IF;
 RETURN QUERY SELECT to_jsonb(u)||jsonb_build_object('vehicle',to_jsonb(v))
 FROM public.web_users u JOIN public.perfil_conductor d ON d.id_persona=u.id
 JOIN LATERAL (SELECT c.id,c.make,c.model,c.plate,c.service_type FROM public.web_cars c
  JOIN public.vehiculo ve ON ve.id=c.id
  WHERE c.driver_id=u.id AND c.is_active AND (cat IS NULL OR ve.id_categoria=cat)
  ORDER BY c.updated_at DESC,c.id LIMIT 1) v ON true
 WHERE d.aprobado AND d.activo AND NOT u.blocked
 AND concat_ws(' ',u.first_name,u.last_name,u.mobile,v.plate) ILIKE '%'||coalesce(p_query,'')||'%';
END $$;

CREATE OR REPLACE FUNCTION public.web_assign_booking(p_booking_id uuid,p_driver_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.reserva%rowtype; d public.perfil_conductor%rowtype; car uuid; prev uuid;
BEGIN
 PERFORM public.web_require_admin();
 SELECT id_conductor INTO prev FROM public.reserva WHERE id=p_booking_id;
 -- Bloqueo de perfiles en orden de id para evitar deadlocks entre conductor nuevo y anterior.
 PERFORM 1 FROM public.perfil_conductor WHERE id_persona IN (p_driver_id,prev) ORDER BY id_persona FOR UPDATE;
 SELECT * INTO STRICT d FROM public.perfil_conductor WHERE id_persona=p_driver_id;
 SELECT * INTO STRICT r FROM public.reserva WHERE id=p_booking_id FOR UPDATE;
 IF r.id_conductor IS DISTINCT FROM prev THEN RAISE EXCEPTION 'La reserva cambio; vuelva a consultar'; END IF;
 IF r.estado NOT IN ('NEW','PENDING','ACCEPTED') THEN RAISE EXCEPTION 'La reserva ya no esta disponible'; END IF;
 IF r.id_conductor IS NOT DISTINCT FROM p_driver_id THEN RAISE EXCEPTION 'La reserva ya esta asignada a este conductor'; END IF;
 IF NOT d.aprobado OR NOT d.activo OR EXISTS(SELECT 1 FROM public.persona WHERE id=p_driver_id AND bloqueado)
 THEN RAISE EXCEPTION 'Conductor no disponible'; END IF;
 SELECT id INTO car FROM public.vehiculo WHERE id_conductor=p_driver_id AND activo AND id_categoria=r.id_categoria
 ORDER BY actualizado_en DESC,id LIMIT 1 FOR UPDATE;
 IF car IS NULL THEN RAISE EXCEPTION 'El conductor no tiene vehiculo activo de esta categoria'; END IF;
 UPDATE public.reserva SET id_conductor=p_driver_id,id_vehiculo=car,estado='ACCEPTED' WHERE id=r.id;
 UPDATE public.perfil_conductor SET ocupado=true WHERE id_persona=p_driver_id;
 -- Reasignacion: liberar al conductor anterior si no le quedan servicios activos.
 IF prev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reserva WHERE id_conductor=prev
  AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED')) THEN
  UPDATE public.perfil_conductor SET ocupado=false WHERE id_persona=prev;
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.web_assignable_drivers(text,uuid),public.web_assign_booking(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_assignable_drivers(text,uuid),public.web_assign_booking(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
