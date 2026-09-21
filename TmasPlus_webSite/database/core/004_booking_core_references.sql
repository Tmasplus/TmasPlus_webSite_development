-- Switch booking_v2 references to canonical core entities, preserving its public RPC signatures.
-- Category UUIDs are API identifiers mapped to the numeric core category ID.
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='45s';
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='current_app_user_id' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='036a4050d83c428bb16c2fe0a485fa74') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: current_app_user_id'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.current_app_user_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select u.id
  from booking_v2.core_users u
  where u.auth_id = auth.uid()
  limit 1
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='is_admin' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='4f389eefe5622b482aa17f82bb2a78ac') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: is_admin'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select exists (select 1 from booking_v2.core_users where auth_id = auth.uid()
    and user_type = 'admin' and approved is true and blocked is not true);
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='transition_booking_status' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='65fc746999831a7bc67714e3f3a9bcad') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: transition_booking_status'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.transition_booking_status(p_booking_id uuid, p_expected_status booking_v2.booking_status, p_new_status booking_v2.booking_status, p_changed_by_user_id uuid DEFAULT NULL::uuid, p_source booking_v2.event_source DEFAULT 'SYSTEM'::booking_v2.event_source, p_reason text DEFAULT NULL::text, p_metadata jsonb DEFAULT NULL::jsonb, p_location_lat numeric DEFAULT NULL::numeric, p_location_lng numeric DEFAULT NULL::numeric, p_accuracy_m numeric DEFAULT NULL::numeric, p_cancellation_category character varying DEFAULT NULL::character varying)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare
  v_current_status booking_v2.booking_status;
  v_requires_assignment boolean;
  v_assignment_id uuid;
  v_milestone booking_v2.milestone_type;
  v_actor_id uuid;
begin
  v_actor_id := coalesce(p_changed_by_user_id, booking_v2.current_app_user_id());

  if auth.uid() is not null then
    v_actor_id := booking_v2.current_app_user_id();
    if v_actor_id is null or not exists (select 1 from booking_v2.core_users where id=v_actor_id and blocked is not true) then
      raise exception 'Perfil habilitado requerido';
    end if;
    if p_changed_by_user_id is not null and p_changed_by_user_id <> v_actor_id then
      raise exception 'No puede suplantar al actor de la transición';
    end if;
    p_source := case when booking_v2.is_admin() then 'ADMIN'::booking_v2.event_source else 'APP'::booking_v2.event_source end;
    if not booking_v2.is_admin() and not exists (
      select 1 from booking_v2.booking_assignments a join booking_v2.core_users u on u.id=a.driver_id
      where a.booking_id=p_booking_id and a.driver_id=v_actor_id and a.closed_at is null
        and u.approved is true and u.blocked is not true
    ) and not (p_new_status='CANCELLED' and exists (
      select 1 from booking_v2.bookings where id=p_booking_id and customer_id=v_actor_id
    )) then
      raise exception 'La acción requiere el conductor asignado o un administrador';
    end if;
  end if;

  if auth.uid() is not null
     and not booking_v2.can_access_booking(p_booking_id) then
    raise exception 'No tiene acceso a esta reserva';
  end if;

  select status into strict v_current_status
  from booking_v2.bookings
  where id = p_booking_id
  for update;

  if v_current_status <> p_expected_status then
    raise exception 'Estado esperado %, estado actual %', p_expected_status, v_current_status;
  end if;

  select requires_active_assignment into strict v_requires_assignment
  from booking_v2.booking_status_transitions
  where from_status = v_current_status
    and to_status = p_new_status;

  select id into v_assignment_id
  from booking_v2.booking_assignments
  where booking_id = p_booking_id
    and closed_at is null
  for update;

  if v_requires_assignment and v_assignment_id is null then
    raise exception 'La transición requiere una asignación activa';
  end if;

  case p_new_status
    when 'ACCEPTED' then
      update booking_v2.booking_assignments
      set assignment_status = 'ACCEPTED', accepted_at = now()
      where id = v_assignment_id;

      update booking_v2.bookings
      set status = p_new_status, accepted_at = now()
      where id = p_booking_id;

    when 'ARRIVED_PICKUP' then
      update booking_v2.bookings
      set status = p_new_status, arrived_pickup_at = now()
      where id = p_booking_id;
      v_milestone := 'ARRIVAL_PICKUP';

    when 'STARTED' then
      update booking_v2.bookings
      set status = p_new_status, started_at = now()
      where id = p_booking_id;
      v_milestone := 'PASSENGER_PICKED_UP';

    when 'ARRIVED_DESTINATION' then
      update booking_v2.bookings
      set status = p_new_status, arrived_destination_at = now()
      where id = p_booking_id;
      v_milestone := 'ARRIVAL_DESTINATION';

    when 'COMPLETED' then
      update booking_v2.bookings
      set status = p_new_status, completed_at = now()
      where id = p_booking_id;
      v_milestone := 'PASSENGER_DROPPED_OFF';

    when 'PAID' then
      update booking_v2.bookings
      set status = p_new_status, paid_at = now()
      where id = p_booking_id;

    when 'CANCELLED' then
      update booking_v2.bookings
      set status = p_new_status,
          cancelled_at = now(),
          cancelled_by_user_id = v_actor_id,
          cancellation_category = p_cancellation_category,
          cancellation_reason = p_reason
      where id = p_booking_id;

      if v_assignment_id is not null then
        update booking_v2.booking_assignments
        set assignment_status = 'CANCELLED',
            closed_at = now(),
            close_reason = p_reason
        where id = v_assignment_id;
      end if;

      update booking_v2.booking_access_codes
      set invalidated_at = now(), invalidation_reason = 'BOOKING_CANCELLED'
      where booking_id = p_booking_id
        and verified_at is null
        and invalidated_at is null;

      v_milestone := case p_cancellation_category
        when 'CUSTOMER_NO_SHOW' then 'CUSTOMER_NO_SHOW'::booking_v2.milestone_type
        when 'DRIVER_CANCELLED' then 'DRIVER_CANCELLED'::booking_v2.milestone_type
        when 'CUSTOMER_CANCELLED' then 'CUSTOMER_CANCELLED'::booking_v2.milestone_type
        else null
      end;

    else
      update booking_v2.bookings
      set status = p_new_status
      where id = p_booking_id;
  end case;

  insert into booking_v2.booking_status_events (
    booking_id, from_status, to_status,
    changed_by_user_id, source, reason, metadata
  ) values (
    p_booking_id, v_current_status, p_new_status,
    v_actor_id, coalesce(p_source, 'SYSTEM'), p_reason, p_metadata
  );

  if v_milestone is not null then
    insert into booking_v2.booking_milestones (
      booking_id, assignment_id, milestone_type,
      location_lat, location_lng, accuracy_m,
      recorded_by_user_id, source, metadata
    ) values (
      p_booking_id, v_assignment_id, v_milestone,
      p_location_lat, p_location_lng, p_accuracy_m,
      v_actor_id, coalesce(p_source, 'SYSTEM'), p_metadata
    )
    on conflict (booking_id, milestone_type) do update
    set occurred_at = excluded.occurred_at,
        location_lat = excluded.location_lat,
        location_lng = excluded.location_lng,
        accuracy_m = excluded.accuracy_m,
        metadata = excluded.metadata;
  end if;
