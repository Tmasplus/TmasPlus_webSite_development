-- ============================================================================
-- TmasPlus booking_v2 - PostgreSQL/Supabase test model
--
-- Coexists with the legacy model in public. No legacy rows are migrated by
-- this migration; public bookings can be copied explicitly through the RPC
-- booking_v2.migrate_legacy_booking(uuid).
-- ============================================================================

create schema if not exists booking_v2;

create type booking_v2.booking_status as enum (
  'NEW',
  'PENDING',
  'ACCEPTED',
  'ARRIVED_PICKUP',
  'STARTED',
  'ARRIVED_DESTINATION',
  'COMPLETED',
  'PAID',
  'CANCELLED'
);

create type booking_v2.booking_type as enum ('IMMEDIATE', 'SCHEDULED');

create type booking_v2.assignment_status as enum (
  'OFFERED',
  'ASSIGNED',
  'ACCEPTED',
  'REJECTED',
  'RELEASED',
  'CANCELLED'
);

create type booking_v2.event_source as enum (
  'WEB',
  'APP',
  'ADMIN',
  'SYSTEM',
  'MIGRATION'
);

create type booking_v2.milestone_type as enum (
  'ARRIVAL_PICKUP',
  'PASSENGER_PICKED_UP',
  'ARRIVAL_DESTINATION',
  'PASSENGER_DROPPED_OFF',
  'CUSTOMER_NO_SHOW',
  'DRIVER_CANCELLED',
  'CUSTOMER_CANCELLED'
);

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

create table booking_v2.bookings (
  id uuid primary key default gen_random_uuid(),
  reference varchar(40) not null,
  idempotency_key varchar(120) not null,

  customer_id uuid not null,
  requested_car_type_id uuid,

  status booking_v2.booking_status not null default 'PENDING',
  booking_type booking_v2.booking_type not null default 'IMMEDIATE',
  scheduled_at timestamptz,
  request_expires_at timestamptz,

  pickup_address text not null,
  pickup_lat numeric(10,7),
  pickup_lng numeric(10,7),
  dropoff_address text not null,
  dropoff_lat numeric(10,7),
  dropoff_lng numeric(10,7),
  waypoints jsonb,

  observations text,
  payment_mode varchar(30),

  accepted_at timestamptz,
  arrived_pickup_at timestamptz,
  started_at timestamptz,
  arrived_destination_at timestamptz,
  completed_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,

  cancelled_by_user_id uuid,
  cancellation_category varchar(50),
  cancellation_reason text,

  legacy_booking_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_v2_bookings_reference unique (reference),
  constraint uq_v2_bookings_idempotency unique (idempotency_key),
  constraint uq_v2_bookings_legacy unique (legacy_booking_id),
  constraint fk_v2_bookings_customer
    foreign key (customer_id) references public.users(id) on delete restrict,
  constraint fk_v2_bookings_car_type
    foreign key (requested_car_type_id) references public.car_types(id) on delete restrict,
  constraint fk_v2_bookings_cancelled_by
    foreign key (cancelled_by_user_id) references public.users(id) on delete set null,
  constraint fk_v2_bookings_legacy
    foreign key (legacy_booking_id) references public.bookings(id) on delete restrict,
  constraint chk_v2_booking_persisted_status check (status <> 'NEW'),
  constraint chk_v2_booking_schedule check (
    (booking_type = 'IMMEDIATE' and scheduled_at is null)
    or (booking_type = 'SCHEDULED' and scheduled_at is not null)
  ),
  constraint chk_v2_pickup_lat check (pickup_lat is null or pickup_lat between -90 and 90),
  constraint chk_v2_pickup_lng check (pickup_lng is null or pickup_lng between -180 and 180),
  constraint chk_v2_dropoff_lat check (dropoff_lat is null or dropoff_lat between -90 and 90),
  constraint chk_v2_dropoff_lng check (dropoff_lng is null or dropoff_lng between -180 and 180),
  constraint chk_v2_cancelled_fields check (
    (status = 'CANCELLED' and cancelled_at is not null)
    or (status <> 'CANCELLED' and cancelled_at is null)
  )
);

create index idx_v2_bookings_customer_created
  on booking_v2.bookings (customer_id, created_at desc);
create index idx_v2_bookings_status_created
  on booking_v2.bookings (status, created_at desc);
create index idx_v2_bookings_category_status
  on booking_v2.bookings (requested_car_type_id, status, created_at desc);
create index idx_v2_bookings_scheduled
  on booking_v2.bookings (booking_type, scheduled_at, status);

