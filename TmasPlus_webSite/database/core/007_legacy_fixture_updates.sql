-- Transitional write adapters for migrated profiles/vehicles only. Existing web
-- and mobile editors keep working; core remains the booking read model.
-- New account onboarding and changing a profile's identity/role are NOT migrated here.
CREATE FUNCTION booking_v2.sync_migrated_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.persona WHERE id=old.id) THEN
    IF tg_op='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
  END IF;
  IF tg_op='DELETE' THEN
    UPDATE public.persona SET bloqueado=true,actualizado_en=now() WHERE id=old.id;
    UPDATE public.perfil_conductor SET activo=false,en_servicio=false WHERE id_persona=old.id;
    RETURN old;
  END IF;
  IF new.id IS DISTINCT FROM old.id OR new.auth_id IS DISTINCT FROM old.auth_id
    OR new.user_type IS DISTINCT FROM old.user_type THEN
    RAISE EXCEPTION 'La identidad o el rol migrado requieren reconciliación explícita'; END IF;
  IF auth.uid() IS NOT NULL AND NOT booking_v2.is_admin() AND (
    new.approved IS DISTINCT FROM old.approved OR new.blocked IS DISTINCT FROM old.blocked
    OR new.is_active IS DISTINCT FROM old.is_active) THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar permisos del perfil'; END IF;
  UPDATE public.persona SET nombre=new.first_name,apellido=new.last_name,telefono=new.mobile,
    email=new.email,imagen_perfil=new.profile_image,numero_documento=new.document_number,
    bloqueado=coalesce(new.blocked,false) OR (new.user_type='admin' AND NOT coalesce(new.approved,false)),
    verificado=coalesce(new.is_verified,false),actualizado_en=now() WHERE id=new.id;
  UPDATE public.perfil_conductor SET aprobado=coalesce(new.approved,false),
    activo=coalesce(new.is_active,true),en_servicio=coalesce(new.driver_active_status,false),
    numero_licencia=new.license_number,actualizado_en=now() WHERE id_persona=new.id;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.sync_migrated_profile() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_migrated_profile AFTER UPDATE OR DELETE ON public.users
FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_profile();

CREATE FUNCTION booking_v2.sync_migrated_vehicle() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE category_id integer; brand_id uuid; matches integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.vehiculo WHERE id=old.id) THEN
    IF tg_op='DELETE' THEN RETURN old; ELSE RETURN new; END IF;
  END IF;
  IF tg_op='DELETE' THEN
    UPDATE public.vehiculo SET activo=false,actualizado_en=now() WHERE id=old.id;
    RETURN old;
  END IF;
  IF new.id IS DISTINCT FROM old.id OR new.driver_id IS DISTINCT FROM old.driver_id THEN
    RAISE EXCEPTION 'El vehículo migrado no puede cambiar de identidad o propietario'; END IF;
  IF new.service_type IS DISTINCT FROM old.service_type THEN
    SELECT count(*),min(m.core_category_id) INTO matches,category_id
      FROM booking_v2.core_category_ids m WHERE booking_v2.category_matches(m.booking_category_id,new.service_type);
    IF matches<>1 THEN RAISE EXCEPTION 'Categoría de vehículo inexistente o ambigua'; END IF;
  ELSE
    SELECT id_categoria INTO category_id FROM public.vehiculo WHERE id=old.id;
  END IF;
  IF new.make IS NOT NULL THEN
    SELECT id INTO brand_id FROM public.marca_vehiculo WHERE nombre=new.make LIMIT 1;
    IF brand_id IS NULL THEN
      INSERT INTO public.marca_vehiculo(nombre) VALUES(new.make) RETURNING id INTO brand_id;
    END IF;
  END IF;
  UPDATE public.vehiculo SET id_categoria=category_id,id_marca=brand_id,linea=new.model,
    color=new.color,placa=new.plate,capacidad=coalesce(new.capacity,4),tipo_servicio=new.service_type,
    activo=coalesce(new.is_active,false),actualizado_en=now() WHERE id=new.id;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.sync_migrated_vehicle() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_migrated_vehicle AFTER UPDATE OR DELETE ON public.cars
FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_vehicle();

CREATE FUNCTION booking_v2.sync_migrated_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE driver_id uuid;
BEGIN
  IF tg_op='DELETE' THEN
    UPDATE public.membresia SET estado='CANCELADA',actualizado_en=now() WHERE id=old.uid;
    RETURN old;
  END IF;
  IF tg_op='UPDATE' AND new.uid IS DISTINCT FROM old.uid THEN
    RAISE EXCEPTION 'No puede cambiar la identidad de una membresía'; END IF;
  SELECT p.id INTO driver_id FROM public.persona p JOIN public.perfil_conductor d ON d.id_persona=p.id
    WHERE coalesce(p.auth_id,p.id)=new.conductor;
  IF driver_id IS NULL THEN RETURN new; END IF;
  INSERT INTO public.membresia(id,id_conductor,estado,fecha_inicio,fecha_fin)
    VALUES(new.uid,driver_id,upper(new.status)::public.estado_membresia,new.fecha_inicio,new.fecha_terminada)
    ON CONFLICT(id) DO UPDATE SET id_conductor=excluded.id_conductor,estado=excluded.estado,
      fecha_inicio=excluded.fecha_inicio,fecha_fin=excluded.fecha_fin,actualizado_en=now();
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.sync_migrated_membership() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sync_migrated_membership AFTER INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_membership();
