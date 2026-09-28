-- Despues de 001 y 002. Sin tablas nuevas. No cambia triggers/vistas de la app.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.web_users_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_ok boolean; changed jsonb; k text; val text; city_id integer; doc_id integer; n integer; doc record;
BEGIN
 IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'Use el alta autenticada para crear perfiles'; END IF;
 SELECT coalesce(public.es_admin() AND NOT p.bloqueado,false) INTO admin_ok FROM public.persona p WHERE p.auth_id=auth.uid();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(admin_ok,false) AND NOT EXISTS(SELECT 1 FROM public.persona p
  LEFT JOIN public.perfil_conductor d ON d.id_persona=p.id WHERE p.id=old.id AND p.auth_id=auth.uid()
  AND (NOT p.bloqueado OR d.aprobado=false)) THEN RAISE EXCEPTION 'Perfil no autorizado' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.persona WHERE id=old.id FOR UPDATE;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO changed FROM jsonb_each(to_jsonb(new)) e
 WHERE e.value IS DISTINCT FROM to_jsonb(old)->e.key AND e.key<>'updated_at';
 FOR k IN SELECT jsonb_object_keys(changed) LOOP
  IF NOT (k=ANY(ARRAY['first_name','last_name','mobile','city','document_number','document_type','license_number',
   'profile_image','verify_id_image','verify_id_image_bk','license_image','license_image_back','bank_number',
   'company_name','car_type','approved','blocked','is_active','driver_active_status']))
  THEN RAISE EXCEPTION 'Campo no editable en core: %',k; END IF;
  IF NOT coalesce(admin_ok,false) AND k=ANY(ARRAY['approved','blocked','is_active','driver_active_status','company_name','car_type'])
  THEN RAISE EXCEPTION 'Campo reservado al administrador: %',k USING ERRCODE='42501'; END IF;
 END LOOP;
 IF old.auth_id=auth.uid() AND (new.blocked OR NOT new.is_active) THEN
  IF coalesce(admin_ok,false) THEN RAISE EXCEPTION 'No puede deshabilitar su propio administrador'; END IF;
 END IF;
 IF changed ? 'city' THEN
  IF nullif(trim(new.city),'') IS NOT NULL THEN
   SELECT count(*),min(id) INTO n,city_id FROM public.ciudad WHERE lower(nombre)=lower(trim(new.city));
   IF n<>1 THEN RAISE EXCEPTION 'Ciudad inexistente o ambigua: %',new.city; END IF;
  END IF;
  UPDATE public.persona SET id_ciudad_actual=city_id WHERE id=old.id;
 END IF;
 IF changed ? 'document_type' THEN
  IF nullif(trim(new.document_type),'') IS NOT NULL THEN
   SELECT count(*),min(id) INTO n,doc_id FROM public.tipo_documento
   WHERE lower(acronimo)=lower(trim(new.document_type)) OR lower(nombre)=lower(trim(new.document_type)) OR id::text=new.document_type;
   IF n<>1 THEN RAISE EXCEPTION 'Tipo de documento inexistente o ambiguo'; END IF;
  END IF;
  UPDATE public.persona SET id_tipo_documento=doc_id WHERE id=old.id;
 END IF;
 UPDATE public.persona SET nombre=new.first_name,apellido=new.last_name,telefono=new.mobile,
  numero_documento=new.document_number,imagen_perfil=new.profile_image,bloqueado=new.blocked WHERE id=old.id;
 UPDATE public.perfil_conductor SET numero_licencia=new.license_number,numero_cuenta_bancaria=new.bank_number,
  aprobado=new.approved,activo=new.is_active,en_servicio=new.driver_active_status,tipo_servicio=new.car_type WHERE id_persona=old.id;
 IF changed ? 'company_name' THEN UPDATE public.perfil_empresa SET razon_social=new.company_name WHERE id_persona=old.id; END IF;
 FOR doc IN SELECT * FROM (VALUES
  ('verify_id_image','identidad','frontal'),('verify_id_image_bk','identidad','posterior'),
  ('license_image','licencia','frontal'),('license_image_back','licencia','posterior')) AS x(field,kind,side)
 LOOP
  IF changed ? doc.field THEN
   val:=changed->>doc.field;
   IF nullif(trim(val),'') IS NULL THEN RAISE EXCEPTION 'Para documentos, adjunte un reemplazo; no se elimina el historial'; END IF;
   INSERT INTO public.documento_persona(id_persona,tipo,lado,storage_path)
   VALUES(old.id,doc.kind,doc.side::public.lado_documento,val);
  END IF;
 END LOOP;
 SELECT * INTO new FROM public.web_users WHERE id=old.id;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS web_users_write ON public.web_users;