exception
  when no_data_found then
    raise exception 'Reserva inexistente o transición no permitida';
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='can_access_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='fab2af8eb9be7401ff978203837edda3') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: can_access_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.can_access_booking(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
  select exists (
    select 1 from booking_v2.core_users u join booking_v2.bookings b on b.id=p_booking_id
    where u.auth_id=auth.uid() and u.blocked is not true and (
      (u.user_type='admin' and u.approved is true) or b.customer_id=u.id or exists (
        select 1 from booking_v2.booking_assignments a where a.booking_id=b.id and a.driver_id=u.id
      ) or (u.user_type='driver' and u.approved is true and b.status='PENDING'
        and (b.request_expires_at is null or b.request_expires_at>now())
        and not exists(select 1 from booking_v2.booking_assignments a where a.booking_id=b.id and a.closed_at is null)
        and exists(select 1 from booking_v2.core_memberships m where m.conductor=coalesce(u.auth_id,u.id)
          and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
      )
    )
  );
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='assign_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='3d5fe7077dda36ffeb5df154a170baf9') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: assign_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.assign_booking(p_booking_id uuid, p_driver_id uuid, p_vehicle_id uuid, p_assigned_by_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare
  v_booking booking_v2.bookings%rowtype;
  v_driver booking_v2.core_users%rowtype;
  v_car booking_v2.core_cars%rowtype;
  v_assignment_id uuid := gen_random_uuid();
  v_category_name text;
  v_actor_id uuid;
begin
  v_actor_id := coalesce(p_assigned_by_user_id, booking_v2.current_app_user_id());

  if auth.uid() is not null
     and booking_v2.current_app_user_id() is distinct from p_driver_id
     and not booking_v2.is_admin() then
    raise exception 'Solo el conductor o un administrador puede asignar esta reserva';
  end if;

  select * into strict v_booking
  from booking_v2.bookings
  where id = p_booking_id
  for update;

  if v_booking.status <> 'PENDING' then
    raise exception 'Solo se puede asignar una reserva PENDING';
  end if;

  select * into strict v_driver
  from booking_v2.core_users
  where id = p_driver_id
    and user_type = 'driver'
    and coalesce(approved, false) = true
    and coalesce(blocked, false) = false;

  select * into strict v_car
  from booking_v2.core_cars
  where id = p_vehicle_id
    and driver_id = p_driver_id
    and coalesce(is_active, false) = true;

  select ct.name into v_category_name
  from booking_v2.core_car_types ct
  where ct.id = v_booking.requested_car_type_id;

  insert into booking_v2.booking_assignments (
    id, booking_id, driver_id, vehicle_id,
    assignment_status, assigned_at, assigned_by_user_id,
    driver_name_snapshot, driver_contact_snapshot,
    vehicle_plate_snapshot, vehicle_make_snapshot,
    vehicle_model_snapshot, vehicle_color_snapshot,
    car_type_name_snapshot
  ) values (
    v_assignment_id, p_booking_id, p_driver_id, p_vehicle_id,
    'ASSIGNED', now(), v_actor_id,
    btrim(concat_ws(' ', v_driver.first_name, v_driver.last_name)),
    v_driver.mobile,
    v_car.plate, v_car.make, v_car.model, v_car.color,
    coalesce(v_category_name, v_car.service_type)
  );

  return v_assignment_id;
exception
  when no_data_found then
    raise exception 'Reserva, conductor o vehículo no encontrado/habilitado';
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='validate_new_assignment' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='41dbf5a0bacc75044cb891e5b6b8ce20') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: validate_new_assignment'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.validate_new_assignment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
begin
  if not exists (
    select 1
    from booking_v2.core_users u
    join booking_v2.core_memberships m on m.conductor = coalesce(u.auth_id, u.id)
    where u.id = new.driver_id
      and upper(m.status) = 'ACTIVA'
      and m.fecha_inicio <= current_date
      and m.fecha_terminada >= current_date
  ) then
    raise exception 'El conductor no tiene una membresía activa y vigente';
  end if;
  return new;
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='validate_new_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='12e07cc53e92b8566fb16ffa973bb5b0') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: validate_new_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.validate_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
begin
  if not exists (
    select 1 from booking_v2.core_car_types
    where id = new.requested_car_type_id and is_active = true
  ) then
    raise exception 'La categoría solicitada no existe o está deshabilitada';
  end if;
  return new;
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='migrate_legacy_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='70eb868d42bfacd4a4c7a3f15ad0b7e0') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: migrate_legacy_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.migrate_legacy_booking(p_legacy_booking_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
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
    from booking_v2.core_car_types ct
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
    from booking_v2.core_cars c
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
    from booking_v2.core_users u
    join booking_v2.core_cars c on c.id = v_car_id
    left join booking_v2.core_car_types ct on ct.id = v_car_type_id
    where u.id = v_driver_id;
  end if;

  return v_booking_id;
