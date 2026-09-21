-- Web onboarding: keep legacy editors/documents working while creating canonical
-- identities atomically. No source database, auth hooks or existing rows changed.
CREATE FUNCTION booking_v2.sync_new_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
BEGIN
  IF new.user_type NOT IN ('customer','driver','company') THEN
    RAISE EXCEPTION 'Las altas web admiten clientes, conductores y empresas'; END IF;
  IF nullif(trim(new.mobile),'') IS NULL THEN RAISE EXCEPTION 'El teléfono es obligatorio'; END IF;
  IF auth.uid() IS NOT NULL AND NOT booking_v2.is_admin() THEN
    IF new.auth_id IS DISTINCT FROM auth.uid() OR new.user_type NOT IN ('customer','driver') THEN
      RAISE EXCEPTION 'Alta de perfil no autorizada'; END IF;
    -- Legacy defaults must never grant approval to a self-registered driver.
    new.approved:=false; new.blocked:=true; new.is_verified:=false;
    new.driver_active_status:=false;
  ELSIF auth.uid() IS NULL AND session_user NOT IN ('postgres','supabase_admin')
    AND coalesce(auth.role(),'')<>'service_role' THEN
    RAISE EXCEPTION 'Se requiere sesión para crear perfiles';
  END IF;
  new.mobile:=trim(new.mobile); new.email:=lower(trim(new.email));
  INSERT INTO public.persona(id,auth_id,nombre,apellido,telefono,email,imagen_perfil,
    numero_documento,bloqueado,verificado)
  VALUES(new.id,new.auth_id,new.first_name,new.last_name,new.mobile,new.email,new.profile_image,
    new.document_number,coalesce(new.blocked,true),coalesce(new.is_verified,false));
  INSERT INTO public.persona_rol(id_persona,rol) VALUES(new.id,
    (CASE new.user_type WHEN 'driver' THEN 'conductor' WHEN 'company' THEN 'empresa' ELSE 'cliente' END)::public.rol_persona);
  IF new.user_type='driver' THEN
    INSERT INTO public.perfil_conductor(id_persona,aprobado,activo,en_servicio,numero_licencia,numero_cuenta_bancaria)
      VALUES(new.id,coalesce(new.approved,false),coalesce(new.is_active,true),
        coalesce(new.driver_active_status,false),new.license_number,new.bank_number);
  ELSIF new.user_type='company' THEN
    INSERT INTO public.perfil_empresa(id_persona,razon_social)
      VALUES(new.id,coalesce(nullif(trim(new.company_name),''),new.first_name||' '||new.last_name));
  ELSE
    INSERT INTO public.perfil_cliente(id_persona) VALUES(new.id);
  END IF;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.sync_new_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_new_profile BEFORE INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_new_profile();

CREATE FUNCTION booking_v2.guard_vehicle_onboarding() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE category_id integer; brand_id uuid; matches integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.perfil_conductor WHERE id_persona=new.driver_id) THEN
    RAISE EXCEPTION 'El vehículo requiere un conductor registrado'; END IF;
  IF auth.uid() IS NOT NULL AND NOT booking_v2.is_admin() AND
    NOT EXISTS(SELECT 1 FROM public.persona p JOIN public.perfil_conductor d ON d.id_persona=p.id
      WHERE p.id=new.driver_id AND p.auth_id=auth.uid() AND d.activo AND (NOT p.bloqueado OR NOT d.aprobado)) THEN
    RAISE EXCEPTION 'No puede registrar o editar vehículos de otro conductor'; END IF;
  IF auth.uid() IS NULL AND session_user NOT IN ('postgres','supabase_admin')
    AND coalesce(auth.role(),'')<>'service_role' THEN RAISE EXCEPTION 'Se requiere sesión'; END IF;
  new.plate:=regexp_replace(upper(trim(new.plate)),'[^A-Z0-9]','','g');
  IF length(new.plate)<3 OR length(new.plate)>20 THEN RAISE EXCEPTION 'Placa inválida'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core-plate:'||new.plate,0));
  IF EXISTS(SELECT 1 FROM public.vehiculo WHERE id<>new.id AND
    regexp_replace(upper(placa),'[^A-Z0-9]','','g')=new.plate) THEN
    RAISE EXCEPTION 'La placa ya está registrada' USING ERRCODE='23505'; END IF;
  IF tg_op='UPDATE' THEN RETURN new; END IF;
  SELECT count(*),min(m.core_category_id) INTO matches,category_id
    FROM booking_v2.core_category_ids m WHERE booking_v2.category_matches(m.booking_category_id,new.service_type);
  IF matches<>1 THEN RAISE EXCEPTION 'Categoría de vehículo inexistente, inactiva o ambigua'; END IF;
  new.make:=trim(new.make); new.model:=trim(new.model);
  IF new.make='' OR new.model='' THEN RAISE EXCEPTION 'Marca y modelo son obligatorios'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core-brand:'||new.make,0));
  SELECT id INTO brand_id FROM public.marca_vehiculo WHERE nombre=new.make LIMIT 1;
  IF brand_id IS NULL THEN
    INSERT INTO public.marca_vehiculo(nombre) VALUES(new.make) RETURNING id INTO brand_id;
  END IF;
  INSERT INTO public.vehiculo(id,id_conductor,id_categoria,id_marca,linea,color,placa,capacidad,tipo_servicio,activo)
    VALUES(new.id,new.driver_id,category_id,brand_id,new.model,new.color,new.plate,
      coalesce(new.capacity,4),new.service_type,coalesce(new.is_active,true));
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.guard_vehicle_onboarding() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_vehicle_onboarding BEFORE INSERT OR UPDATE ON public.cars
  FOR EACH ROW EXECUTE FUNCTION booking_v2.guard_vehicle_onboarding();

