-- Ejecutar despues de 006_support_views.sql. NO aplicado: requiere autorizacion expresa para produccion.
-- Problema: la web contaba filas de `referido` (casi vacia: ~5 filas) y la app mostraba el contador guardado
-- codigo_referido.total_referidos (desactualizado). El dato real vive en persona.codigo_referido_usado
-- (codigo con el que se registro cada persona). Desde ahora el conteo y la lista se CALCULAN en cada consulta.
-- Regla: persona cuyo codigo_referido_usado coincide (sin mayusculas ni espacios) con un codigo; se excluye
-- a quien usa su propio codigo.
-- Cambios:
--  1) web_referral_codes.total_referrals = conteo en vivo desde persona (mismas columnas y orden que antes).
--  2) Vista nueva web_referred_users (solo lectura): una fila por persona referida; la usan las listas de la web.
--  3) web_reconcile_referrals alinea el contador guardado (el que lee la app) con el conteo en vivo. Antes lo
--     recalculaba desde `referido` y habria puesto en 0/2 los contadores de la app.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE VIEW public.web_referral_codes WITH (security_invoker=true) AS
SELECT c.id,c.id_persona AS driver_id,c.codigo AS referral_code,c.activo AS is_active,
 (SELECT count(*) FROM public.persona p
   WHERE upper(trim(p.codigo_referido_usado))=upper(c.codigo) AND p.id<>c.id_persona) AS total_referrals,
 c.creado_en AS created_at,
 (SELECT jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
  'email',u.email,'mobile',u.mobile,'user_type',u.user_type) FROM public.web_users u WHERE u.id=c.id_persona) AS driver
FROM public.codigo_referido c;

CREATE OR REPLACE VIEW public.web_referred_users WITH (security_invoker=true) AS
SELECT p.id,c.id AS referral_code_id,c.id_persona AS referrer_id,c.codigo AS referral_code,
 r.estado AS status,p.creado_en AS referred_at,
 (SELECT jsonb_build_object('id',u.id,'first_name',u.first_name,'last_name',u.last_name,
  'mobile',u.mobile,'user_type',u.user_type,'approved',u.approved)
  FROM public.web_users u WHERE u.id=p.id) AS referred_driver
FROM public.persona p
JOIN public.codigo_referido c ON upper(c.codigo)=upper(trim(p.codigo_referido_usado)) AND c.id_persona<>p.id
LEFT JOIN public.referido r ON r.id_conductor_referido=p.id AND r.id_codigo_referido=c.id;

REVOKE ALL ON public.web_referred_users FROM anon;
GRANT SELECT ON public.web_referred_users TO authenticated;

CREATE OR REPLACE FUNCTION public.web_reconcile_referrals() RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE n integer;
BEGIN
 PERFORM public.web_require_admin();
 UPDATE public.codigo_referido c SET total_referidos=(
  SELECT count(*) FROM public.persona p
  WHERE upper(trim(p.codigo_referido_usado))=upper(c.codigo) AND p.id<>c.id_persona)
 WHERE c.total_referidos IS DISTINCT FROM (
  SELECT count(*) FROM public.persona p
  WHERE upper(trim(p.codigo_referido_usado))=upper(c.codigo) AND p.id<>c.id_persona);
 GET DIAGNOSTICS n=ROW_COUNT; RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.web_reconcile_referrals() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_reconcile_referrals() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

-- Revertir: volver a ejecutar 006_support_views.sql (restaura web_referral_codes y web_reconcile_referrals) y
--   DROP VIEW public.web_referred_users;