exception
  when no_data_found then
    raise exception 'Reserva heredada no encontrada';
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='verify_pickup_code' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='166076a8ffc20e232f298588893da418') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: verify_pickup_code'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.verify_pickup_code(p_booking_id uuid, p_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2', 'extensions'
AS $function$
declare
  b booking_v2.bookings%rowtype;
  c booking_v2.booking_access_codes%rowtype;
  actor uuid := booking_v2.current_app_user_id();
begin
  if actor is null or not exists (select 1 from booking_v2.core_users where id=actor
     and blocked is not true and approved is true) then raise exception 'Sesión habilitada requerida'; end if;
  select * into strict b from booking_v2.bookings where id=p_booking_id for update;
  if not booking_v2.is_admin() and not exists (select 1 from booking_v2.booking_assignments
      where booking_id=b.id and driver_id=actor and closed_at is null) then
    raise exception 'Solo el conductor asignado puede verificar el código';
  end if;
  if b.status <> 'ARRIVED_PICKUP' then raise exception 'Debe confirmar la llegada primero'; end if;
  select * into c from booking_v2.booking_access_codes
    where booking_id=b.id and invalidated_at is null order by generated_at desc limit 1 for update;
  if not found then return false; end if;
  if c.verified_at is not null then return true; end if;
  if c.expires_at <= clock_timestamp() or c.failed_attempts >= c.max_attempts then return false; end if;
  if p_code is not null and p_code ~ '^[0-9]{4}$'
     and extensions.crypt(p_code,c.code_hash)=c.code_hash then
    update booking_v2.booking_access_codes set verified_at=clock_timestamp() where id=c.id;
    return true;
  end if;
  -- Return false instead of raising: the failed attempt must be committed.
  update booking_v2.booking_access_codes set failed_attempts=failed_attempts+1,
    invalidated_at=case when failed_attempts+1 >= max_attempts then clock_timestamp() else null end,
    invalidation_reason=case when failed_attempts+1 >= max_attempts then 'MAX_ATTEMPTS' else null end
    where id=c.id;
  return false;
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='refresh_mobile_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='924373cb981a2e11828423d0495e6b73') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: refresh_mobile_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.refresh_mobile_booking(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare
  b booking_v2.bookings%rowtype;
  a booking_v2.booking_assignments%rowtype;
  f booking_v2.booking_fares%rowtype;
  u booking_v2.core_users%rowtype;
  row_data jsonb;
  output_row booking_v2.mobile_bookings%rowtype;
  category_name text;
  columns_sql text;
