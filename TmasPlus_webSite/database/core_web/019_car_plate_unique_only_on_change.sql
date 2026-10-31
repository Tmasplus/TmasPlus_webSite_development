-- 019: web_cars_write valida la placa unica solo cuando la placa cambia.
-- Problema: la validacion corria en cada UPDATE. Con placas ya duplicadas en
-- public.vehiculo (reintentos de registro), editar marca/combustible/transmision
-- fallaba con "La placa ya existe" aunque la placa no se tocara.
-- Unico cambio respecto a 003: el bloque de unicidad de placa.
-- Reversion: volver a ejecutar la definicion de web_cars_write de 003_profile_commands.sql.
CREATE OR REPLACE FUNCTION public.web_cars_write() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE admin_ok boolean; changed jsonb; k text; cid integer; brand uuid; n integer; doc record; val text; expiry date; old_plate text;
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
 IF TG_OP='UPDATE' THEN
  SELECT regexp_replace(upper(placa),'[^A-Z0-9]','','g') INTO old_plate FROM public.vehiculo WHERE id=old.id;
 END IF;
 -- Unicidad solo en alta o cuando la placa realmente cambia.
 IF TG_OP='INSERT' OR new.plate IS DISTINCT FROM old_plate THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('core-web-plate:'||new.plate,0));
  IF EXISTS(SELECT 1 FROM public.vehiculo WHERE regexp_replace(upper(placa),'[^A-Z0-9]','','g')=new.plate
   AND (TG_OP='INSERT' OR id<>old.id)) THEN RAISE EXCEPTION 'La placa ya existe' USING ERRCODE='23505'; END IF;
 END IF;
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