create table booking_v2.booking_status_transitions (
  from_status booking_v2.booking_status not null,
  to_status booking_v2.booking_status not null,
  requires_active_assignment boolean not null default false,
  terminal_transition boolean not null default false,
  primary key (from_status, to_status),
  constraint chk_v2_transition_different check (from_status <> to_status)
);

insert into booking_v2.booking_status_transitions
  (from_status, to_status, requires_active_assignment, terminal_transition)
values
  ('NEW', 'PENDING', false, false),
  ('PENDING', 'ACCEPTED', true, false),
  ('PENDING', 'CANCELLED', false, true),
  ('ACCEPTED', 'ARRIVED_PICKUP', true, false),
  ('ACCEPTED', 'CANCELLED', true, true),
  ('ARRIVED_PICKUP', 'STARTED', true, false),
  ('ARRIVED_PICKUP', 'CANCELLED', true, true),
  ('STARTED', 'ARRIVED_DESTINATION', true, false),
  ('STARTED', 'CANCELLED', true, true),
  ('ARRIVED_DESTINATION', 'COMPLETED', true, false),
  ('ARRIVED_DESTINATION', 'CANCELLED', true, true),
  ('COMPLETED', 'PAID', false, true);

create table booking_v2.booking_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  driver_id uuid not null,
  vehicle_id uuid not null,

  assignment_status booking_v2.assignment_status not null default 'ASSIGNED',
  assigned_at timestamptz not null default now(),
  accepted_at timestamptz,
  closed_at timestamptz,
  assigned_by_user_id uuid,
  close_reason text,

  driver_name_snapshot varchar(255),
  driver_contact_snapshot varchar(50),
  vehicle_plate_snapshot varchar(100),
  vehicle_make_snapshot varchar(255),
  vehicle_model_snapshot varchar(255),
  vehicle_color_snapshot varchar(255),
  car_type_name_snapshot varchar(255),

  constraint uq_v2_assignment_id_booking unique (id, booking_id),
  constraint fk_v2_assignment_booking
    foreign key (booking_id) references booking_v2.bookings(id) on delete cascade,
  constraint fk_v2_assignment_driver
    foreign key (driver_id) references public.users(id) on delete restrict,
  constraint fk_v2_assignment_vehicle
    foreign key (vehicle_id) references public.cars(id) on delete restrict,
  constraint fk_v2_assignment_assigned_by
    foreign key (assigned_by_user_id) references public.users(id) on delete set null,
  constraint chk_v2_assignment_dates check (closed_at is null or closed_at >= assigned_at),
  constraint chk_v2_assignment_open_state check (
    (closed_at is null and assignment_status in ('OFFERED', 'ASSIGNED', 'ACCEPTED'))
    or
    (closed_at is not null and assignment_status in ('REJECTED', 'RELEASED', 'CANCELLED'))
  ),
  constraint chk_v2_assignment_acceptance check (
    (assignment_status = 'ACCEPTED' and accepted_at is not null)
    or assignment_status <> 'ACCEPTED'
  )
);

create unique index uq_v2_active_booking_assignment
  on booking_v2.booking_assignments (booking_id)
  where closed_at is null;
create index idx_v2_assignment_booking_history
  on booking_v2.booking_assignments (booking_id, assigned_at desc);
create index idx_v2_assignment_driver
  on booking_v2.booking_assignments (driver_id, assigned_at desc);
create index idx_v2_assignment_vehicle
  on booking_v2.booking_assignments (vehicle_id, assigned_at desc);

create table booking_v2.booking_status_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  from_status booking_v2.booking_status not null,
  to_status booking_v2.booking_status not null,
  changed_by_user_id uuid,
  source booking_v2.event_source not null,
  reason text,
  metadata jsonb,
  occurred_at timestamptz not null default now(),

  constraint fk_v2_status_event_booking
    foreign key (booking_id) references booking_v2.bookings(id) on delete cascade,
  constraint fk_v2_status_event_user
    foreign key (changed_by_user_id) references public.users(id) on delete set null,
  constraint chk_v2_status_event_different check (from_status <> to_status)
);

create index idx_v2_status_event_booking
  on booking_v2.booking_status_events (booking_id, occurred_at, id);
create index idx_v2_status_event_target
  on booking_v2.booking_status_events (to_status, occurred_at desc);