CREATE FUNCTION booking_v2.admin_create_profile(p_auth_id uuid,p_input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE u public.users%rowtype; c public.cars%rowtype; role_name text:=p_input->>'user_type';
BEGIN
  IF NOT booking_v2.is_admin() THEN RAISE EXCEPTION 'Administrador autorizado requerido' USING ERRCODE='42501'; END IF;
  IF role_name IS NULL OR role_name NOT IN ('customer','driver','company') THEN RAISE EXCEPTION 'Tipo de usuario inválido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=p_auth_id AND lower(email)=lower(trim(p_input->>'email'))) THEN
    RAISE EXCEPTION 'La cuenta de autenticación no coincide'; END IF;
  IF EXISTS(SELECT 1 FROM public.users WHERE auth_id=p_auth_id) OR
    EXISTS(SELECT 1 FROM public.persona WHERE auth_id=p_auth_id) THEN
    RAISE EXCEPTION 'Esta cuenta ya tiene perfil'; END IF;
  IF nullif(trim(p_input->>'first_name'),'') IS NULL OR nullif(trim(p_input->>'last_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Nombre y apellido son obligatorios'; END IF;
  INSERT INTO public.users(auth_id,email,first_name,last_name,mobile,user_type,city,document_type,
    document_number,referral_id,bank_number,company_name,approved,blocked,driver_active_status)
  VALUES(p_auth_id,lower(trim(p_input->>'email')),trim(p_input->>'first_name'),trim(p_input->>'last_name'),
    p_input->>'mobile',role_name,p_input->>'city',p_input->>'document_type',p_input->>'document_number',
    nullif(p_input->>'referral_id',''),p_input->>'bank_number',p_input->>'company_name',false,true,false)
  RETURNING * INTO u;
  IF role_name='driver' THEN
    INSERT INTO public.cars(driver_id,make,model,plate,service_type,is_active,features)
    VALUES(u.id,p_input->>'make',p_input->>'model',p_input->>'plate',p_input->>'vehicle_type',true,
      jsonb_strip_nulls(jsonb_build_object('year',nullif(p_input->>'vehicle_year','')))) RETURNING * INTO c;
  END IF;
  RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
REVOKE ALL ON FUNCTION booking_v2.admin_create_profile(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION booking_v2.admin_create_profile(uuid,jsonb) TO authenticated;

-- One transaction for the existing edit/approve/block modal. Explicit allowlists
-- prevent an admin form from changing auth identity or internal financial fields.
CREATE FUNCTION booking_v2.admin_update_profile(p_id uuid,p_user jsonb,p_car jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE u public.users%rowtype; c public.cars%rowtype; patch jsonb; car_patch jsonb;
BEGIN
  IF NOT booking_v2.is_admin() THEN RAISE EXCEPTION 'Administrador autorizado requerido' USING ERRCODE='42501'; END IF;
  SELECT * INTO STRICT u FROM public.users WHERE id=p_id FOR UPDATE;
  IF p_id=booking_v2.current_app_user_id() AND
    (coalesce((p_user->>'blocked')::boolean,false) OR p_user->>'approved'='false') THEN
    RAISE EXCEPTION 'No puede deshabilitar su propia sesión administrativa'; END IF;
  SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO patch FROM jsonb_each(coalesce(p_user,'{}'))
    WHERE key=ANY(ARRAY['first_name','last_name','email','mobile','user_type','city','document_number',
      'document_type','license_number','car_type','blocked','approved','is_active','company_name']);
  u:=jsonb_populate_record(u,patch);
  UPDATE public.users SET first_name=u.first_name,last_name=u.last_name,email=u.email,mobile=u.mobile,
    user_type=u.user_type,city=u.city,document_number=u.document_number,document_type=u.document_type,
    license_number=u.license_number,car_type=u.car_type,blocked=u.blocked,approved=u.approved,
    is_active=u.is_active,company_name=u.company_name WHERE id=p_id RETURNING * INTO u;
  IF p_car IS NOT NULL THEN
    SELECT * INTO STRICT c FROM public.cars WHERE id=(p_car->>'id')::uuid AND driver_id=p_id FOR UPDATE;
    SELECT coalesce(jsonb_object_agg(key,value),'{}') INTO car_patch FROM jsonb_each(p_car)
      WHERE key=ANY(ARRAY['make','model','plate','color','fuel_type','transmission','capacity','service_type','is_active']);
    c:=jsonb_populate_record(c,car_patch);
    IF p_car ? 'features_car_type' THEN c.features:=coalesce(c.features,'{}')||jsonb_build_object('carType',p_car->>'features_car_type'); END IF;
    UPDATE public.cars SET make=c.make,model=c.model,plate=c.plate,color=c.color,fuel_type=c.fuel_type,
      transmission=c.transmission,capacity=c.capacity,service_type=c.service_type,is_active=c.is_active,
      features=c.features WHERE id=c.id RETURNING * INTO c;
  END IF;
  RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
REVOKE ALL ON FUNCTION booking_v2.admin_update_profile(uuid,jsonb,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION booking_v2.admin_update_profile(uuid,jsonb,jsonb) TO authenticated;

-- Existing direct web vehicle/profile editors also use the same guarded bridges.
CREATE POLICY core_admin_insert_users ON public.users FOR INSERT TO authenticated WITH CHECK(booking_v2.is_admin());
CREATE POLICY core_admin_update_users ON public.users FOR UPDATE TO authenticated USING(booking_v2.is_admin()) WITH CHECK(booking_v2.is_admin());
CREATE POLICY core_admin_update_cars ON public.cars FOR UPDATE TO authenticated USING(booking_v2.is_admin()) WITH CHECK(booking_v2.is_admin());
CREATE POLICY core_admin_insert_cars ON public.cars FOR INSERT TO authenticated WITH CHECK(booking_v2.is_admin());

-- Public registration resumes after email verification; no automatic Auth hook
-- and no trust in metadata approval/role flags. Idempotent for repeated callbacks.
CREATE FUNCTION booking_v2.ensure_driver_profile() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE account auth.users%rowtype; profile public.users%rowtype; metadata jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesión' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('core-signup:'||auth.uid()::text,0));
  SELECT * INTO STRICT account FROM auth.users WHERE id=auth.uid();
  IF account.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirme su correo antes de continuar'; END IF;
  SELECT * INTO profile FROM public.users WHERE auth_id=auth.uid();
  IF FOUND THEN
    IF profile.user_type<>'driver' THEN RAISE EXCEPTION 'Esta cuenta no es de conductor'; END IF;
    RETURN to_jsonb(profile);
  END IF;
  metadata:=account.raw_user_meta_data;
  IF metadata->>'user_type' IS DISTINCT FROM 'driver' THEN RAISE EXCEPTION 'Esta cuenta no inició registro de conductor'; END IF;
  IF nullif(trim(metadata->>'first_name'),'') IS NULL OR nullif(trim(metadata->>'last_name'),'') IS NULL THEN
    RAISE EXCEPTION 'Faltan nombres en el registro'; END IF;
  INSERT INTO public.users(auth_id,email,first_name,last_name,mobile,city,referral_id,user_type,approved,blocked)
    VALUES(account.id,account.email,trim(metadata->>'first_name'),trim(metadata->>'last_name'),
      metadata->>'mobile',metadata->>'city',nullif(metadata->>'referral_id',''),'driver',false,true)
    RETURNING * INTO profile;
  RETURN to_jsonb(profile);
END $$;
REVOKE ALL ON FUNCTION booking_v2.ensure_driver_profile() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION booking_v2.ensure_driver_profile() TO authenticated;