begin
  select * into b from booking_v2.bookings where id=p_id;
  if not found then return; end if;
  select * into a from booking_v2.booking_assignments where booking_id=p_id
    order by (closed_at is null) desc, assigned_at desc limit 1;
  select * into f from booking_v2.booking_fares where booking_id=p_id;
  select * into u from booking_v2.core_users where id=b.customer_id;
  select name into category_name from booking_v2.core_car_types where id=b.requested_car_type_id;
  select coalesce(payload,'{}'::jsonb) into row_data from booking_v2.mobile_details where booking_id=p_id;
  row_data := coalesce(row_data,'{}'::jsonb) || jsonb_build_object(
    'id',b.id,'customer_id',b.customer_id,'customer',b.customer_id,
    'customer_name',concat_ws(' ',u.first_name,u.last_name),'customer_email',u.email,'customer_contact',u.mobile,
    'driver_id',a.driver_id,'driver',a.driver_id,'driver_name',a.driver_name_snapshot,
    'driver_contact',a.driver_contact_snapshot,'car_id',a.vehicle_id,'car_type_id',b.requested_car_type_id,
    'car_type',category_name,'plate_number',a.vehicle_plate_snapshot,'vehicle_number',a.vehicle_plate_snapshot,
    'vehicle_make',a.vehicle_make_snapshot,'vehicle_model',a.vehicle_model_snapshot,'vehicle_color',a.vehicle_color_snapshot,
    'car_model',a.vehicle_model_snapshot,'status',case b.status
       when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
       when 'COMPLETED' then 'COMPLETE' when 'PENDING' then case when b.booking_type='IMMEDIATE' then 'NEW' else 'PENDING' end
       else b.status::text end,
    'booking_type',case b.booking_type when 'SCHEDULED' then 'reservation' else 'immediate' end,
    'booking_date',coalesce(b.scheduled_at,b.created_at),'request_expires_at',b.request_expires_at,
    'reference',b.reference,'created_at',b.created_at,'updated_at',b.updated_at
  ) || jsonb_build_object(
    'pickup_address',b.pickup_address,'pickup_lat',b.pickup_lat,'pickup_lng',b.pickup_lng,
    'drop_address',b.dropoff_address,'drop_lat',b.dropoff_lat,'drop_lng',b.dropoff_lng,
    'pickup_location',jsonb_build_object('address',b.pickup_address,'lat',b.pickup_lat,'lng',b.pickup_lng),
    'destination_location',jsonb_build_object('address',b.dropoff_address,'lat',b.dropoff_lat,'lng',b.dropoff_lng),
    'price',coalesce(f.final_fare,f.estimated_fare,0),'estimate',f.estimated_fare,
    'total_cost',coalesce(f.final_fare,f.estimated_fare,0),'trip_cost',coalesce(f.final_fare,f.estimated_fare,0),
    'distance',coalesce(f.actual_distance_m,f.estimated_distance_m)/1000.0,
    'duration',coalesce(f.actual_duration_s,f.estimated_duration_s)/60,
    'driver_share',f.driver_earnings,'convenience_fees',f.convenience_fee,'discount',f.discount_amount,
    'payment_mode',b.payment_mode,'observations',b.observations,
    'trip_start_time',b.started_at,'trip_end_time',b.completed_at,'driver_arrived_time',b.arrived_pickup_at,
    'otp',null,'otp_verified',exists(select 1 from booking_v2.booking_access_codes c
        where c.booking_id=b.id and c.verified_at is not null and c.invalidated_at is null),
    'otp_timer_started_at',b.arrived_pickup_at,'otp_timer_duration',180,
    'reason',b.cancellation_reason,'waypoints',coalesce(b.waypoints,'[]'::jsonb)
  );
  output_row := jsonb_populate_record(null::booking_v2.mobile_bookings,row_data);
  -- An upsert of the full projection avoids deleting/reinserting on every event.
  if exists(select 1 from booking_v2.mobile_bookings where id=p_id) then
    select string_agg(quote_ident(attname),',' order by attnum) into columns_sql
      from pg_attribute where attrelid='booking_v2.mobile_bookings'::regclass and attnum>0 and not attisdropped;
    execute format('update booking_v2.mobile_bookings set (%s)=(select %s from jsonb_populate_record(null::booking_v2.mobile_bookings,$1)) where id=$2',
      columns_sql,columns_sql) using row_data,p_id;
  else
    insert into booking_v2.mobile_bookings select output_row.*;
  end if;
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='visible_pickup_code' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='67b987ff426715df0e0fb23855db0689') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: visible_pickup_code'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.visible_pickup_code(p_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2', 'extensions'
AS $function$
  select extensions.pgp_sym_decrypt(d.ciphertext,k.secret)
  from booking_v2.code_delivery d cross join booking_v2.code_delivery_key k
  join booking_v2.bookings b on b.id=p_id
  where d.booking_id=b.id and (b.customer_id=booking_v2.current_app_user_id() or booking_v2.is_admin())
    and exists(select 1 from booking_v2.core_users u where u.auth_id=auth.uid() and u.blocked is not true)
    and exists(select 1 from booking_v2.booking_access_codes c where c.booking_id=b.id
      and c.invalidated_at is null and c.expires_at>now());
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='category_matches' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='dfcf99ab9b06c06bf88eec50e7085884') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: category_matches'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.category_matches(p_category_id uuid, p_value text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
  select exists(select 1 from booking_v2.core_car_types ct where ct.id=p_category_id and ct.is_active is true
    and regexp_replace(lower(coalesce(p_value,'')),'[^a-z0-9]','','g') in (
      regexp_replace(lower(ct.name),'[^a-z0-9]','','g'),
      regexp_replace(ct.id::text,'[^a-z0-9]','','g'),
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'particular'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'servicioespecial'
        when '102d2c48-ee88-4652-ae6c-8f2fe3ae2d20' then 'taxiplus'
        when 'a111364a-95d0-4ac8-8305-35c7536dd064' then 'vanplus' end,
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'tplusparticular'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'tplusespecial'
        when '102d2c48-ee88-4652-ae6c-8f2fe3ae2d20' then 'tplustaxi'
        when 'a111364a-95d0-4ac8-8305-35c7536dd064' then 'tplusvan' end,
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'xplus'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'comfortplus' end
    ));
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='deliver_pickup_code' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='9c2c31136ab823d9e969eeb8a5223267') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: deliver_pickup_code'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.deliver_pickup_code(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2', 'extensions'
AS $function$
declare
  actor uuid := booking_v2.current_app_user_id();
  b booking_v2.bookings%rowtype;
  answer jsonb;
  ciphertext bytea;
