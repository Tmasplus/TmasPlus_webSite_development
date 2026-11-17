-- 022: campo manual "Gestion" por conductor (seguimiento comercial del equipo).
-- Cambios: columna perfil_conductor.gestion (default 'sin_gestion', CHECK con los 11 estados),
--   vista public.web_driver_management (id, gestion) y RPC public.web_set_driver_management(p_id, p_status).
-- No toca web_users, sus triggers ni web_admin_update_profile; la app movil no lee esta columna.
-- ADD COLUMN con default constante es solo metadato (sin reescribir la tabla): todos quedan 'sin_gestion'.
-- Verificacion: SELECT gestion, count(*) FROM public.perfil_conductor GROUP BY 1;  -- todo 'sin_gestion'
-- Reversion: DROP FUNCTION public.web_set_driver_management(uuid,text); DROP VIEW public.web_driver_management;
--   ALTER TABLE public.perfil_conductor DROP COLUMN gestion;
BEGIN;
SET LOCAL lock_timeout='5s';

ALTER TABLE public.perfil_conductor
 ADD COLUMN IF NOT EXISTS gestion text NOT NULL DEFAULT 'sin_gestion';

ALTER TABLE public.perfil_conductor DROP CONSTRAINT IF EXISTS perfil_conductor_gestion_chk;
ALTER TABLE public.perfil_conductor ADD CONSTRAINT perfil_conductor_gestion_chk CHECK (gestion IN (
 'sin_gestion','completo_con_membresia','completado_sin_membresia','falta_documentos',
 'falta_vehiculo_y_documentos','no_contesta','no_interesado_por_ahora','no_volver_a_llamar',
 'recarga_incompleto_perfil','verificado_sin_vehiculo_ni_documentos','bloqueado_por_tmasplus'));

CREATE OR REPLACE VIEW public.web_driver_management WITH (security_invoker=true) AS
SELECT d.id_persona AS id, d.gestion AS management_status FROM public.perfil_conductor d;

CREATE OR REPLACE FUNCTION public.web_set_driver_management(p_id uuid,p_status text) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 UPDATE public.perfil_conductor SET gestion=p_status WHERE id_persona=p_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Conductor sin perfil de conductor'; END IF;
 RETURN p_status;
END $$;

REVOKE ALL ON public.web_driver_management FROM PUBLIC,anon;
GRANT SELECT ON public.web_driver_management TO authenticated;
REVOKE ALL ON FUNCTION public.web_set_driver_management(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_set_driver_management(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
