-- =====================================================================================================
-- 022 · Recomendados: precio fijo (sin recálculo) + soporte abierto hasta cierre del admin
-- Requiere: 020_reservas_recomendadas.sql, 020_parche_recomendadas_detalle.sql, 021_conductor_metodos_pago.sql
-- Ejecutar una sola vez en core (SQL Editor).
-- =====================================================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

-- ---------- 1. Precio fijo: tarifa_min = tarifa_max; liquidación NO sigue recálculos de km/tiempo ----------

CREATE OR REPLACE FUNCTION public.app_conductor_solicitar_viaje(p_cliente uuid, p_input jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  yo uuid := public._conductor_activo();
  bid uuid;
  cid integer;
  scheduled boolean;
  requested timestamptz;
  fmin numeric(14,2);
  fmax numeric(14,2);
  acordado numeric(14,2);
  origen_tarifa text := public._txt(p_input, 'fare_source');
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conductor_cliente
    WHERE id_conductor = yo AND id_cliente = p_cliente AND activo
  ) THEN RAISE EXCEPTION 'Ese cliente no esta en tu cartera'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.persona p
    JOIN public.persona_rol r ON r.id_persona = p.id AND r.rol = 'cliente'
    WHERE p.id = p_cliente AND NOT p.bloqueado
  ) THEN RAISE EXCEPTION 'El cliente esta bloqueado o no es Usuario App'; END IF;

  cid := (p_input->>'car_type_id')::integer;
  IF NOT EXISTS (
    SELECT 1 FROM public.categoria_vehiculo WHERE id = cid AND activo AND autorizado
  ) THEN RAISE EXCEPTION 'Categoria invalida o inactiva'; END IF;

  IF coalesce(p_input->>'booking_type', '') NOT IN ('immediate', 'scheduled', 'reservation')
  THEN RAISE EXCEPTION 'Tipo de reserva invalido'; END IF;

  scheduled := p_input->>'booking_type' <> 'immediate';
  requested := CASE WHEN scheduled THEN (p_input->>'booking_date')::timestamptz ELSE now() END;
  IF requested IS NULL OR (scheduled AND requested <= now())
  THEN RAISE EXCEPTION 'Fecha de reserva invalida'; END IF;

  IF NOT coalesce((p_input#>>'{pickup,lat}')::numeric BETWEEN -90 AND 90, false)
     OR NOT coalesce((p_input#>>'{destination,lat}')::numeric BETWEEN -90 AND 90, false)
     OR NOT coalesce((p_input#>>'{pickup,lng}')::numeric BETWEEN -180 AND 180, false)
     OR NOT coalesce((p_input#>>'{destination,lng}')::numeric BETWEEN -180 AND 180, false)
     OR coalesce(trim(p_input#>>'{pickup,address}'), '') = ''
     OR coalesce(trim(p_input#>>'{destination,address}'), '') = ''
  THEN RAISE EXCEPTION 'Origen o destino invalido'; END IF;

  IF NOT coalesce((p_input->>'distance_km')::numeric >= 0, false)
     OR NOT coalesce((p_input->>'duration_min')::numeric >= 0, false)
  THEN RAISE EXCEPTION 'Distancia o duracion invalida'; END IF;

  IF origen_tarifa IS NULL OR origen_tarifa NOT IN ('recomendada', 'manual')
  THEN RAISE EXCEPTION 'Origen de tarifa invalido'; END IF;

  -- Precio único: el mínimo (o valor fijo manual) es lo que ve quien acepta y lo que se cobra al final.
  fmin := (p_input->>'fare_min')::numeric;
  fmax := coalesce(nullif((p_input->>'fare_max')::numeric, 0), fmin);
  IF fmin IS NULL OR fmin <= 0 THEN RAISE EXCEPTION 'La tarifa es invalida'; END IF;
  fmax := fmin;

  acordado := (p_input->>'agreed_value')::numeric;
  IF acordado IS NOT NULL AND acordado <= 0
  THEN RAISE EXCEPTION 'El valor acordado debe ser mayor que cero'; END IF;

  PERFORM set_config('tplus.reserva_recomendada', '1', true);
  INSERT INTO public.reserva(
    id_cliente, id_categoria, estado, tipo_reserva, solicitado_en,
    origen_direccion, origen_lat, origen_lng, destino_direccion, destino_lat, destino_lng,
    distancia_km, duracion_seg, precio, precio_estimado, costo_total, ganancia_conductor,
    convenience_fees, descuento, modo_pago, observaciones, costo_viaje
  ) VALUES (
    p_cliente, cid, 'NEW',
    (CASE WHEN scheduled THEN 'scheduled' ELSE 'immediate' END)::public.tipo_reserva,
    requested,
    p_input#>>'{pickup,address}', (p_input#>>'{pickup,lat}')::numeric, (p_input#>>'{pickup,lng}')::numeric,
    p_input#>>'{destination,address}', (p_input#>>'{destination,lat}')::numeric, (p_input#>>'{destination,lng}')::numeric,
    (p_input->>'distance_km')::numeric, round((p_input->>'duration_min')::numeric * 60)::integer,
    fmin, fmin, fmin, fmin, 0, 0, 'recomendado'::public.modo_pago,
    public._txt(p_input, 'observations'), fmin
  ) RETURNING id INTO bid;
  PERFORM set_config('tplus.reserva_recomendada', '', true);

  INSERT INTO public.reserva_recomendada(
    id_reserva, id_solicitante, id_cliente, tarifa_origen, tarifa_min, tarifa_max, valor_acordado
  ) VALUES (bid, yo, p_cliente, origen_tarifa, fmin, fmax, acordado);

  INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, id_actor, nota)
  VALUES (bid, 'creada', yo, 'Tarifa fija ' || fmin::text);

  RETURN bid;
END $$;

-- Liquidación: monto = tarifa fija (tarifa_min). No sigue costo_total recalculado por km/tiempo.
CREATE OR REPLACE FUNCTION public.trg_reserva_recomendada_liquidacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  rr public.reserva_recomendada%rowtype;
  liq public.reserva_recomendada_liquidacion%rowtype;
  fijo numeric(14,2);
BEGIN
  IF NEW.modo_pago::text <> 'recomendado' THEN RETURN NEW; END IF;
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;

  SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva = NEW.id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  fijo := rr.tarifa_min;

  IF NEW.estado::text = 'CANCELLED' AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, id_actor, nota)
    VALUES (NEW.id, 'cancelada', public.persona_actual_id(), NEW.motivo_cancelacion);
    RETURN NEW;
  END IF;

  IF NEW.estado::text NOT IN ('COMPLETE', 'PAID') OR NEW.id_conductor IS NULL THEN RETURN NEW; END IF;

  -- Congela el precio de la reserva al valor fijo acordado (sin recálculo).
  UPDATE public.reserva
  SET precio = fijo,
      precio_estimado = fijo,
      costo_total = fijo,
      costo_viaje = fijo,
      ganancia_conductor = fijo
  WHERE id = NEW.id
    AND (
      precio IS DISTINCT FROM fijo
      OR costo_total IS DISTINCT FROM fijo
      OR precio_estimado IS DISTINCT FROM fijo
      OR costo_viaje IS DISTINCT FROM fijo
      OR ganancia_conductor IS DISTINCT FROM fijo
    );

  SELECT * INTO liq FROM public.reserva_recomendada_liquidacion WHERE id_reserva = NEW.id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.reserva_recomendada_liquidacion(
      id_reserva, id_pagador, id_receptor, monto, completado_en, vence_en
    ) VALUES (
      NEW.id, rr.id_solicitante, NEW.id_conductor, fijo, now(), now() + public._recomendacion_plazo()
    );
    INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, nota)
    VALUES (NEW.id, 'liquidacion_abierta', 'Monto fijo ' || fijo::text);
  ELSIF liq.estado = 'pendiente'
        AND liq.pago_reportado_en IS NULL
        AND liq.recibido IS NULL
        AND liq.monto IS DISTINCT FROM fijo THEN
    UPDATE public.reserva_recomendada_liquidacion SET monto = fijo WHERE id_reserva = NEW.id;
    INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, nota)
    VALUES (NEW.id, 'monto_actualizado', liq.monto::text || ' -> ' || fijo::text || ' (fijo)');
  END IF;

  RETURN NEW;
END $$;

-- ---------- 2. Soporte: hilo abierto hasta que el admin lo cierre ----------

ALTER TABLE public.reserva_recomendada
  ADD COLUMN IF NOT EXISTS soporte_cerrado_en timestamptz,
  ADD COLUMN IF NOT EXISTS soporte_cerrado_por uuid REFERENCES public.persona(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.reserva_recomendada.soporte_cerrado_en IS
  'Cuando el admin cierra el hilo. NULL = abierto (se puede seguir escribiendo).';

CREATE TABLE IF NOT EXISTS public.reserva_recomendada_soporte_msg (
  id bigserial PRIMARY KEY,
  id_reserva uuid NOT NULL REFERENCES public.reserva_recomendada(id_reserva) ON DELETE CASCADE,
  id_autor uuid REFERENCES public.persona(id) ON DELETE SET NULL,
  rol text NOT NULL CHECK (rol IN ('conductor', 'admin')),
  cuerpo text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reserva_recomendada_soporte_msg_reserva_ix
  ON public.reserva_recomendada_soporte_msg(id_reserva, creado_en);

ALTER TABLE public.reserva_recomendada_soporte_msg ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS p_rr_soporte_msg_select ON public.reserva_recomendada_soporte_msg;
CREATE POLICY p_rr_soporte_msg_select ON public.reserva_recomendada_soporte_msg FOR SELECT TO authenticated
USING (
  public.es_admin()
  OR EXISTS (
    SELECT 1
    FROM public.reserva_recomendada rr
    JOIN public.reserva r ON r.id = rr.id_reserva
    WHERE rr.id_reserva = reserva_recomendada_soporte_msg.id_reserva
      AND (rr.id_solicitante = public.persona_actual_id() OR r.id_conductor = public.persona_actual_id())
  )
);

REVOKE ALL ON public.reserva_recomendada_soporte_msg FROM PUBLIC, anon;
GRANT SELECT ON public.reserva_recomendada_soporte_msg TO authenticated;

-- Conductor envía mensaje: abre hilo si no había; si estaba cerrado, lo reabre (misma trazabilidad).
CREATE OR REPLACE FUNCTION public.app_recomendacion_reportar_soporte(p_reserva uuid, p_nota text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  yo uuid := public.persona_actual_id();
  rr public.reserva_recomendada%rowtype;
  conductor uuid;
  nota text := left(nullif(trim(p_nota), ''), 500);
BEGIN
  SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva = p_reserva FOR UPDATE;
  SELECT id_conductor INTO conductor FROM public.reserva WHERE id = p_reserva;
  IF rr.id_reserva IS NULL OR yo IS NULL
     OR (yo <> rr.id_solicitante AND yo IS DISTINCT FROM conductor)
  THEN RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = '42501'; END IF;
  IF nota IS NULL THEN RAISE EXCEPTION 'Cuentanos que paso'; END IF;

  UPDATE public.reserva_recomendada
  SET soporte_solicitado_en = coalesce(soporte_solicitado_en, now()),
      soporte_solicitado_por = coalesce(soporte_solicitado_por, yo),
      soporte_nota = nota,
      soporte_cerrado_en = NULL,
      soporte_cerrado_por = NULL
  WHERE id_reserva = p_reserva;

  INSERT INTO public.reserva_recomendada_soporte_msg(id_reserva, id_autor, rol, cuerpo)
  VALUES (p_reserva, yo, 'conductor', nota);

  INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, id_actor, nota)
  VALUES (p_reserva, 'soporte_reportado', yo, nota);
END $$;

-- Admin responde SIN cerrar el hilo.
CREATE OR REPLACE FUNCTION public.web_admin_atender_soporte_recomendacion(p_reserva uuid, p_nota text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  rr public.reserva_recomendada%rowtype;
  nota text := left(nullif(trim(p_nota), ''), 1000);
BEGIN
  PERFORM public.web_require_admin();
  IF nota IS NULL THEN RAISE EXCEPTION 'Escribe la respuesta para el conductor'; END IF;

  SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva = p_reserva FOR UPDATE;
  IF rr.id_reserva IS NULL OR rr.soporte_solicitado_en IS NULL
  THEN RAISE EXCEPTION 'Este viaje no tiene un reporte a soporte'; END IF;
  IF rr.soporte_cerrado_en IS NOT NULL
  THEN RAISE EXCEPTION 'Este soporte ya esta cerrado. El conductor puede abrir otro mensaje.'; END IF;

  UPDATE public.reserva_recomendada
  SET soporte_atendido_en = now(), soporte_respuesta = nota
  WHERE id_reserva = p_reserva;

  INSERT INTO public.reserva_recomendada_soporte_msg(id_reserva, id_autor, rol, cuerpo)
  VALUES (p_reserva, public.persona_actual_id(), 'admin', nota);

  INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, id_actor, nota)
  VALUES (p_reserva, 'soporte_atendido', public.persona_actual_id(), nota);

  IF rr.soporte_solicitado_por IS NOT NULL THEN
    PERFORM public._recomendacion_push(
      ARRAY[rr.soporte_solicitado_por],
      'Soporte T+Plus te respondio',
      left(nota, 180),
      CASE WHEN rr.soporte_solicitado_por = rr.id_solicitante
        THEN 'recomendacion-pagador' ELSE 'recomendacion-receptor' END,
      p_reserva
    );
  END IF;
END $$;

-- Admin cierra el hilo (la app muestra "Soporte terminado").
CREATE OR REPLACE FUNCTION public.web_admin_cerrar_soporte_recomendacion(p_reserva uuid, p_nota text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  rr public.reserva_recomendada%rowtype;
  nota text := left(nullif(trim(coalesce(p_nota, '')), ''), 500);
BEGIN
  PERFORM public.web_require_admin();
  SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva = p_reserva FOR UPDATE;
  IF rr.id_reserva IS NULL OR rr.soporte_solicitado_en IS NULL
  THEN RAISE EXCEPTION 'Este viaje no tiene soporte abierto'; END IF;
  IF rr.soporte_cerrado_en IS NOT NULL THEN RAISE EXCEPTION 'El soporte ya estaba cerrado'; END IF;

  UPDATE public.reserva_recomendada
  SET soporte_cerrado_en = now(),
      soporte_cerrado_por = public.persona_actual_id()
  WHERE id_reserva = p_reserva;

  IF nota IS NOT NULL THEN
    INSERT INTO public.reserva_recomendada_soporte_msg(id_reserva, id_autor, rol, cuerpo)
    VALUES (p_reserva, public.persona_actual_id(), 'admin', nota);
  END IF;

  INSERT INTO public.reserva_recomendada_evento(id_reserva, tipo, id_actor, nota)
  VALUES (p_reserva, 'soporte_atendido', public.persona_actual_id(), coalesce(nota, 'Soporte cerrado por admin'));

  IF rr.soporte_solicitado_por IS NOT NULL THEN
    PERFORM public._recomendacion_push(
      ARRAY[rr.soporte_solicitado_por],
      'Soporte T+Plus cerro el caso',
      coalesce(nota, 'Puedes abrir otro mensaje si lo necesitas.'),
      CASE WHEN rr.soporte_solicitado_por = rr.id_solicitante
        THEN 'recomendacion-pagador' ELSE 'recomendacion-receptor' END,
      p_reserva
    );
  END IF;
END $$;

-- Detalle app: incluye closed_at + mensajes del hilo (trazabilidad).
CREATE OR REPLACE FUNCTION public.app_recomendacion_detalle(p_reserva uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  yo uuid := public.persona_actual_id();
  rr public.reserva_recomendada%rowtype;
  l public.reserva_recomendada_liquidacion%rowtype;
  conductor uuid;
  rol text;
  viaje jsonb;
  ruta jsonb := '[]';
  eventos jsonb;
  metodos jsonb;
  msgs jsonb := '[]';
BEGIN
  SELECT * INTO rr FROM public.reserva_recomendada WHERE id_reserva = p_reserva;
  IF rr.id_reserva IS NULL OR yo IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = '42501'; END IF;
  SELECT id_conductor INTO conductor FROM public.reserva WHERE id = p_reserva;
  rol := CASE WHEN yo = rr.id_solicitante THEN 'solicitante' WHEN yo = conductor THEN 'conductor' END;
  IF rol IS NULL THEN RAISE EXCEPTION 'Viaje no encontrado' USING ERRCODE = '42501'; END IF;

  SELECT jsonb_build_object(
    'id', b.id, 'reference', b.reference, 'status', b.status, 'booking_type', b.booking_type,
    'booking_date', b.booking_date, 'created_at', b.created_at, 'car_type', b.car_type,
    'pickup_address', b.pickup_address, 'pickup_lat', b.pickup_lat, 'pickup_lng', b.pickup_lng,
    'drop_address', b.drop_address, 'drop_lat', b.drop_lat, 'drop_lng', b.drop_lng,
    'distance', b.distance, 'duration', b.duration, 'observations', b.observations,
    'customer_name', b.customer_name, 'customer_contact', b.customer_contact,
    'driver_name', b.driver_name, 'driver_contact', b.driver_contact, 'driver_image', b.driver_image,
    'plate_number', b.plate_number, 'vehicle_make', b.vehicle_make, 'vehicle_color', b.vehicle_color,
    'driver_arrived_time', b.driver_arrived_time, 'trip_start_time', b.trip_start_time, 'trip_end_time', b.trip_end_time,
    'final_price', CASE WHEN b.status IN ('COMPLETE', 'PAID') THEN coalesce(rr.tarifa_min, b.total_cost) END
  ) INTO viaje FROM public.bookings b WHERE b.id = p_reserva;

  BEGIN
    SELECT coalesce(jsonb_agg(jsonb_build_object('lat', t.lat, 'lng', t.lng) ORDER BY t.created_at), '[]'::jsonb)
    INTO ruta
    FROM (
      SELECT lat, lng, created_at FROM public.booking_tracking
      WHERE booking_id = p_reserva ORDER BY created_at DESC LIMIT 600
    ) t;
  EXCEPTION WHEN undefined_table OR undefined_column THEN ruta := '[]'::jsonb;
  END;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'type', e.tipo, 'created_at', e.creado_en,
    'note', CASE
      WHEN rol = 'solicitante' OR e.tipo IN ('resuelta', 'soporte_reportado', 'soporte_atendido', 'pago_no_recibido')
      THEN e.nota END
  ) ORDER BY e.creado_en), '[]'::jsonb)
  INTO eventos
  FROM public.reserva_recomendada_evento e
  WHERE e.id_reserva = p_reserva
    AND (rol = 'solicitante' OR e.tipo NOT IN ('creada', 'monto_actualizado'));

  SELECT * INTO l FROM public.reserva_recomendada_liquidacion WHERE id_reserva = p_reserva;
  IF conductor IS NOT NULL THEN metodos := public.app_conductor_metodos_pago_de(conductor); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'role', m.rol, 'body', m.cuerpo, 'created_at', m.creado_en, 'mine', m.id_autor = yo
  ) ORDER BY m.creado_en), '[]'::jsonb)
  INTO msgs
  FROM public.reserva_recomendada_soporte_msg m
  WHERE m.id_reserva = p_reserva;

  RETURN coalesce(viaje, '{}'::jsonb) || jsonb_build_object(
    'role', rol,
    'requester_name', public._recomendacion_nombre(rr.id_solicitante),
    'requester_contact', (SELECT telefono FROM public.persona WHERE id = rr.id_solicitante),
    'fare_source', rr.tarifa_origen, 'fare_min', rr.tarifa_min, 'fare_max', rr.tarifa_max,
    'agreed_value', CASE WHEN rol = 'solicitante' THEN rr.valor_acordado END,
    'receiver_payment_methods', metodos,
    'settlement', CASE WHEN l.id_reserva IS NULL THEN NULL ELSE jsonb_build_object(
      'status', l.estado, 'amount', l.monto, 'due_at', l.vence_en,
      'overdue', public._liquidacion_vencida(l.estado, l.vence_en),
      'paid_reported_at', l.pago_reportado_en, 'received', l.recibido,
      'received_reported_at', l.recibido_reportado_en,
      'resolution', l.resultado_admin, 'resolution_note', l.nota_resolucion
    ) END,
    'support', CASE WHEN rr.soporte_solicitado_en IS NULL THEN NULL ELSE jsonb_build_object(
      'requested_at', rr.soporte_solicitado_en,
      'requested_by', public._recomendacion_nombre(rr.soporte_solicitado_por),
      'mine', rr.soporte_solicitado_por = yo,
      'note', rr.soporte_nota,
      'attended_at', rr.soporte_atendido_en,
      'response', rr.soporte_respuesta,
      'closed_at', rr.soporte_cerrado_en,
      'messages', msgs
    ) END,
    'route', ruta, 'events', eventos
  );
END $$;

-- ---------- 3. Vistas admin: pendiente = abierto sin cerrar (no basta con haber respondido) ----------

CREATE OR REPLACE VIEW public.web_reservas_recomendadas WITH (security_barrier = true) AS
SELECT
  rr.id_reserva AS id, r.referencia AS reference, r.estado::text AS status, r.tipo_reserva::text AS booking_type,
  r.solicitado_en AS booking_date, rr.creado_en AS created_at,
  rr.id_solicitante AS requester_id, trim(concat_ws(' ', ps.nombre, ps.apellido)) AS requester_name,
  ps.telefono AS requester_contact,
  rr.id_cliente AS customer_id, trim(concat_ws(' ', pc.nombre, pc.apellido)) AS customer_name,
  pc.telefono AS customer_contact,
  r.id_conductor AS driver_id, nullif(trim(concat_ws(' ', pd.nombre, pd.apellido)), '') AS driver_name,
  pd.telefono AS driver_contact, v.placa AS plate_number, cat.nombre AS car_type,
  r.origen_direccion AS pickup_address, r.destino_direccion AS drop_address, r.distancia_km AS distance_km,
  rr.tarifa_origen AS fare_source, rr.tarifa_min AS fare_min, rr.tarifa_max AS fare_max,
  CASE WHEN r.estado::text IN ('COMPLETE', 'PAID') THEN rr.tarifa_min END AS final_price,
  rr.valor_acordado AS agreed_value,
  rr.valor_acordado - coalesce(l.monto, rr.tarifa_min) AS requester_margin,
  r.cancelado_por::text AS cancelled_by, r.motivo_cancelacion AS cancel_reason,
  l.estado AS settlement_status, l.monto AS settlement_amount, l.completado_en AS completed_at,
  l.vence_en AS settlement_due_at,
  coalesce(public._liquidacion_vencida(l.estado, l.vence_en), false) AS settlement_overdue,
  (
    coalesce(l.estado = 'en_disputa', false)
    OR coalesce(public._liquidacion_vencida(l.estado, l.vence_en), false)
    OR (rr.soporte_solicitado_en IS NOT NULL AND rr.soporte_cerrado_en IS NULL)
  ) AS needs_support,
  l.pago_reportado_en AS paid_reported_at, l.recibido AS received, l.recibido_reportado_en AS received_reported_at,
  l.resultado_admin AS resolution, l.nota_resolucion AS resolution_note, l.resuelto_en AS resolved_at,
  rr.soporte_solicitado_en AS support_requested_at,
  nullif(trim(concat_ws(' ', psop.nombre, psop.apellido)), '') AS support_requested_by,
  rr.soporte_nota AS support_note,
  rr.soporte_atendido_en AS support_attended_at,
  rr.soporte_respuesta AS support_response,
  rr.soporte_cerrado_en AS support_closed_at
FROM public.reserva_recomendada rr
JOIN public.reserva r ON r.id = rr.id_reserva
JOIN public.persona ps ON ps.id = rr.id_solicitante
JOIN public.persona pc ON pc.id = rr.id_cliente
LEFT JOIN public.persona pd ON pd.id = r.id_conductor
LEFT JOIN public.persona psop ON psop.id = rr.soporte_solicitado_por
LEFT JOIN public.vehiculo v ON v.id = r.id_vehiculo
LEFT JOIN public.categoria_vehiculo cat ON cat.id = r.id_categoria
LEFT JOIN public.reserva_recomendada_liquidacion l ON l.id_reserva = rr.id_reserva
WHERE (SELECT public.es_admin());

CREATE OR REPLACE VIEW public.web_recomendaciones_resumen WITH (security_barrier = true) AS
SELECT s.* FROM (
  SELECT
    count(*) FILTER (WHERE x.estado = 'pendiente' AND NOT x.vencida) AS sin_pagar,
    count(*) FILTER (WHERE x.estado = 'pendiente' AND x.vencida) AS sin_pagar_vencidas,
    count(*) FILTER (WHERE x.estado = 'pago_reportado' AND NOT x.vencida) AS pagadas_sin_confirmar,
    count(*) FILTER (WHERE x.estado = 'pago_reportado' AND x.vencida) AS pagadas_sin_confirmar_vencidas,
    count(*) FILTER (WHERE x.estado = 'confirmado') AS confirmadas,
    count(*) FILTER (WHERE x.estado = 'en_disputa') AS en_disputa,
    count(*) FILTER (WHERE x.estado = 'resuelto') AS resueltas,
    count(*) FILTER (WHERE x.estado = 'en_disputa' OR x.vencida OR x.soporte) AS requieren_atencion,
    coalesce(sum(x.monto) FILTER (WHERE x.estado IN ('pendiente', 'pago_reportado', 'en_disputa')), 0) AS monto_por_pagar,
    coalesce(sum(x.monto) FILTER (WHERE x.estado = 'confirmado' OR x.resultado_admin = 'pagado'), 0) AS monto_pagado,
    count(*) FILTER (WHERE x.activo) AS viajes_activos,
    count(*) AS viajes_total,
    count(*) FILTER (WHERE x.soporte) AS soporte_pendiente
  FROM (
    SELECT l.estado, l.monto, l.resultado_admin,
      coalesce(public._liquidacion_vencida(l.estado, l.vence_en), false) AS vencida,
      (rr.soporte_solicitado_en IS NOT NULL AND rr.soporte_cerrado_en IS NULL) AS soporte,
      r.estado::text NOT IN ('COMPLETE', 'PAID', 'CANCELLED') AS activo
    FROM public.reserva_recomendada rr
    JOIN public.reserva r ON r.id = rr.id_reserva
    LEFT JOIN public.reserva_recomendada_liquidacion l ON l.id_reserva = rr.id_reserva
  ) x
) s
WHERE (SELECT public.es_admin());

-- Vista de detalle de reserva (admin): needs_support = chat abierto (no cerrado).
-- DROP obligatorio: CREATE OR REPLACE no puede insertar columnas en medio (42P16).
DROP VIEW IF EXISTS public.web_bookings_recomendadas;
CREATE VIEW public.web_bookings_recomendadas WITH (security_invoker = true) AS
SELECT b.*, rr.id_solicitante AS requester_id,
  nullif(trim(concat_ws(' ', ps.nombre, ps.apellido)), '') AS requester_name, ps.telefono AS requester_contact,
  rr.tarifa_origen AS fare_source, rr.tarifa_min AS fare_min, rr.tarifa_max AS fare_max,
  rr.valor_acordado AS agreed_value, rr.valor_acordado - coalesce(l.monto, rr.tarifa_min) AS requester_margin,
  l.estado AS settlement_status, l.monto AS settlement_amount, l.vence_en AS settlement_due_at,
  coalesce(public._liquidacion_vencida(l.estado, l.vence_en), false) AS settlement_overdue,
  (
    coalesce(l.estado = 'en_disputa', false)
    OR coalesce(public._liquidacion_vencida(l.estado, l.vence_en), false)
    OR (rr.soporte_solicitado_en IS NOT NULL AND rr.soporte_cerrado_en IS NULL)
  ) AS needs_support,
  l.resultado_admin AS resolution,
  rr.soporte_solicitado_en AS support_requested_at,
  rr.soporte_atendido_en AS support_attended_at,
  rr.soporte_cerrado_en AS support_closed_at,
  mp.efectivo AS driver_pay_cash,
  (mp.daviplata AND mp.daviplata_numero IS NOT NULL) AS driver_pay_daviplata,
  mp.daviplata_numero AS driver_daviplata_numero,
  (mp.nequi AND (mp.nequi_numero IS NOT NULL OR mp.nequi_breb IS NOT NULL)) AS driver_pay_nequi,
  mp.nequi_numero AS driver_nequi_numero,
  mp.nequi_breb AS driver_nequi_breb
FROM public.reserva_recomendada rr
CROSS JOIN LATERAL (SELECT wb.* FROM public.web_bookings wb WHERE wb.id = rr.id_reserva OFFSET 0) b
JOIN public.persona ps ON ps.id = rr.id_solicitante
LEFT JOIN public.reserva_recomendada_liquidacion l ON l.id_reserva = rr.id_reserva
LEFT JOIN public.conductor_metodo_pago mp ON mp.id_persona = b.driver_id
WHERE (SELECT public.es_admin());

GRANT SELECT ON public.web_bookings_recomendadas TO authenticated;

REVOKE ALL ON FUNCTION
  public.web_admin_cerrar_soporte_recomendacion(uuid, text),
  public.app_recomendacion_detalle(uuid),
  public.app_recomendacion_reportar_soporte(uuid, text),
  public.web_admin_atender_soporte_recomendacion(uuid, text)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.web_admin_cerrar_soporte_recomendacion(uuid, text),
  public.app_recomendacion_detalle(uuid),
  public.app_recomendacion_reportar_soporte(uuid, text),
  public.web_admin_atender_soporte_recomendacion(uuid, text)
TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