begin
  select * into strict b from booking_v2.bookings where id=p_booking_id for update;
  if actor is null or not exists(select 1 from booking_v2.core_users where id=actor and blocked is not true)
     or (actor<>b.customer_id and not booking_v2.is_admin()) then
    raise exception 'Solo el cliente o un administrador puede obtener el código';
  end if;
  select d.ciphertext into ciphertext from booking_v2.code_delivery d where booking_id=b.id;
  if ciphertext is not null and exists(select 1 from booking_v2.booking_access_codes
      where booking_id=b.id and invalidated_at is null and expires_at>clock_timestamp()) then
    return jsonb_build_object('code',extensions.pgp_sym_decrypt(ciphertext,(select secret from booking_v2.code_delivery_key)),
      'verified',exists(select 1 from booking_v2.booking_access_codes where booking_id=b.id and verified_at is not null and invalidated_at is null));
  end if;
  answer := booking_v2.issue_pickup_code(b.id);
  insert into booking_v2.code_delivery values(b.id,extensions.pgp_sym_encrypt(answer->>'code',(select secret from booking_v2.code_delivery_key)))
    on conflict(booking_id) do update set ciphertext=excluded.ciphertext;
  return answer || '{"verified":false}'::jsonb;
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='issue_pickup_code' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='e522dd77ba3f5ed65be69696980aabf0') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: issue_pickup_code'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.issue_pickup_code(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2', 'extensions'
AS $function$
declare
  b booking_v2.bookings%rowtype;
  actor uuid := booking_v2.current_app_user_id();
  code text;
  expiration timestamptz := clock_timestamp() + interval '24 hours';
begin
  if actor is null or not exists (select 1 from booking_v2.core_users where id=actor and blocked is not true) then
    raise exception 'Sesión requerida';
  end if;
  select * into strict b from booking_v2.bookings where id=p_booking_id for update;
  if not booking_v2.is_admin() and b.customer_id <> actor then
    raise exception 'Solo el cliente o un administrador puede obtener el código';
  end if;
  if b.status not in ('PENDING','ACCEPTED','ARRIVED_PICKUP') then
    raise exception 'La reserva no permite emitir un código de recogida';
  end if;
  if exists (select 1 from booking_v2.booking_access_codes where booking_id=b.id
       and (verified_at is not null or generated_at > clock_timestamp() - interval '30 seconds')) then
    raise exception 'Código ya verificado o emitido recientemente';
  end if;
  expiration := greatest(expiration, coalesce(b.scheduled_at, now()) + interval '24 hours');
  code := lpad(((('x' || encode(extensions.gen_random_bytes(4),'hex'))::bit(32)::bigint) % 10000)::text,4,'0');
  update booking_v2.booking_access_codes set invalidated_at=clock_timestamp(), invalidation_reason='REPLACED'
    where booking_id=b.id and invalidated_at is null and verified_at is null;
  insert into booking_v2.booking_access_codes(booking_id,code_hash,expires_at)
    values(b.id,extensions.crypt(code,extensions.gen_salt('bf')),expiration);
  return jsonb_build_object('code',code,'expires_at',expiration);
