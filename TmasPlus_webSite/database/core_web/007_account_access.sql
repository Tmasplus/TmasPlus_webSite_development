BEGIN;
CREATE OR REPLACE FUNCTION public.web_bind_auth(p_id uuid,p_auth_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.persona%rowtype; result jsonb;
BEGIN
 PERFORM public.web_require_admin();
 SELECT * INTO STRICT p FROM public.persona WHERE id=p_id FOR UPDATE;
 IF p.auth_id IS NOT NULL AND p.auth_id<>p_auth_id THEN RAISE EXCEPTION 'Perfil ya vinculado'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=lower(p.email))
 THEN RAISE EXCEPTION 'La cuenta Auth no corresponde al correo del perfil'; END IF;
 UPDATE public.persona SET auth_id=p_auth_id WHERE id=p_id;
 SELECT to_jsonb(u) INTO result FROM public.web_users u WHERE u.id=p_id;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.web_bind_auth(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_bind_auth(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