create table booking_v2.booking_milestones (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  assignment_id uuid,
  milestone_type booking_v2.milestone_type not null,
  occurred_at timestamptz not null default now(),
  location_lat numeric(10,7),
  location_lng numeric(10,7),
  accuracy_m numeric(10,2),
  recorded_by_user_id uuid,
  source booking_v2.event_source not null default 'APP',
  metadata jsonb,

  constraint uq_v2_milestone_once unique (booking_id, milestone_type),
  constraint fk_v2_milestone_booking
    foreign key (booking_id) references booking_v2.bookings(id) on delete cascade,
  constraint fk_v2_milestone_assignment
    foreign key (assignment_id, booking_id)
    references booking_v2.booking_assignments(id, booking_id) on delete restrict,
  constraint fk_v2_milestone_user
    foreign key (recorded_by_user_id) references public.users(id) on delete set null,
  constraint chk_v2_milestone_lat check (location_lat is null or location_lat between -90 and 90),
  constraint chk_v2_milestone_lng check (location_lng is null or location_lng between -180 and 180),
  constraint chk_v2_milestone_accuracy check (accuracy_m is null or accuracy_m >= 0)
);

create index idx_v2_milestone_booking_time
  on booking_v2.booking_milestones (booking_id, occurred_at);
create index idx_v2_milestone_assignment
  on booking_v2.booking_milestones (assignment_id, booking_id);

create table booking_v2.booking_fares (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  currency char(3) not null default 'COP',

  estimated_distance_m integer,
  estimated_duration_s integer,
  actual_distance_m integer,
  actual_duration_s integer,

  estimated_fare numeric(14,2) not null default 0,
  base_fare numeric(14,2) not null default 0,
  distance_fare numeric(14,2) not null default 0,
  time_fare numeric(14,2) not null default 0,
  convenience_fee numeric(14,2) not null default 0,
  airport_surcharge numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  final_fare numeric(14,2),
  driver_earnings numeric(14,2),

  tariff_snapshot jsonb,
  calculated_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_v2_booking_fare unique (booking_id),
  constraint fk_v2_fare_booking
    foreign key (booking_id) references booking_v2.bookings(id) on delete cascade,
  constraint chk_v2_fare_distances check (
    (estimated_distance_m is null or estimated_distance_m >= 0)
    and (actual_distance_m is null or actual_distance_m >= 0)
  ),
  constraint chk_v2_fare_durations check (
    (estimated_duration_s is null or estimated_duration_s >= 0)
    and (actual_duration_s is null or actual_duration_s >= 0)
  ),
  constraint chk_v2_fare_non_negative check (
    estimated_fare >= 0
    and base_fare >= 0
    and distance_fare >= 0
    and time_fare >= 0
    and convenience_fee >= 0
    and airport_surcharge >= 0
    and discount_amount >= 0
    and (final_fare is null or final_fare >= 0)
    and (driver_earnings is null or driver_earnings >= 0)
  )
);

create table booking_v2.booking_access_codes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  code_hash text not null,
  generated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  failed_attempts integer not null default 0,
  max_attempts integer not null default 5,
  invalidated_at timestamptz,
  invalidation_reason varchar(100),

  constraint fk_v2_access_code_booking
    foreign key (booking_id) references booking_v2.bookings(id) on delete cascade,
  constraint chk_v2_access_code_dates check (expires_at > generated_at),
  constraint chk_v2_access_code_attempts check (
    failed_attempts >= 0
    and max_attempts > 0
    and failed_attempts <= max_attempts
  )
);

create unique index uq_v2_active_booking_access_code
  on booking_v2.booking_access_codes (booking_id)
  where verified_at is null and invalidated_at is null;
create index idx_v2_access_code_booking
  on booking_v2.booking_access_codes (booking_id, generated_at desc);
create index idx_v2_access_code_expiry
  on booking_v2.booking_access_codes (expires_at);

-- --------------------------------------------------------------------------
-- Common helpers
-- --------------------------------------------------------------------------

create function booking_v2.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, booking_v2
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_v2_bookings_updated_at
before update on booking_v2.bookings
for each row execute function booking_v2.touch_updated_at();

create trigger trg_v2_booking_fares_updated_at
before update on booking_v2.booking_fares
for each row execute function booking_v2.touch_updated_at();

create function booking_v2.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select u.id
  from public.users u
  where u.auth_id = auth.uid()
  limit 1
$$;

create function booking_v2.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.users u
    where u.auth_id = auth.uid()
      and u.user_type = 'admin'
      and coalesce(u.blocked, false) = false
  )
$$;

create function booking_v2.can_access_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, booking_v2
as $$
  select
    booking_v2.is_admin()
    or exists (
      select 1
      from booking_v2.bookings b
      where b.id = p_booking_id
        and b.customer_id = booking_v2.current_app_user_id()
    )
    or exists (
      select 1
      from booking_v2.booking_assignments a
      where a.booking_id = p_booking_id
        and a.driver_id = booking_v2.current_app_user_id()
    )
