-- Requiere 001,002,003. Altas usan Auth + persona/perfiles/vehiculo existentes.
-- Ademas del SQL se debe desplegar la Edge Function core-create-user en core.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.web_insert_profile(p_auth_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE pid uuid; car public.web_cars%rowtype; u public.web_users%rowtype; role_name text:=p_input->>'user_type';
BEGIN
 IF role_name IS NULL OR role_name NOT IN ('driver','customer','company') THEN RAISE EXCEPTION 'Rol invalido'; END IF;
 IF nullif(trim(p_input->>'mobile'),'') IS NULL THEN RAISE EXCEPTION 'Telefono obligatorio'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-auth:'||p_auth_id::text,0));
 IF EXISTS(SELECT 1 FROM public.persona WHERE auth_id=p_auth_id) THEN RAISE EXCEPTION 'Ya existe un perfil para esta cuenta'; END IF;
 INSERT INTO public.persona(auth_id,nombre,apellido,email,telefono,bloqueado,verificado,codigo_referido_usado)
 VALUES(p_auth_id,trim(p_input->>'first_name'),trim(p_input->>'last_name'),lower(trim(p_input->>'email')),
  trim(p_input->>'mobile'),role_name='driver',false,nullif(trim(p_input->>'referral_id'),'')) RETURNING id INTO pid;
 INSERT INTO public.persona_rol(id_persona,rol) VALUES(pid,
  (CASE role_name WHEN 'driver' THEN 'conductor' WHEN 'company' THEN 'empresa' ELSE 'cliente' END)::public.rol_persona);
 IF role_name='driver' THEN INSERT INTO public.perfil_conductor(id_persona,aprobado,activo,en_servicio) VALUES(pid,false,true,false);
 ELSIF role_name='company' THEN INSERT INTO public.perfil_empresa(id_persona,razon_social)
  VALUES(pid,coalesce(nullif(trim(p_input->>'company_name'),''),trim(concat_ws(' ',p_input->>'first_name',p_input->>'last_name'))));
 ELSE INSERT INTO public.perfil_cliente(id_persona) VALUES(pid); END IF;
 INSERT INTO public.wallet(id_persona) VALUES(pid);
 UPDATE public.web_users SET city=nullif(p_input->>'city',''),document_type=nullif(p_input->>'document_type',''),
  document_number=nullif(p_input->>'document_number',''),bank_number=nullif(p_input->>'bank_number','')
 WHERE id=pid RETURNING * INTO u;
 IF role_name='driver' AND nullif(p_input->>'plate','') IS NOT NULL THEN
  INSERT INTO public.web_cars(driver_id,make,model,plate,service_type,vehicle_year)
  VALUES(pid,p_input->>'make',p_input->>'model',p_input->>'plate',p_input->>'vehicle_type',nullif(p_input->>'vehicle_year','')::integer)
  RETURNING * INTO car;
 END IF;
 RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN car.id IS NULL THEN NULL ELSE to_jsonb(car) END);
END $$;
REVOKE ALL ON FUNCTION public.web_insert_profile(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.web_admin_create_profile(p_auth_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=lower(trim(p_input->>'email')))
 THEN RAISE EXCEPTION 'La cuenta Auth no coincide con el perfil'; END IF;
 RETURN public.web_insert_profile(p_auth_id,p_input);
END $$;

CREATE OR REPLACE FUNCTION public.web_ensure_driver_profile() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE account auth.users%rowtype; profile public.web_users%rowtype; result jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-auth:'||auth.uid()::text,0));
 SELECT * INTO profile FROM public.web_users WHERE auth_id=auth.uid();
 IF profile.id IS NOT NULL THEN RETURN to_jsonb(profile); END IF;
 SELECT * INTO STRICT account FROM auth.users WHERE id=auth.uid();
 IF account.email_confirmed_at IS NULL OR account.raw_user_meta_data->>'user_type' IS DISTINCT FROM 'driver'
 THEN RAISE EXCEPTION 'Confirme el correo del registro de conductor'; END IF;
 result:=public.web_insert_profile(auth.uid(),jsonb_build_object(
  'user_type','driver','email',account.email,'first_name',account.raw_user_meta_data->>'first_name',
  'last_name',account.raw_user_meta_data->>'last_name','mobile',account.raw_user_meta_data->>'mobile',
  'city',account.raw_user_meta_data->>'city','referral_id',account.raw_user_meta_data->>'referral_id'));
 RETURN result->'user';
END $$;
REVOKE ALL ON FUNCTION public.web_admin_create_profile(uuid,jsonb),public.web_ensure_driver_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_admin_create_profile(uuid,jsonb),public.web_ensure_driver_profile() TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