CREATE TRIGGER web_users_write INSTEAD OF UPDATE ON public.web_users FOR EACH ROW EXECUTE FUNCTION public.web_users_write();

CREATE OR REPLACE FUNCTION public.web_cars_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_ok boolean; changed jsonb; k text; cid integer; brand uuid; n integer; doc record; val text; expiry date;
BEGIN
 SELECT coalesce(public.es_admin() AND NOT p.bloqueado,false) INTO admin_ok FROM public.persona p WHERE p.auth_id=auth.uid();
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere sesion' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(admin_ok,false) AND NOT EXISTS (SELECT 1 FROM public.persona p JOIN public.perfil_conductor d ON d.id_persona=p.id
  WHERE p.id=new.driver_id AND p.auth_id=auth.uid() AND (NOT p.bloqueado OR NOT d.aprobado))
 THEN RAISE EXCEPTION 'Vehiculo no autorizado' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF new.id IS DISTINCT FROM old.id OR new.driver_id IS DISTINCT FROM old.driver_id THEN
   RAISE EXCEPTION 'No se permite cambiar identidad o propietario del vehiculo'; END IF;
  PERFORM 1 FROM public.vehiculo WHERE id=old.id FOR UPDATE;
 END IF;
 SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO changed FROM jsonb_each(to_jsonb(new)) e
 WHERE (TG_OP='INSERT' AND e.value<>'null'::jsonb) OR (TG_OP='UPDATE' AND e.value IS DISTINCT FROM to_jsonb(old)->e.key);
 FOR k IN SELECT jsonb_object_keys(changed) LOOP
  IF NOT (k=ANY(ARRAY['id','driver_id','make','model','plate','color','capacity','fuel_type','transmission','vehicle_year',
   'service_type','car_type_id','is_active','features','car_image_1','car_image_2','created_at','updated_at',
   'soat_image','soat_expiry_date','tecnomecanica_image','tecnomecanica_expiry_date',
   'card_prop_image','card_prop_image_back','camara_comercio_image']))
  THEN RAISE EXCEPTION 'Campo de vehiculo no editable: %',k; END IF;
 END LOOP;
 IF NOT coalesce(admin_ok,false) AND TG_OP='UPDATE' AND changed ? 'is_active'
 THEN RAISE EXCEPTION 'Solo el administrador cambia la activacion'; END IF;
 IF TG_OP='INSERT' OR changed ? 'service_type' OR changed ? 'car_type_id' THEN
  SELECT count(*),min(id) INTO n,cid FROM public.categoria_vehiculo WHERE activo AND autorizado AND
   (id::text=CASE WHEN changed ? 'service_type' THEN new.service_type ELSE new.car_type_id::text END OR lower(nombre)=lower(new.service_type)
    OR regexp_replace(lower(nombre),'[^a-z0-9]+','_','g')=new.service_type);
  IF n<>1 THEN RAISE EXCEPTION 'Seleccione una categoria valida de core'; END IF;
 ELSE SELECT id_categoria INTO cid FROM public.vehiculo WHERE id=old.id; END IF;
 IF TG_OP='INSERT' OR changed ? 'make' THEN
  SELECT count(*),(array_agg(id))[1] INTO n,brand FROM public.marca_vehiculo WHERE activo AND lower(nombre)=lower(trim(new.make));
  IF n<>1 THEN RAISE EXCEPTION 'Seleccione una marca existente y activa'; END IF;
 ELSE SELECT id_marca INTO brand FROM public.vehiculo WHERE id=old.id; END IF;
 new.plate:=regexp_replace(upper(trim(new.plate)),'[^A-Z0-9]','','g');
 IF new.plate IS NULL OR length(new.plate)<3 OR length(new.plate)>20 THEN RAISE EXCEPTION 'Placa invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('core-web-plate:'||new.plate,0));
 IF EXISTS(SELECT 1 FROM public.vehiculo WHERE regexp_replace(upper(placa),'[^A-Z0-9]','','g')=new.plate
  AND (TG_OP='INSERT' OR id<>old.id)) THEN RAISE EXCEPTION 'La placa ya existe' USING ERRCODE='23505'; END IF;
 IF TG_OP='INSERT' THEN
  new.id:=gen_random_uuid();
  INSERT INTO public.vehiculo(id,id_conductor,id_categoria,id_marca,placa,linea,capacidad,activo)
  VALUES(new.id,new.driver_id,cid,brand,new.plate,new.model,coalesce(new.capacity,4),true);
 END IF;
 UPDATE public.vehiculo SET id_categoria=cid,id_marca=brand,placa=new.plate,linea=new.model,color=new.color,
  anio=new.vehicle_year,tipo_combustible=new.fuel_type,transmision=new.transmission,
  capacidad=coalesce(new.capacity,4),activo=coalesce(new.is_active,true),
  tipo_servicio=(SELECT nombre FROM public.categoria_vehiculo WHERE id=cid),
  foto_1=new.car_image_1,foto_2=new.car_image_2,caracteristicas=new.features WHERE id=new.id;
 FOR doc IN SELECT * FROM (VALUES
  ('soat_image','soat','frontal','soat_expiry_date'),('tecnomecanica_image','tecnomecanica','frontal','tecnomecanica_expiry_date'),
  ('card_prop_image','tarjeta_propiedad','frontal',NULL),('card_prop_image_back','tarjeta_propiedad','posterior',NULL),
  ('camara_comercio_image','camara_comercio','frontal',NULL)) AS x(field,kind,side,expiry_field)
 LOOP
  IF changed ? doc.field OR (doc.expiry_field IS NOT NULL AND changed ? doc.expiry_field) THEN
   val:=to_jsonb(new)->>doc.field; expiry:=(to_jsonb(new)->>doc.expiry_field)::date;
   IF nullif(trim(val),'') IS NULL THEN RAISE EXCEPTION 'Adjunte el documento antes de guardar su vencimiento'; END IF;
   INSERT INTO public.documento_vehiculo(id_vehiculo,tipo,lado,storage_path,fecha_vencimiento)
   VALUES(new.id,doc.kind::public.tipo_documento_vehiculo,doc.side::public.lado_documento,val,expiry);
  END IF;
 END LOOP;
 SELECT * INTO new FROM public.web_cars WHERE id=new.id;
 RETURN new;