$$;

-- --------------------------------------------------------------------------
-- RPC: create booking
-- --------------------------------------------------------------------------

create function booking_v2.create_booking(
  p_idempotency_key varchar,
  p_customer_id uuid,
  p_requested_car_type_id uuid,
  p_booking_type booking_v2.booking_type,
  p_scheduled_at timestamptz,
  p_request_expires_at timestamptz,
  p_pickup_address text,
  p_pickup_lat numeric,
  p_pickup_lng numeric,
  p_dropoff_address text,
  p_dropoff_lat numeric,
  p_dropoff_lng numeric,
  p_waypoints jsonb,
  p_observations text,
  p_payment_mode varchar,
  p_estimated_distance_m integer,
  p_estimated_duration_s integer,
  p_estimated_fare numeric,
  p_tariff_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
declare
  v_booking_id uuid;
  v_reference text;
begin
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'idempotency_key es obligatorio';
  end if;

  if p_requested_car_type_id is null then
    raise exception 'requested_car_type_id es obligatorio para reservas nuevas';
  end if;

  if auth.uid() is not null
     and p_customer_id is distinct from booking_v2.current_app_user_id()
     and not booking_v2.is_admin() then
    raise exception 'No puede crear una reserva para otro cliente';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));

  select b.id into v_booking_id
  from booking_v2.bookings b
  where b.idempotency_key = p_idempotency_key;

  if v_booking_id is not null then
    return v_booking_id;
  end if;

  v_booking_id := gen_random_uuid();
  v_reference := 'BK-' || to_char(clock_timestamp() at time zone 'UTC', 'YYYYMMDDHH24MISS')
    || '-' || upper(substr(replace(v_booking_id::text, '-', ''), 1, 8));

  insert into booking_v2.bookings (
    id, reference, idempotency_key,
    customer_id, requested_car_type_id,
    status, booking_type, scheduled_at, request_expires_at,
    pickup_address, pickup_lat, pickup_lng,
    dropoff_address, dropoff_lat, dropoff_lng,
    waypoints, observations, payment_mode
  ) values (
    v_booking_id, v_reference, p_idempotency_key,
    p_customer_id, p_requested_car_type_id,
    'PENDING', coalesce(p_booking_type, 'IMMEDIATE'),
    p_scheduled_at, p_request_expires_at,
    p_pickup_address, p_pickup_lat, p_pickup_lng,
    p_dropoff_address, p_dropoff_lat, p_dropoff_lng,
    p_waypoints, p_observations, p_payment_mode
  );

  insert into booking_v2.booking_status_events (
    booking_id, from_status, to_status,
    changed_by_user_id, source, reason, metadata
  ) values (
    v_booking_id, 'NEW', 'PENDING',
    p_customer_id, 'SYSTEM',
    'Reserva creada y publicada para asignación',
    jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  insert into booking_v2.booking_fares (
    booking_id, estimated_distance_m, estimated_duration_s,
    estimated_fare, tariff_snapshot
  ) values (
    v_booking_id, p_estimated_distance_m, p_estimated_duration_s,
    coalesce(p_estimated_fare, 0), p_tariff_snapshot
  );

  return v_booking_id;
end;
$$;

-- --------------------------------------------------------------------------
-- RPC: assign driver and vehicle
-- --------------------------------------------------------------------------

create function booking_v2.assign_booking(
  p_booking_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid,
  p_assigned_by_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
declare
  v_booking booking_v2.bookings%rowtype;
  v_driver public.users%rowtype;
  v_car public.cars%rowtype;
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
  from public.users
  where id = p_driver_id
    and user_type = 'driver'
    and coalesce(approved, false) = true
    and coalesce(blocked, false) = false;

  select * into strict v_car
  from public.cars
  where id = p_vehicle_id
    and driver_id = p_driver_id
    and coalesce(is_active, false) = true;

  select ct.name into v_category_name
  from public.car_types ct
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
$$;

-- --------------------------------------------------------------------------
-- RPC: validated state transition
-- --------------------------------------------------------------------------

create function booking_v2.transition_booking_status(
  p_booking_id uuid,
  p_expected_status booking_v2.booking_status,
  p_new_status booking_v2.booking_status,
  p_changed_by_user_id uuid default null,
  p_source booking_v2.event_source default 'SYSTEM',
  p_reason text default null,
  p_metadata jsonb default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_accuracy_m numeric default null,
  p_cancellation_category varchar default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
declare
  v_current_status booking_v2.booking_status;
  v_requires_assignment boolean;
  v_assignment_id uuid;
  v_milestone booking_v2.milestone_type;
  v_actor_id uuid;
begin
  v_actor_id := coalesce(p_changed_by_user_id, booking_v2.current_app_user_id());

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
$$;

-- --------------------------------------------------------------------------
-- RPC: issue access code after STARTED. Only a hash is persisted.
-- --------------------------------------------------------------------------

create function booking_v2.issue_access_code(
  p_booking_id uuid,
  p_code_hash text,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, booking_v2
as $$
declare
  v_status booking_v2.booking_status;
  v_id uuid;
begin
  select status into strict v_status
  from booking_v2.bookings
  where id = p_booking_id
  for update;

  if v_status <> 'STARTED' then
    raise exception 'El código solo se genera cuando el servicio está STARTED';
  end if;

  if nullif(p_code_hash, '') is null or p_expires_at <= now() then
    raise exception 'Hash o expiración inválidos';
  end if;

  update booking_v2.booking_access_codes
  set invalidated_at = now(), invalidation_reason = 'REPLACED'
  where booking_id = p_booking_id
    and verified_at is null
    and invalidated_at is null;

  insert into booking_v2.booking_access_codes (
    booking_id, code_hash, expires_at
  ) values (
    p_booking_id, p_code_hash, p_expires_at
  ) returning id into v_id;

  return v_id;
exception
  when no_data_found then
    raise exception 'Reserva inexistente';
end;
$$;

-- --------------------------------------------------------------------------
-- RPC: migrate one legacy public.bookings row without inventing history.
-- --------------------------------------------------------------------------

create function booking_v2.migrate_legacy_booking(p_legacy_booking_id uuid)
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
    status, booking_type,
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
    v_status, 'IMMEDIATE',
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

-- --------------------------------------------------------------------------
-- RLS: direct writes are blocked. Mutations go through the validated RPCs.
-- --------------------------------------------------------------------------

alter table booking_v2.bookings enable row level security;
alter table booking_v2.booking_status_transitions enable row level security;
alter table booking_v2.booking_assignments enable row level security;
alter table booking_v2.booking_status_events enable row level security;
alter table booking_v2.booking_milestones enable row level security;
alter table booking_v2.booking_fares enable row level security;
alter table booking_v2.booking_access_codes enable row level security;

create policy v2_bookings_select_scoped
on booking_v2.bookings
for select to authenticated
using (booking_v2.can_access_booking(id));

create policy v2_transitions_read
on booking_v2.booking_status_transitions
for select to authenticated
using (true);

create policy v2_assignments_select_scoped
on booking_v2.booking_assignments
for select to authenticated
using (booking_v2.can_access_booking(booking_id));

create policy v2_events_select_scoped
on booking_v2.booking_status_events
for select to authenticated
using (booking_v2.can_access_booking(booking_id));

create policy v2_milestones_select_scoped
on booking_v2.booking_milestones
for select to authenticated
using (booking_v2.can_access_booking(booking_id));

create policy v2_fares_select_scoped
on booking_v2.booking_fares
for select to authenticated
using (booking_v2.can_access_booking(booking_id));

create policy v2_access_codes_admin_only
on booking_v2.booking_access_codes
for select to authenticated
using (booking_v2.is_admin());

revoke all on schema booking_v2 from public;
grant usage on schema booking_v2 to authenticated, service_role;

grant select on booking_v2.bookings to authenticated;
grant select on booking_v2.booking_status_transitions to authenticated;
grant select on booking_v2.booking_assignments to authenticated;
grant select on booking_v2.booking_status_events to authenticated;
grant select on booking_v2.booking_milestones to authenticated;
grant select on booking_v2.booking_fares to authenticated;
grant select on booking_v2.booking_access_codes to authenticated;

revoke all on all functions in schema booking_v2 from public;
grant execute on function booking_v2.create_booking(
  varchar, uuid, uuid, booking_v2.booking_type, timestamptz, timestamptz,
  text, numeric, numeric, text, numeric, numeric, jsonb, text, varchar,
  integer, integer, numeric, jsonb
) to authenticated, service_role;
grant execute on function booking_v2.assign_booking(uuid, uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function booking_v2.transition_booking_status(
  uuid, booking_v2.booking_status, booking_v2.booking_status, uuid,
  booking_v2.event_source, text, jsonb, numeric, numeric, numeric, varchar
) to authenticated, service_role;
grant execute on function booking_v2.issue_access_code(uuid, text, timestamptz)
  to authenticated, service_role;
grant execute on function booking_v2.migrate_legacy_booking(uuid)
  to service_role;

comment on schema booking_v2 is
  'Parallel reservation model for migration and behavior testing; legacy model remains in public.';
