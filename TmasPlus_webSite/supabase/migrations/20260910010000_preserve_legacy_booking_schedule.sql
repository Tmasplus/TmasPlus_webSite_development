-- Preserve scheduling when importing legacy app reservations. No rows are migrated here.
create or replace function booking_v2.migrate_legacy_booking(p_legacy_booking_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
declare
  v_legacy public.bookings%rowtype;
  v_booking_id uuid;
  v_customer_id uuid;
  v_driver_id uuid;
  v_car_type_id uuid;
  v_car_id uuid;
  v_status booking_v2.booking_status;
  v_reference text;
  v_pickup_address text;
  v_dropoff_address text;
begin
  select id into v_booking_id
  from booking_v2.bookings
  where legacy_booking_id = p_legacy_booking_id;

  if v_booking_id is not null then
    return v_booking_id;
  end if;

  select * into strict v_legacy
  from public.bookings
  where id = p_legacy_booking_id;

  v_customer_id := coalesce(v_legacy.customer_id, v_legacy.customer);
  v_driver_id := coalesce(v_legacy.driver_id, v_legacy.driver);
  v_car_type_id := v_legacy.car_type_id;
  v_car_id := v_legacy.car_id;

  if v_customer_id is null then
    raise exception 'La reserva heredada no tiene cliente válido';
  end if;

  if v_car_type_id is null and nullif(v_legacy.car_type, '') is not null then
    select ct.id into v_car_type_id
    from public.car_types ct
    where lower(ct.name) = lower(v_legacy.car_type)
       or (
         lower(v_legacy.car_type) = 'servicio_especial'
         and lower(ct.name) = 'confortplus'
       )
    order by ct.is_active desc, ct.created_at
    limit 1;
  end if;

  if v_car_id is null
     and v_driver_id is not null
     and nullif(v_legacy.plate_number, '') is not null then
    select min(c.id::text)::uuid into v_car_id
    from public.cars c
    where c.driver_id = v_driver_id
      and upper(regexp_replace(coalesce(c.plate, ''), '[^A-Z0-9]', '', 'g')) =
          upper(regexp_replace(v_legacy.plate_number, '[^A-Z0-9]', '', 'g'))
    having count(*) = 1;
  end if;

  v_status := case v_legacy.status
    when 'NEW' then 'PENDING'::booking_v2.booking_status
    when 'PENDING' then 'PENDING'::booking_v2.booking_status
    when 'ACCEPTED' then 'ACCEPTED'::booking_v2.booking_status
    when 'ARRIVED' then 'ARRIVED_PICKUP'::booking_v2.booking_status
    when 'STARTED' then 'STARTED'::booking_v2.booking_status
    when 'REACHED' then 'ARRIVED_DESTINATION'::booking_v2.booking_status
    when 'COMPLETE' then 'COMPLETED'::booking_v2.booking_status
    when 'PAID' then 'PAID'::booking_v2.booking_status
    when 'CANCELLED' then 'CANCELLED'::booking_v2.booking_status
    else 'PENDING'::booking_v2.booking_status
  end;

  v_booking_id := gen_random_uuid();
  v_reference := coalesce(nullif(v_legacy.reference, ''),
    'MIG-' || substr(replace(p_legacy_booking_id::text, '-', ''), 1, 12));

  if exists (select 1 from booking_v2.bookings where reference = v_reference) then
    v_reference := left(v_reference, 25) || '-' || substr(replace(v_booking_id::text, '-', ''), 1, 8);
  end if;

  v_pickup_address := coalesce(
    nullif(v_legacy.pickup_address, ''),
    v_legacy.pickup_location ->> 'address',
    'Origen no disponible'
  );
  v_dropoff_address := coalesce(
    nullif(v_legacy.drop_address, ''),
    v_legacy.destination_location ->> 'address',
    'Destino no disponible'
  );

  insert into booking_v2.bookings (
    id, reference, idempotency_key,
    customer_id, requested_car_type_id,
    status, booking_type, scheduled_at, request_expires_at,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    waypoints, observations, payment_mode,
    accepted_at, arrived_pickup_at, started_at,
    arrived_destination_at, completed_at, paid_at, cancelled_at,
    cancellation_category, cancellation_reason,
    legacy_booking_id, created_at, updated_at
  ) values (
    v_booking_id, v_reference, 'migration:' || p_legacy_booking_id,
    v_customer_id, v_car_type_id,
    v_status,
    case when lower(v_legacy.booking_type) in ('reservation', 'scheduled')
      then 'SCHEDULED'::booking_v2.booking_type else 'IMMEDIATE'::booking_v2.booking_type end,
    case when lower(v_legacy.booking_type) in ('reservation', 'scheduled')
      then v_legacy.booking_date else null end,
    v_legacy.request_expires_at,
    v_pickup_address, v_legacy.pickup_lat, v_legacy.pickup_lng,
    v_dropoff_address, v_legacy.drop_lat, v_legacy.drop_lng,
    v_legacy.waypoints, v_legacy.observations, v_legacy.payment_mode,
    case when v_status in ('ACCEPTED','ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION','COMPLETED','PAID') then v_legacy.updated_at end,
    case when v_status in ('ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION','COMPLETED','PAID') then v_legacy.updated_at end,
    case when v_status in ('STARTED','ARRIVED_DESTINATION','COMPLETED','PAID') then coalesce(v_legacy.trip_start_time, v_legacy.updated_at) end,
    case when v_status in ('ARRIVED_DESTINATION','COMPLETED','PAID') then v_legacy.updated_at end,
    case when v_status in ('COMPLETED','PAID') then coalesce(v_legacy.trip_end_time, v_legacy.updated_at) end,
    case when v_status = 'PAID' then v_legacy.updated_at end,
    case when v_status = 'CANCELLED' then v_legacy.updated_at end,
    case when v_status = 'CANCELLED' then 'LEGACY_MIGRATION' end,
    case when v_status = 'CANCELLED' then coalesce(v_legacy.reason, 'Cancelación importada') end,
    p_legacy_booking_id,
    coalesce(v_legacy.created_at, now()),
    coalesce(v_legacy.updated_at, v_legacy.created_at, now())
  );

  insert into booking_v2.booking_status_events (
    booking_id, from_status, to_status,
    changed_by_user_id, source, reason, metadata, occurred_at
  ) values (
    v_booking_id, 'NEW', 'PENDING',
    v_customer_id, 'MIGRATION',
    'Reserva heredada incorporada al modelo v2',
    jsonb_build_object(
      'legacy_booking_id', p_legacy_booking_id,
      'legacy_status', v_legacy.status,
      'history_reconstructed', false
    ),
    coalesce(v_legacy.created_at, now())
  );

  if v_status <> 'PENDING' then
    insert into booking_v2.booking_status_events (
      booking_id, from_status, to_status,
      changed_by_user_id, source, reason, metadata, occurred_at
    ) values (
      v_booking_id, 'PENDING', v_status,
      null, 'MIGRATION',
      'Estado final importado sin inventar transiciones intermedias',
      jsonb_build_object(
        'legacy_booking_id', p_legacy_booking_id,
        'legacy_status', v_legacy.status,
        'history_reconstructed', false,
        'migration_jump', true
      ),
      coalesce(v_legacy.updated_at, v_legacy.created_at, now())
    );
  end if;

  insert into booking_v2.booking_fares (
    booking_id,
    estimated_distance_m, estimated_duration_s,
    estimated_fare, final_fare, driver_earnings,
    tariff_snapshot, calculated_at, finalized_at
  ) values (
    v_booking_id,
    case when v_legacy.distance is null then null else round(v_legacy.distance * 1000)::integer end,
    v_legacy.duration,
    coalesce(v_legacy.estimate, v_legacy.price, v_legacy.trip_cost, 0),
    case when v_status in ('COMPLETED','PAID') then coalesce(v_legacy.total_cost, v_legacy.trip_cost, v_legacy.price) end,
    case when v_status in ('COMPLETED','PAID') then v_legacy.driver_share end,
    jsonb_build_object(
      'source', 'legacy_migration',
      'legacy_estimate', v_legacy.estimate,
      'legacy_total_cost', v_legacy.total_cost
    ),
    coalesce(v_legacy.created_at, now()),
    case when v_status in ('COMPLETED','PAID') then coalesce(v_legacy.updated_at, now()) end
  );

  if v_driver_id is not null and v_car_id is not null then
    insert into booking_v2.booking_assignments (
      booking_id, driver_id, vehicle_id,
      assignment_status, assigned_at, accepted_at, closed_at,
      driver_name_snapshot, driver_contact_snapshot,
      vehicle_plate_snapshot, vehicle_make_snapshot,
      vehicle_model_snapshot, vehicle_color_snapshot,
      car_type_name_snapshot, close_reason
    )
    select
      v_booking_id, u.id, c.id,
      case when v_status = 'CANCELLED'
        then 'CANCELLED'::booking_v2.assignment_status
        else 'ACCEPTED'::booking_v2.assignment_status
      end,
      coalesce(v_legacy.created_at, now()),
      case when v_status <> 'CANCELLED' then coalesce(v_legacy.updated_at, v_legacy.created_at, now()) end,
      case when v_status = 'CANCELLED' then coalesce(v_legacy.updated_at, now()) end,
      btrim(concat_ws(' ', u.first_name, u.last_name)), u.mobile,
      c.plate, c.make, c.model, c.color,
      coalesce(ct.name, c.service_type),
      case when v_status = 'CANCELLED' then 'Importada como cancelada' end
    from public.users u
    join public.cars c on c.id = v_car_id
    left join public.car_types ct on ct.id = v_car_type_id
    where u.id = v_driver_id;
  end if;

  return v_booking_id;
exception
  when no_data_found then
    raise exception 'Reserva heredada no encontrada';
end;
$$;