END $$;
DROP TRIGGER IF EXISTS web_cars_write ON public.web_cars;
CREATE TRIGGER web_cars_write INSTEAD OF INSERT OR UPDATE ON public.web_cars FOR EACH ROW EXECUTE FUNCTION public.web_cars_write();

CREATE OR REPLACE FUNCTION public.web_admin_update_profile(p_id uuid,p_user jsonb,p_car jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE u public.web_users%rowtype; c public.web_cars%rowtype; k text;
BEGIN
 PERFORM public.web_require_admin();
 PERFORM 1 FROM public.persona WHERE id=p_id FOR UPDATE;
 SELECT * INTO STRICT u FROM public.web_users WHERE id=p_id;
 FOR k IN SELECT jsonb_object_keys(p_user) LOOP
  IF NOT to_jsonb(u) ? k THEN RAISE EXCEPTION 'Campo de perfil desconocido: %',k; END IF;
  IF p_user->k IS DISTINCT FROM to_jsonb(u)->k AND NOT (k=ANY(ARRAY[
   'first_name','last_name','mobile','city','document_type','document_number','license_number',
   'blocked','approved','is_active','company_name','bank_number','car_type'])) THEN
   RAISE EXCEPTION 'Campo no editable por esta operacion: %',k;
  END IF;
 END LOOP;
 u:=jsonb_populate_record(u,p_user);
 IF u.id<>p_id THEN RAISE EXCEPTION 'Identidad inmutable'; END IF;
 UPDATE public.web_users SET first_name=u.first_name,last_name=u.last_name,mobile=u.mobile,city=u.city,
  document_type=u.document_type,document_number=u.document_number,license_number=u.license_number,
  blocked=u.blocked,approved=u.approved,is_active=u.is_active,company_name=u.company_name,
  bank_number=u.bank_number,car_type=u.car_type WHERE id=p_id RETURNING * INTO u;
 IF p_car IS NOT NULL THEN
  SELECT * INTO STRICT c FROM public.web_cars WHERE id=(p_car->>'id')::uuid AND driver_id=p_id;
  FOR k IN SELECT jsonb_object_keys(p_car) LOOP
   IF NOT to_jsonb(c) ? k AND k<>'features_car_type' THEN RAISE EXCEPTION 'Campo de vehiculo desconocido: %',k; END IF;
  END LOOP;
  c:=jsonb_populate_record(c,p_car);
  UPDATE public.web_cars SET make=c.make,model=c.model,plate=c.plate,color=c.color,fuel_type=c.fuel_type,
   transmission=c.transmission,capacity=c.capacity,service_type=c.service_type,is_active=c.is_active
  WHERE id=c.id AND driver_id=p_id RETURNING * INTO c;
 END IF;
 RETURN jsonb_build_object('user',to_jsonb(u),'car',CASE WHEN c.id IS NULL THEN NULL ELSE to_jsonb(c) END);
END $$;
REVOKE ALL ON FUNCTION public.web_users_write(),public.web_cars_write() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.web_admin_update_profile(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_admin_update_profile(uuid,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
