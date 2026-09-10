-- ============================================================================
-- booking_v2 end-to-end smoke test
--
-- Safe for the Supabase test project:
--   - creates synthetic rows only;
--   - exercises the RPC workflow;
--   - raises an exception if an assertion fails;
--   - always ends with ROLLBACK, leaving no test rows behind.
-- ============================================================================

begin;

do $$
declare
  v_customer_id uuid := '91000000-0000-0000-0000-000000000001';
  v_driver_id uuid := '91000000-0000-0000-0000-000000000002';
  v_admin_id uuid := '91000000-0000-0000-0000-000000000003';
  v_car_type_id uuid := '92000000-0000-0000-0000-000000000001';
  v_vehicle_id uuid := '93000000-0000-0000-0000-000000000001';
  v_booking_id uuid;
  v_idempotent_booking_id uuid;
  v_assignment_id uuid;
  v_access_code_id uuid;
  v_status booking_v2.booking_status;
  v_count integer;
  v_expected_failure boolean;
begin
  insert into public.users (
    id, auth_id, email, first_name, last_name, mobile,
    user_type, approved, blocked, is_active
  ) values
    (
      v_customer_id, null, 'smoke.customer@example.invalid',
      'Smoke', 'Customer', '3000000001',
      'customer', true, false, true
    ),
    (
      v_driver_id, null, 'smoke.driver@example.invalid',
      'Smoke', 'Driver', '3000000002',
      'driver', true, false, true
    ),
    (
      v_admin_id, null, 'smoke.admin@example.invalid',
      'Smoke', 'Admin', '3000000003',
      'admin', true, false, true
    );

  insert into public.car_types (
    id, name, description, base_price, price_per_km,
    capacity, is_active
  ) values (
    v_car_type_id, 'SmokePlus', 'Synthetic smoke-test category',
    10000, 500, 4, true
  );

  insert into public.cars (
    id, driver_id, make, model, color, plate,
    capacity, is_active, service_type
  ) values (
    v_vehicle_id, v_driver_id,
    'SmokeMake', 'SmokeModel', 'Black', 'SMK001',
    4, true, 'SmokePlus'
  );

  v_booking_id := booking_v2.create_booking(
    p_idempotency_key => 'booking-v2-smoke-001',
    p_customer_id => v_customer_id,
    p_requested_car_type_id => v_car_type_id,
    p_booking_type => 'IMMEDIATE',
    p_scheduled_at => null,
    p_request_expires_at => now() + interval '5 minutes',
    p_pickup_address => 'Synthetic pickup',
    p_pickup_lat => 4.6000000,
    p_pickup_lng => -74.0800000,
    p_dropoff_address => 'Synthetic destination',
    p_dropoff_lat => 4.6500000,
    p_dropoff_lng => -74.1000000,
    p_waypoints => null,
    p_observations => 'booking_v2 smoke test',
    p_payment_mode => 'cash',
    p_estimated_distance_m => 8500,
    p_estimated_duration_s => 1200,
    p_estimated_fare => 20000,
    p_tariff_snapshot => jsonb_build_object(
      'source', 'smoke_test',
      'category', 'SmokePlus'
    )
  );

  if v_booking_id is null then
    raise exception 'ASSERTION FAILED: create_booking returned null';
  end if;

  v_idempotent_booking_id := booking_v2.create_booking(
    p_idempotency_key => 'booking-v2-smoke-001',
    p_customer_id => v_customer_id,
    p_requested_car_type_id => v_car_type_id,
    p_booking_type => 'IMMEDIATE',
    p_scheduled_at => null,
    p_request_expires_at => now() + interval '5 minutes',
    p_pickup_address => 'Ignored duplicate pickup',
    p_pickup_lat => 4.6000000,
    p_pickup_lng => -74.0800000,
    p_dropoff_address => 'Ignored duplicate destination',
    p_dropoff_lat => 4.6500000,
    p_dropoff_lng => -74.1000000,
    p_waypoints => null,
    p_observations => null,
    p_payment_mode => 'cash',
    p_estimated_distance_m => 8500,
    p_estimated_duration_s => 1200,
    p_estimated_fare => 20000,
    p_tariff_snapshot => '{}'::jsonb
  );

  if v_idempotent_booking_id <> v_booking_id then
    raise exception 'ASSERTION FAILED: idempotency returned a different booking';
  end if;

  select status into v_status
  from booking_v2.bookings
  where id = v_booking_id;

  if v_status <> 'PENDING' then
    raise exception 'ASSERTION FAILED: expected PENDING, got %', v_status;
  end if;

  select count(*) into v_count
  from booking_v2.booking_fares
  where booking_id = v_booking_id;

  if v_count <> 1 then
    raise exception 'ASSERTION FAILED: expected one fare, got %', v_count;
  end if;

  v_assignment_id := booking_v2.assign_booking(
    p_booking_id => v_booking_id,
    p_driver_id => v_driver_id,
    p_vehicle_id => v_vehicle_id,
    p_assigned_by_user_id => v_admin_id
  );

  if v_assignment_id is null then
    raise exception 'ASSERTION FAILED: assign_booking returned null';
  end if;

  v_expected_failure := false;
  begin
    perform booking_v2.assign_booking(
      p_booking_id => v_booking_id,
      p_driver_id => v_driver_id,
      p_vehicle_id => v_vehicle_id,
      p_assigned_by_user_id => v_admin_id
    );
  exception when others then
    v_expected_failure := true;
  end;

  if not v_expected_failure then
    raise exception 'ASSERTION FAILED: duplicate active assignment was accepted';
  end if;

  perform booking_v2.transition_booking_status(
    v_booking_id, 'PENDING', 'ACCEPTED', v_driver_id, 'APP'
  );
  perform booking_v2.transition_booking_status(
    v_booking_id, 'ACCEPTED', 'ARRIVED_PICKUP', v_driver_id, 'APP',
    null, null, 4.6000000, -74.0800000, 5, null
  );
  perform booking_v2.transition_booking_status(
    v_booking_id, 'ARRIVED_PICKUP', 'STARTED', v_driver_id, 'APP',
    null, null, 4.6000000, -74.0800000, 5, null
  );

  v_access_code_id := booking_v2.issue_access_code(
    v_booking_id,
    'sha256:synthetic-hash-not-a-real-otp',
    now() + interval '3 minutes'
  );

  if v_access_code_id is null then
    raise exception 'ASSERTION FAILED: issue_access_code returned null';
  end if;

  perform booking_v2.transition_booking_status(
    v_booking_id, 'STARTED', 'ARRIVED_DESTINATION', v_driver_id, 'APP',
    null, null, 4.6500000, -74.1000000, 5, null
  );
  perform booking_v2.transition_booking_status(
    v_booking_id, 'ARRIVED_DESTINATION', 'COMPLETED', v_driver_id, 'APP',
    null, null, 4.6500000, -74.1000000, 5, null
  );
  perform booking_v2.transition_booking_status(
    v_booking_id, 'COMPLETED', 'PAID', v_admin_id, 'ADMIN'
  );

  select status into v_status
  from booking_v2.bookings
  where id = v_booking_id;

  if v_status <> 'PAID' then
    raise exception 'ASSERTION FAILED: expected PAID, got %', v_status;
  end if;

  select count(*) into v_count
  from booking_v2.booking_status_events
  where booking_id = v_booking_id;

  if v_count <> 7 then
    raise exception 'ASSERTION FAILED: expected 7 status events, got %', v_count;
  end if;

  select count(*) into v_count
  from booking_v2.booking_milestones
  where booking_id = v_booking_id;

  if v_count <> 4 then
    raise exception 'ASSERTION FAILED: expected 4 milestones, got %', v_count;
  end if;

  v_expected_failure := false;
  begin
    perform booking_v2.transition_booking_status(
      v_booking_id, 'PAID', 'CANCELLED', v_admin_id, 'ADMIN'
    );
  exception when others then
    v_expected_failure := true;
  end;

  if not v_expected_failure then
    raise exception 'ASSERTION FAILED: invalid PAID -> CANCELLED transition succeeded';
  end if;

  raise notice 'BOOKING_V2_SMOKE_TEST_OK booking_id=%', v_booking_id;
end;
$$;

rollback;

-- Expected final output:
--   NOTICE: BOOKING_V2_SMOKE_TEST_OK booking_id=...
--   ROLLBACK