end;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='list_assignable_drivers' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='00e39b3d575cf007275f32d999aa5c8e') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: list_assignable_drivers'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.list_assignable_drivers(p_query text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
begin
  if not booking_v2.is_admin() then raise exception 'Administrador aprobado requerido'; end if;
  return coalesce((select jsonb_agg(result order by result->>'first_name') from (
    select jsonb_build_object('id',u.id,'auth_id',u.auth_id,'first_name',u.first_name,
      'last_name',u.last_name,'email',u.email,'mobile',u.mobile,'approved',u.approved,
      'blocked',u.blocked,'driver_active_status',u.driver_active_status,'vehicle',
      jsonb_build_object('id',c.id,'make',c.make,'model',c.model,'plate',c.plate,'service_type',c.service_type)) result
    from booking_v2.core_users u
    join lateral (select * from booking_v2.core_cars where driver_id=u.id and is_active is true
      order by updated_at desc nulls last,id limit 1) c on true
    where u.user_type='driver' and u.approved is true and u.blocked is not true
      and exists(select 1 from booking_v2.core_memberships m where m.conductor=coalesce(u.auth_id,u.id)
        and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
      and (coalesce(trim(p_query),'')='' or concat_ws(' ',u.first_name,u.last_name,u.email,u.mobile,c.plate)
        ilike '%' || trim(p_query) || '%')
  ) eligible),'[]'::jsonb);
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='queue_booking_notification' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='6bc1c5e77d6b4751dfa77cd11b9db03e') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: queue_booking_notification'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.queue_booking_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare b booking_v2.bookings%rowtype; legacy_status text; notice_type text;
begin
  select * into strict b from booking_v2.bookings where id=new.booking_id;
  if tg_table_name='booking_status_events' then
    legacy_status := case new.to_status when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
      when 'COMPLETED' then 'COMPLETE' else new.to_status::text end;
    insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
    select new.id,b.id,recipient,jsonb_build_object('type','booking-update','bookingId',b.id,'newStatus',legacy_status)
    from (select b.customer_id recipient union select driver_id from booking_v2.booking_assignments
      where booking_id=b.id and closed_at is null) recipients
    on conflict(event_id,recipient_id) do nothing;
    if new.to_status='PENDING' then
      notice_type := case when b.booking_type='SCHEDULED' then 'booking-scheduled' else 'new-service-loop' end;
      insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
      select new.id,b.id,u.id,jsonb_build_object('type',notice_type,'bookingId',b.id,'role','driver')
      from booking_v2.core_users u where u.user_type='driver' and u.approved is true and u.blocked is not true
        and u.driver_active_status is true
        and exists(select 1 from booking_v2.core_memberships m where m.conductor=coalesce(u.auth_id,u.id)
          and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
        and exists(select 1 from booking_v2.core_cars c join booking_v2.core_car_types ct on ct.id=b.requested_car_type_id
          where c.driver_id=u.id and c.is_active is true and booking_v2.category_matches(ct.id,c.service_type))
      on conflict(event_id,recipient_id) do nothing;
    end if;
  else
    notice_type := case when b.booking_type='SCHEDULED' then 'booking-scheduled' else 'new-service-loop' end;
    insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
    values(new.id,b.id,new.driver_id,jsonb_build_object('type',notice_type,'bookingId',b.id,'role','driver'))
    on conflict(event_id,recipient_id) do nothing;
  end if;
  return new;
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='create_booking' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='324ac59b2aeac2083256eebb31b0e3a6') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: create_booking'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.create_booking(p_idempotency_key character varying, p_customer_id uuid, p_requested_car_type_id uuid, p_booking_type booking_v2.booking_type, p_scheduled_at timestamp with time zone, p_request_expires_at timestamp with time zone, p_pickup_address text, p_pickup_lat numeric, p_pickup_lng numeric, p_dropoff_address text, p_dropoff_lat numeric, p_dropoff_lng numeric, p_waypoints jsonb, p_observations text, p_payment_mode character varying, p_estimated_distance_m integer, p_estimated_duration_s integer, p_estimated_fare numeric, p_tariff_snapshot jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
begin
  if auth.uid() is not null and not exists(select 1 from booking_v2.core_users
    where id=booking_v2.current_app_user_id() and blocked is not true) then
    raise exception 'Perfil habilitado requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  if exists(select 1 from booking_v2.bookings where idempotency_key=p_idempotency_key and customer_id is distinct from p_customer_id) then
    raise exception 'La clave de idempotencia pertenece a otra solicitud'; end if;
  return booking_v2.create_booking_internal(p_idempotency_key,p_customer_id,p_requested_car_type_id,p_booking_type,
    p_scheduled_at,p_request_expires_at,p_pickup_address,p_pickup_lat,p_pickup_lng,p_dropoff_address,p_dropoff_lat,p_dropoff_lng,
    p_waypoints,p_observations,p_payment_mode,p_estimated_distance_m,p_estimated_duration_s,p_estimated_fare,p_tariff_snapshot);
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='guard_assignment_identity' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='0ec78e770f85659a6f8caf0d8cb57d75') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: guard_assignment_identity'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.guard_assignment_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare actor uuid:=booking_v2.current_app_user_id();
begin
  if auth.uid() is not null then
    if actor is null or not exists(select 1 from booking_v2.core_users where id=actor and blocked is not true)
      or (not booking_v2.is_admin() and actor<>new.driver_id) then raise exception 'Asignación no autorizada'; end if;
    if new.assigned_by_user_id is distinct from actor then raise exception 'Autor de asignación inválido'; end if;
    if not exists(select 1 from booking_v2.bookings b join booking_v2.core_car_types ct on ct.id=b.requested_car_type_id
      join booking_v2.core_cars c on c.id=new.vehicle_id where b.id=new.booking_id
      and (b.request_expires_at is null or b.request_expires_at>now())
      and booking_v2.category_matches(ct.id,c.service_type)) then
      raise exception 'Reserva vencida o vehículo de categoría incompatible'; end if;
  end if;
  return new;
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='record_vehicle_position' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='31020cb602431903bda51f8809acd5a2') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: record_vehicle_position'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.record_vehicle_position(p_lat double precision, p_lng double precision, p_accuracy double precision DEFAULT NULL::double precision, p_recorded_at timestamp with time zone DEFAULT now(), p_booking_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare actor uuid:=booking_v2.current_app_user_id(); vehicle uuid; trip uuid;
begin
  if not exists(select 1 from booking_v2.core_users where id=actor and user_type='driver' and approved is true and blocked is not true) then
    raise exception 'Conductor habilitado requerido'; end if;
  if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180)
    or p_recorded_at is null or p_recorded_at>now()+interval '30 seconds' or p_recorded_at<now()-interval '10 minutes'
    or (p_accuracy is not null and not(p_accuracy between 0 and 10000)) then raise exception 'Posición inválida o vencida'; end if;
  select a.vehicle_id,b.id into vehicle,trip from booking_v2.booking_assignments a join booking_v2.bookings b on b.id=a.booking_id
    where a.driver_id=actor and a.closed_at is null and b.status in ('ACCEPTED','ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION')
      and (p_booking_id is null or b.id=p_booking_id) order by a.assigned_at desc limit 1;
  if p_booking_id is not null and trip is null then raise exception 'Viaje no activo o no asignado'; end if;
  if trip is null then
    if not exists(select 1 from booking_v2.core_users where id=actor and driver_active_status is true) then raise exception 'Conductor desconectado'; end if;
    select id into vehicle from booking_v2.core_cars where driver_id=actor and is_active is true order by updated_at desc nulls last,id limit 1;
    if vehicle is null then raise exception 'Vehículo activo requerido'; end if;
  else
    insert into booking_v2.booking_tracking(booking_id,driver_id,lat,lng,accuracy,created_at)
      values(trip,actor,p_lat,p_lng,p_accuracy,p_recorded_at);
  end if;
  insert into booking_v2.vehicle_positions values(actor,vehicle,trip,p_lat,p_lng,p_accuracy,p_recorded_at)
  on conflict(driver_id) do update set vehicle_id=excluded.vehicle_id,booking_id=excluded.booking_id,
    lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at
    where excluded.recorded_at>vehicle_positions.recorded_at;
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='list_vehicle_locations' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='75e160b7662d1b3541ebfdaa153eaec3') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: list_vehicle_locations'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.list_vehicle_locations(p_plate text DEFAULT ''::text)
 RETURNS TABLE(driver_id uuid, vehicle_id uuid, booking_id uuid, plate_number text, driver_name text, car_model text, car_color text, booking_status text, driver_lat double precision, driver_lng double precision, recorded_at timestamp with time zone, is_stale boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
 select p.driver_id,p.vehicle_id,b.id,c.plate::text,concat_ws(' ',u.first_name,u.last_name),concat_ws(' ',c.make,c.model),c.color::text,
   case b.status when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
     else coalesce(b.status::text,'AVAILABLE') end,p.lat,p.lng,p.recorded_at,p.recorded_at<now()-interval '60 seconds'
 from booking_v2.vehicle_positions p join booking_v2.core_users u on u.id=p.driver_id join booking_v2.core_cars c on c.id=p.vehicle_id
 left join booking_v2.bookings b on b.id=p.booking_id and b.status in ('ACCEPTED','ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION')
 where exists(select 1 from booking_v2.core_users viewer where viewer.id=booking_v2.current_app_user_id() and viewer.blocked is not true)
   and (booking_v2.is_admin() or p.driver_id=booking_v2.current_app_user_id() or b.customer_id=booking_v2.current_app_user_id())
   and u.blocked is not true and u.approved is true and c.is_active is true
   and (u.driver_active_status is true or b.id is not null)
   and (coalesce(trim(p_plate),'')='' or regexp_replace(upper(c.plate),'[^A-Z0-9]','','g') like
     '%'||regexp_replace(upper(p_plate),'[^A-Z0-9]','','g')||'%')
 order by p.recorded_at desc;
$function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='register_push_device' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='feb6e63ad67613f0fc11087265874168') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: register_push_device'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.register_push_device(p_token text, p_platform text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare actor uuid:=booking_v2.current_app_user_id();
begin
  if not exists(select 1 from booking_v2.core_users where id=actor and blocked is not true) then raise exception 'Sesión habilitada requerida'; end if;
  if p_token is null or length(p_token)>250 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or p_platform is null or p_platform not in ('ANDROID','IOS') then raise exception 'Dispositivo inválido'; end if;
  insert into booking_v2.push_devices(user_id,token,platform) values(actor,p_token,p_platform)
  on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now(),enabled=true;
