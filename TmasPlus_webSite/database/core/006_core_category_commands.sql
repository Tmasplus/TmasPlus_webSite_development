-- Preserve existing category editor payloads while storing only core categories.
CREATE FUNCTION booking_v2.write_core_category() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,booking_v2,pg_temp AS $$
DECLARE core_id integer;
BEGIN
  IF NOT booking_v2.is_admin() THEN RAISE EXCEPTION 'Administrador habilitado requerido'; END IF;
  IF tg_op='DELETE' THEN
    -- Referential constraints protect vehicle and booking history.
    DELETE FROM booking_v2.core_category_ids WHERE booking_category_id=old.id RETURNING core_category_id INTO core_id;
    DELETE FROM public.categoria_vehiculo WHERE id=core_id;
    RETURN old;
  END IF;
  IF tg_op='INSERT' THEN
    INSERT INTO public.categoria_vehiculo(nombre,descripcion,imagen_url,capacidad,activo,
      tarifa_base,tarifa_base_inter,valor_km,valor_km_inter,valor_hora,valor_hora_inter,
      tarifa_minima,tarifa_minima_inter,delta_aeropuerto,delta_aeropuerto_prog,
      convenience_fee,convenience_fee_tipo,umbral_intermunicipal_km)
    VALUES(new.name,new.description,new.image,coalesce(new.capacity,4),coalesce(new.is_active,true),
      coalesce(new.base_price,0),coalesce(new.base_price_inter,0),coalesce(new.price_per_km,0),coalesce(new.price_per_km_inter,0),
      coalesce(new.rate_per_hour,new.valor_hora,0),coalesce(new.rate_per_hour_inter,0),
      coalesce(new.min_fare,0),coalesce(new.min_fare_inter,0),coalesce(new.delta_aeropuerto,0),coalesce(new.delta_aeropuerto_prog,0),
      coalesce(new.convenience_fee,0),coalesce(new.convenience_fee_type,'percentage')::public.tipo_descuento,
      coalesce(new.umbral_intermunicipal_km,29)) RETURNING id INTO core_id;
    INSERT INTO booking_v2.core_category_ids(booking_category_id,core_category_id)
      VALUES(coalesce(new.id,gen_random_uuid()),core_id) RETURNING booking_category_id INTO new.id;
  ELSE
    IF new.id IS DISTINCT FROM old.id OR new.core_id IS DISTINCT FROM old.core_id THEN
      RAISE EXCEPTION 'No puede cambiar la identidad de la categoría'; END IF;
    core_id:=old.core_id;
    UPDATE public.categoria_vehiculo SET nombre=new.name,descripcion=new.description,imagen_url=new.image,
      capacidad=new.capacity,activo=new.is_active,tarifa_base=new.base_price,tarifa_base_inter=new.base_price_inter,
      valor_km=new.price_per_km,valor_km_inter=new.price_per_km_inter,
      valor_hora=CASE WHEN new.rate_per_hour IS DISTINCT FROM old.rate_per_hour THEN new.rate_per_hour
        WHEN new.valor_hora IS DISTINCT FROM old.valor_hora THEN new.valor_hora ELSE old.rate_per_hour END,
      valor_hora_inter=new.rate_per_hour_inter,tarifa_minima=new.min_fare,tarifa_minima_inter=new.min_fare_inter,
      delta_aeropuerto=new.delta_aeropuerto,delta_aeropuerto_prog=new.delta_aeropuerto_prog,
      convenience_fee=new.convenience_fee,convenience_fee_tipo=new.convenience_fee_type::public.tipo_descuento,
      umbral_intermunicipal_km=new.umbral_intermunicipal_km,actualizado_en=now()
    WHERE id=core_id;
  END IF;
  SELECT * INTO new FROM booking_v2.core_car_types WHERE id=new.id;
  RETURN new;
END $$;
REVOKE ALL ON FUNCTION booking_v2.write_core_category() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER core_category_write INSTEAD OF INSERT OR UPDATE OR DELETE ON booking_v2.core_car_types
FOR EACH ROW EXECUTE FUNCTION booking_v2.write_core_category();
GRANT INSERT,UPDATE,DELETE ON booking_v2.core_car_types TO authenticated;
