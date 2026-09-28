-- Ejecutar despues de 001_views.sql. Solo funciones sobre tablas de core.
-- Los triggers existentes de reserva siguen activos y pueden enviar PUSH reales.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.web_require_admin() RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF auth.uid() IS NULL OR NOT public.es_admin() OR NOT EXISTS (
  SELECT 1 FROM public.persona WHERE auth_id=auth.uid() AND NOT bloqueado
 ) THEN RAISE EXCEPTION 'Administrador autorizado requerido' USING ERRCODE='42501'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.web_create_booking(p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE bid uuid; cid integer; scheduled boolean; requested timestamptz; trip_cost numeric; fees numeric; rebate numeric;
BEGIN
 PERFORM public.web_require_admin();
 cid := (p_input->>'car_type_id')::integer;
 IF NOT EXISTS (SELECT 1 FROM public.categoria_vehiculo WHERE id=cid AND activo AND autorizado)
 THEN RAISE EXCEPTION 'Categoria invalida o inactiva'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.persona p JOIN public.persona_rol r ON r.id_persona=p.id
  WHERE p.id=(p_input->>'customer_id')::uuid AND NOT p.bloqueado AND r.rol IN ('cliente','empresa'))
 THEN RAISE EXCEPTION 'Cliente invalido o bloqueado'; END IF;
 IF p_input->>'booking_type' NOT IN ('reservation','immediate') OR p_input->>'booking_type' IS NULL
 THEN RAISE EXCEPTION 'Tipo de reserva invalido'; END IF;
 scheduled := p_input->>'booking_type'='reservation';
 requested := CASE WHEN scheduled THEN (p_input->>'booking_date')::timestamptz ELSE now() END;
 IF requested IS NULL OR (scheduled AND requested<=now()) THEN RAISE EXCEPTION 'Fecha de reserva invalida'; END IF;
 IF NOT coalesce((p_input#>>'{pickup,lat}')::numeric BETWEEN -90 AND 90,false)
 OR NOT coalesce((p_input#>>'{destination,lat}')::numeric BETWEEN -90 AND 90,false)
 OR NOT coalesce((p_input#>>'{pickup,lng}')::numeric BETWEEN -180 AND 180,false)
 OR NOT coalesce((p_input#>>'{destination,lng}')::numeric BETWEEN -180 AND 180,false)
 OR coalesce(trim(p_input#>>'{pickup,address}'),'')='' OR coalesce(trim(p_input#>>'{destination,address}'),'')=''
 THEN RAISE EXCEPTION 'Origen o destino invalido'; END IF;
 IF NOT coalesce((p_input->>'total_cost')::numeric>=0,false)
 OR NOT coalesce((p_input->>'distance_km')::numeric>=0,false)
 OR NOT coalesce((p_input->>'duration_min')::numeric>=0,false)
 THEN RAISE EXCEPTION 'Importe, distancia o duracion invalida'; END IF;
 fees := coalesce((p_input->>'convenience_fees')::numeric,0);
 rebate := coalesce((p_input->>'discount')::numeric,0);
 -- total_cost is the final amount shown by the web, inclusive of fees/discount.
 -- Core recalculates it on every write: costo_viaje + fees - descuento.
 trip_cost := (p_input->>'total_cost')::numeric-fees+rebate;
 IF fees<0 OR rebate<0 OR trip_cost<0 THEN RAISE EXCEPTION 'Desglose de importe invalido'; END IF;
 INSERT INTO public.reserva(id_cliente,id_categoria,estado,tipo_reserva,solicitado_en,
  origen_direccion,origen_lat,origen_lng,destino_direccion,destino_lat,destino_lng,
  distancia_km,duracion_seg,precio,precio_estimado,costo_total,ganancia_conductor,
  convenience_fees,descuento,modo_pago,observaciones,costo_viaje)
 VALUES ((p_input->>'customer_id')::uuid,cid,'NEW',
  (CASE WHEN scheduled THEN 'scheduled' ELSE 'immediate' END)::public.tipo_reserva,requested,
  p_input#>>'{pickup,address}',(p_input#>>'{pickup,lat}')::numeric,(p_input#>>'{pickup,lng}')::numeric,
  p_input#>>'{destination,address}',(p_input#>>'{destination,lat}')::numeric,(p_input#>>'{destination,lng}')::numeric,
  (p_input->>'distance_km')::numeric,round((p_input->>'duration_min')::numeric*60)::integer,
  (p_input->>'total_cost')::numeric,(p_input->>'estimate')::numeric,(p_input->>'total_cost')::numeric,
  coalesce((p_input->>'driver_share')::numeric,0),coalesce((p_input->>'convenience_fees')::numeric,0),
  coalesce((p_input->>'discount')::numeric,0),(p_input->>'payment_mode')::public.modo_pago,p_input->>'observations',trip_cost)
 RETURNING id INTO bid;
 RETURN bid;
END $$;

CREATE OR REPLACE FUNCTION public.web_assignable_drivers(p_query text DEFAULT '') RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM public.web_require_admin();
 RETURN QUERY SELECT to_jsonb(u)||jsonb_build_object('vehicle',to_jsonb(v))
 FROM public.web_users u JOIN public.perfil_conductor d ON d.id_persona=u.id
 JOIN LATERAL (SELECT c.id,c.make,c.model,c.plate,c.service_type FROM public.web_cars c
  WHERE c.driver_id=u.id AND c.is_active ORDER BY c.updated_at DESC,c.id LIMIT 1) v ON true
 WHERE d.aprobado AND d.activo AND NOT d.ocupado AND NOT u.blocked
 AND NOT EXISTS(SELECT 1 FROM public.reserva r WHERE r.id_conductor=u.id
  AND r.estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED'))
 AND concat_ws(' ',u.first_name,u.last_name,u.mobile,v.plate) ILIKE '%'||coalesce(p_query,'')||'%';
END $$;

CREATE OR REPLACE FUNCTION public.web_assign_booking(p_booking_id uuid,p_driver_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.reserva%rowtype; d public.perfil_conductor%rowtype; car uuid;
BEGIN
 PERFORM public.web_require_admin();
 SELECT * INTO STRICT d FROM public.perfil_conductor WHERE id_persona=p_driver_id FOR UPDATE;
 SELECT * INTO STRICT r FROM public.reserva WHERE id=p_booking_id FOR UPDATE;
 IF r.estado NOT IN ('NEW','PENDING') OR r.id_conductor IS NOT NULL THEN RAISE EXCEPTION 'La reserva ya no esta disponible'; END IF;
 IF NOT d.aprobado OR NOT d.activo OR d.ocupado OR EXISTS(SELECT 1 FROM public.persona WHERE id=p_driver_id AND bloqueado)
 OR EXISTS(SELECT 1 FROM public.reserva WHERE id_conductor=p_driver_id AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED'))
 THEN RAISE EXCEPTION 'Conductor no disponible'; END IF;
 SELECT id INTO car FROM public.vehiculo WHERE id_conductor=p_driver_id AND activo AND id_categoria=r.id_categoria
 ORDER BY actualizado_en DESC,id LIMIT 1 FOR UPDATE;
 IF car IS NULL THEN RAISE EXCEPTION 'El conductor no tiene vehiculo activo de esta categoria'; END IF;
 UPDATE public.reserva SET id_conductor=p_driver_id,id_vehiculo=car,estado='ACCEPTED' WHERE id=r.id;
 UPDATE public.perfil_conductor SET ocupado=true WHERE id_persona=p_driver_id;
END $$;

CREATE OR REPLACE FUNCTION public.web_cancel_booking(p_booking_id uuid,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE r public.reserva%rowtype; driver uuid;
BEGIN
 PERFORM public.web_require_admin();
 SELECT id_conductor INTO driver FROM public.reserva WHERE id=p_booking_id;
 IF driver IS NOT NULL THEN PERFORM 1 FROM public.perfil_conductor WHERE id_persona=driver FOR UPDATE; END IF;
 SELECT * INTO STRICT r FROM public.reserva WHERE id=p_booking_id FOR UPDATE;
 IF r.id_conductor IS DISTINCT FROM driver THEN RAISE EXCEPTION 'La reserva cambio; vuelva a consultar'; END IF;
 IF r.estado IN ('COMPLETE','PAID','CANCELLED') THEN RAISE EXCEPTION 'Reserva finalizada'; END IF;
 UPDATE public.reserva SET estado='CANCELLED',cancelado_por='admin',cancelado_en=now(),
  motivo_cancelacion=coalesce(nullif(trim(p_reason),''),'Cancelada por administrador') WHERE id=r.id;
 IF driver IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.reserva WHERE id_conductor=driver
  AND estado IN ('ACCEPTED','ARRIVED','STARTED','REACHED')) THEN
  UPDATE public.perfil_conductor SET ocupado=false WHERE id_persona=driver;
 END IF;
END $$;

REVOKE ALL ON FUNCTION public.web_require_admin(),public.web_create_booking(jsonb),
 public.web_assignable_drivers(text),public.web_assign_booking(uuid,uuid),public.web_cancel_booking(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_require_admin(),public.web_create_booking(jsonb),
 public.web_assignable_drivers(text),public.web_assign_booking(uuid,uuid),public.web_cancel_booking(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