end $function$;
DO $pin$ BEGIN IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='create_push_campaign' AND n.nspname='booking_v2' AND p.prokind='f' AND md5(pg_get_functiondef(p.oid))='1a9a2e130d1c7efb17febdf32b412c84') <> 1 THEN RAISE EXCEPTION 'Unexpected live definition: create_push_campaign'; END IF; END $pin$;
CREATE OR REPLACE FUNCTION booking_v2.create_push_campaign(p_id uuid, p_title text, p_body text, p_audience text, p_platform text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'booking_v2'
AS $function$
declare previous booking_v2.push_campaigns%rowtype; n integer;
begin
  if not booking_v2.is_admin() then raise exception 'Administrador aprobado requerido'; end if;
  if p_id is null then raise exception 'ID requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into previous from booking_v2.push_campaigns where id=p_id;
  if found then
    if previous.created_by<>booking_v2.current_app_user_id() or previous.title is distinct from trim(p_title)
      or previous.body is distinct from trim(p_body) or previous.audience is distinct from p_audience or previous.platform is distinct from p_platform then
      raise exception 'ID reutilizado con otro contenido'; end if;
    return p_id;
  end if;
  insert into booking_v2.push_campaigns(id,created_by,title,body,audience,platform)
    values(p_id,booking_v2.current_app_user_id(),trim(p_title),trim(p_body),p_audience,p_platform);
  insert into booking_v2.push_deliveries(campaign_id,device_id,recipient_id)
    select p_id,d.id,u.id from booking_v2.push_devices d join booking_v2.core_users u on u.id=d.user_id
    where d.enabled and d.updated_at>now()-interval '90 days' and u.blocked is not true and u.user_type=p_audience
      and (p_platform='ALL' or d.platform=p_platform);
  get diagnostics n=row_count;
  update booking_v2.push_campaigns set recipients=n where id=p_id;
  return p_id;
end $function$;
ALTER TABLE booking_v2."booking_milestones" DROP CONSTRAINT "fk_v2_milestone_user";
ALTER TABLE booking_v2."booking_milestones" ADD CONSTRAINT "fk_v2_milestone_user" FOREIGN KEY (recorded_by_user_id) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE booking_v2."bookings" DROP CONSTRAINT "fk_v2_bookings_customer";
ALTER TABLE booking_v2."bookings" ADD CONSTRAINT "fk_v2_bookings_customer" FOREIGN KEY (customer_id) REFERENCES public.persona(id) ON DELETE RESTRICT;
ALTER TABLE booking_v2."bookings" DROP CONSTRAINT "fk_v2_bookings_car_type";
ALTER TABLE booking_v2."bookings" ADD CONSTRAINT "fk_v2_bookings_car_type" FOREIGN KEY (requested_car_type_id) REFERENCES booking_v2.core_category_ids(booking_category_id) ON DELETE RESTRICT;
ALTER TABLE booking_v2."bookings" DROP CONSTRAINT "fk_v2_bookings_cancelled_by";
ALTER TABLE booking_v2."bookings" ADD CONSTRAINT "fk_v2_bookings_cancelled_by" FOREIGN KEY (cancelled_by_user_id) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE booking_v2."booking_assignments" DROP CONSTRAINT "fk_v2_assignment_driver";
ALTER TABLE booking_v2."booking_assignments" ADD CONSTRAINT "fk_v2_assignment_driver" FOREIGN KEY (driver_id) REFERENCES public.persona(id) ON DELETE RESTRICT;
ALTER TABLE booking_v2."booking_assignments" DROP CONSTRAINT "fk_v2_assignment_vehicle";
ALTER TABLE booking_v2."booking_assignments" ADD CONSTRAINT "fk_v2_assignment_vehicle" FOREIGN KEY (vehicle_id) REFERENCES public.vehiculo(id) ON DELETE RESTRICT;
ALTER TABLE booking_v2."booking_assignments" DROP CONSTRAINT "fk_v2_assignment_assigned_by";
ALTER TABLE booking_v2."booking_assignments" ADD CONSTRAINT "fk_v2_assignment_assigned_by" FOREIGN KEY (assigned_by_user_id) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE booking_v2."booking_status_events" DROP CONSTRAINT "fk_v2_status_event_user";
ALTER TABLE booking_v2."booking_status_events" ADD CONSTRAINT "fk_v2_status_event_user" FOREIGN KEY (changed_by_user_id) REFERENCES public.persona(id) ON DELETE SET NULL;
ALTER TABLE booking_v2."vehicle_positions" DROP CONSTRAINT "vehicle_positions_driver_id_fkey";
ALTER TABLE booking_v2."vehicle_positions" ADD CONSTRAINT "vehicle_positions_driver_id_fkey" FOREIGN KEY (driver_id) REFERENCES public.persona(id);
ALTER TABLE booking_v2."vehicle_positions" DROP CONSTRAINT "vehicle_positions_vehicle_id_fkey";
ALTER TABLE booking_v2."vehicle_positions" ADD CONSTRAINT "vehicle_positions_vehicle_id_fkey" FOREIGN KEY (vehicle_id) REFERENCES public.vehiculo(id);
ALTER TABLE booking_v2."push_devices" DROP CONSTRAINT "push_devices_user_id_fkey";
ALTER TABLE booking_v2."push_devices" ADD CONSTRAINT "push_devices_user_id_fkey" FOREIGN KEY (user_id) REFERENCES public.persona(id);
ALTER TABLE booking_v2."push_campaigns" DROP CONSTRAINT "push_campaigns_created_by_fkey";
ALTER TABLE booking_v2."push_campaigns" ADD CONSTRAINT "push_campaigns_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.persona(id);
ALTER TABLE booking_v2."push_deliveries" DROP CONSTRAINT "push_deliveries_recipient_id_fkey";
ALTER TABLE booking_v2."push_deliveries" ADD CONSTRAINT "push_deliveries_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.persona(id);
ALTER TABLE booking_v2."notification_outbox" DROP CONSTRAINT "notification_outbox_recipient_id_fkey";
ALTER TABLE booking_v2."notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_id_fkey" FOREIGN KEY (recipient_id) REFERENCES public.persona(id);
-- Rebuild denormalized mobile projections after the canonical entity switch.
DO $refresh$ DECLARE b record; BEGIN FOR b IN SELECT id FROM booking_v2.bookings LOOP PERFORM booking_v2.refresh_mobile_booking(b.id); END LOOP; END $refresh$;

