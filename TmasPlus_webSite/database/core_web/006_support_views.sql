-- Membresias, referidos y quejas: adaptadores sobre las tablas existentes.
BEGIN;
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
COMMIT;
