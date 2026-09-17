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
  v_customer_id uuid := gen_random_uuid();
  v_driver_id uuid := gen_random_uuid();
  v_admin_id uuid := gen_random_uuid();
  v_car_type_id uuid := gen_random_uuid();
  v_vehicle_id uuid := gen_random_uuid();
  v_driver_auth_id uuid := gen_random_uuid();
  v_customer_auth_id uuid := gen_random_uuid();
  v_pickup_code text;
  v_mobile_id uuid;
  v_mobile_code text;
  v_membership_id uuid := gen_random_uuid();
  v_run_id text := gen_random_uuid()::text;
  v_booking_id uuid;
  v_idempotent_booking_id uuid;
  v_assignment_id uuid;
  v_access_code_id uuid;
  v_status booking_v2.booking_status;
  v_count integer;
  v_expected_failure boolean;
  v_campaign_id uuid:=gen_random_uuid();
begin
  insert into public.users (
    id, auth_id, email, first_name, last_name, mobile,
    user_type, approved, blocked, is_active
  ) values
    (
      v_admin_id, null, 'smoke.admin.' || v_run_id || '@example.invalid',
      'Smoke', 'Admin', '3000000003',
      'admin', true, false, true
    );

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_customer_auth_id, 'smoke.customer.' || v_run_id || '@example.invalid',
    '{"first_name":"Smoke","last_name":"Customer","user_type":"customer"}'::jsonb);
  insert into public.users (id, auth_id, email, first_name, last_name, user_type, approved, blocked)
  values (v_customer_id, v_customer_auth_id, 'smoke.customer.' || v_run_id || '@example.invalid',
    'Smoke', 'Customer', 'customer', true, false)
  on conflict (auth_id) do update set approved = true, blocked = false
  returning id into v_customer_id;

  -- A real FK-compatible Auth identity, deliberately different from users.id.
  -- No password/login/email API is invoked; every row is rolled back.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_driver_auth_id, 'smoke.driver.' || v_run_id || '@example.invalid',
    '{"first_name":"Smoke","last_name":"Driver","user_type":"driver"}'::jsonb);
  -- Accommodate environments whose Auth trigger already creates the profile.
  insert into public.users (id, auth_id, email, first_name, last_name, user_type, approved, blocked)
  values (v_driver_id, v_driver_auth_id, 'smoke.driver.' || v_run_id || '@example.invalid',
    'Smoke', 'Driver', 'driver', true, false)
  on conflict (auth_id) do update set approved = true, blocked = false
  returning id into v_driver_id;
  if v_driver_id = v_driver_auth_id then
    raise exception 'Fixture must exercise distinct profile/Auth IDs';
  end if;
  update public.users set driver_active_status=true where id=v_driver_id;

  insert into public.car_types (
    id, name, description, base_price, price_per_km,
    capacity, is_active
  ) values (
    v_car_type_id, 'Smoke-' || left(v_run_id, 8), 'Synthetic smoke-test category',
    10000, 500, 4, true
  );

  insert into public.cars (
    id, driver_id, make, model, color, plate,
    capacity, is_active, service_type
  ) values (
    v_vehicle_id, v_driver_id,
    'SmokeMake', 'SmokeModel', 'Black', 'SMK-' || left(v_run_id, 12),
    4, true, 'Smoke-' || left(v_run_id, 8)
  );

  v_booking_id := booking_v2.create_booking(
    p_idempotency_key => v_run_id,
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
    p_idempotency_key => v_run_id,
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

  v_expected_failure := false;
  begin
    perform booking_v2.assign_booking(v_booking_id, v_driver_id, v_vehicle_id, v_admin_id);
  exception when raise_exception then
    if SQLERRM <> 'El conductor no tiene una membresía activa y vigente' then raise; end if;
    v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception 'Driver without membership was accepted'; end if;

  insert into public.memberships (uid, conductor, status, fecha_inicio, fecha_terminada)
  values (v_membership_id, v_driver_auth_id, 'ACTIVA', current_date - 2, current_date - 1);
  v_expected_failure := false;
  begin
    perform booking_v2.assign_booking(v_booking_id, v_driver_id, v_vehicle_id, v_admin_id);
  exception when raise_exception then
    if SQLERRM <> 'El conductor no tiene una membresía activa y vigente' then raise; end if;
    v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception 'Expired membership was accepted'; end if;
  update public.memberships set fecha_terminada = current_date + 30 where uid = v_membership_id;

  update public.users set user_type='admin',approved=true where id=v_customer_id;
  perform set_config('request.jwt.claim.sub',v_customer_auth_id::text,true);
  set local role authenticated;
  if not (booking_v2.list_assignable_drivers('') @> jsonb_build_array(jsonb_build_object('id',v_driver_id))) then
    raise exception 'Admin driver list did not include eligible driver'; end if;
  reset role;
  update public.users set user_type='customer' where id=v_customer_id;

  -- Exercise the screen-facing view with real database role restrictions.
  perform set_config('request.jwt.claim.sub',v_customer_auth_id::text,true);
  set local role authenticated;
  insert into public.bookings_v2_mobile(customer,car_type_id,pickup_address,pickup_lat,pickup_lng,
    drop_address,drop_lat,drop_lng,price,booking_type,booking_date)
  values(v_customer_id,v_car_type_id,'Mobile pickup',4.6,-74.08,'Mobile dropoff',4.65,-74.1,20000,'reservation',now()+interval '1 day')
  returning id into v_mobile_id;
  v_mobile_code := booking_v2.deliver_pickup_code(v_mobile_id)->>'code';
  if (select otp from public.bookings_v2_mobile where id=v_mobile_id) is distinct from v_mobile_code then
    raise exception 'Customer cannot read delivered OTP'; end if;
  if (booking_v2.deliver_pickup_code(v_mobile_id)->>'code') <> v_mobile_code then
    raise exception 'Code changed after reopening';
  end if;
  reset role;
  if exists(select 1 from public.bookings where id=v_mobile_id) then raise exception 'Mobile wrote a legacy row'; end if;
  perform set_config('request.jwt.claim.sub',v_driver_auth_id::text,true);
  set local role authenticated;
  perform booking_v2.record_vehicle_position(4.62,-74.08,5,now()-interval '2 seconds',null);
  if not exists(select 1 from booking_v2.list_vehicle_locations('SMK-') where booking_status='AVAILABLE' and booking_id is null) then
    raise exception 'Available vehicle is missing from general map'; end if;
  update public.bookings_v2_mobile set status='ACCEPTED',driver=v_driver_id where id=v_mobile_id;
  perform booking_v2.record_vehicle_position(4.61,-74.08,5,now()-interval '1 second',v_mobile_id);
  if not exists(select 1 from booking_v2.list_vehicle_locations('SMK-') where booking_id=v_mobile_id and booking_status='ACCEPTED') then
    raise exception 'Accepted trip is missing from vehicle map'; end if;
  update public.bookings_v2_mobile set status='ARRIVED' where id=v_mobile_id;
  if (select otp from public.bookings_v2_mobile where id=v_mobile_id) is not null then
    raise exception 'OTP leaked to driver'; end if;
  if not booking_v2.verify_pickup_code(v_mobile_id,v_mobile_code) then raise exception 'Mobile code failed'; end if;
  update public.bookings_v2_mobile set status='STARTED' where id=v_mobile_id;
  perform booking_v2.record_vehicle_position(4.6,-74.08,5,now(),v_mobile_id);
  perform booking_v2.record_vehicle_position(4.5,-74.0,5,now()-interval '1 minute',v_mobile_id);
  if not exists(select 1 from booking_v2.list_vehicle_locations('SMK-') where booking_id=v_mobile_id and driver_lat=4.6 and booking_status='STARTED') then
    raise exception 'Live map failed or older point replaced the latest'; end if;
  perform booking_v2.register_push_device('ExpoPushToken[android_'||v_run_id||']','ANDROID');
  perform booking_v2.register_push_device('ExpoPushToken[ios_'||v_run_id||']','IOS');
  perform booking_v2.register_push_device('ExpoPushToken[android_'||v_run_id||']','ANDROID');
  v_expected_failure:=false;
  begin
    perform booking_v2.create_push_campaign(v_campaign_id,'Denied','Denied','driver','ALL');
  exception when raise_exception then v_expected_failure:=true;
  end;
  if not v_expected_failure then raise exception 'Driver created mass push'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub',v_customer_auth_id::text,true);
  set local role authenticated;
  if not exists(select 1 from booking_v2.list_vehicle_locations('') where booking_id=v_mobile_id) then
    raise exception 'Customer cannot see own assigned vehicle'; end if;
  v_expected_failure:=false;
  begin perform booking_v2.record_vehicle_position(4.6,-74.08,5,now(),v_mobile_id);
  exception when raise_exception then v_expected_failure:=true; end;
  if not v_expected_failure then raise exception 'Customer spoofed GPS'; end if;
  reset role;
  update public.users set user_type='admin',approved=true where id=v_customer_id;
  set local role authenticated;
  perform booking_v2.create_push_campaign(v_campaign_id,'Test only','No external sending','driver','ALL');
  perform booking_v2.create_push_campaign(v_campaign_id,'Test only','No external sending','driver','ALL');
  if not exists(select 1 from booking_v2.push_campaign_counts() where campaign_id=v_campaign_id and pending>=2)
    or (select count(*) from booking_v2.push_deliveries where campaign_id=v_campaign_id and recipient_id=v_driver_id)<>2 then
    raise exception 'Android/iOS campaign targets or idempotency failed'; end if;
  reset role;
  update public.users set user_type='customer' where id=v_customer_id;
  perform set_config('request.jwt.claim.sub',v_driver_auth_id::text,true);
  set local role authenticated;
  insert into public.booking_tracking_v2(booking_id,driver_id,lat,lng) values(v_mobile_id,v_driver_id,4.6,-74.08);
  update public.bookings_v2_mobile set status='COMPLETE',total_cost=21000,driver_share=19000 where id=v_mobile_id;
  update public.bookings_v2_mobile set trip_cost=22000 where id=v_mobile_id;
  reset role;
  if (select final_fare from booking_v2.booking_fares where booking_id=v_mobile_id) <> 22000 then
    raise exception 'Final fare did not preserve mobile trip_cost'; end if;
  if not exists(select 1 from booking_v2.notification_outbox where booking_id=v_mobile_id
    and recipient_id=v_customer_id and payload->>'newStatus'='COMPLETE' and sent_at is null) then
    raise exception 'Completion notification was not queued'; end if;
  if not exists(select 1 from booking_v2.bookings where id=v_mobile_id and status='COMPLETED') then
    raise exception 'Mobile completion failed'; end if;
  perform set_config('request.jwt.claim.sub','',true);

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
  perform set_config('request.jwt.claim.sub', v_customer_auth_id::text, true);
  v_pickup_code := booking_v2.issue_pickup_code(v_booking_id)->>'code';
  v_expected_failure := false;
  begin
    perform booking_v2.transition_booking_status(v_booking_id,'ARRIVED_PICKUP','STARTED');
  exception when raise_exception then
    if SQLERRM <> 'La acción requiere el conductor asignado o un administrador' then raise; end if;
    v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception 'Customer could start the trip'; end if;

  perform set_config('request.jwt.claim.sub', v_driver_auth_id::text, true);
  v_expected_failure := false;
  begin
    perform booking_v2.transition_booking_status(v_booking_id,'ARRIVED_PICKUP','STARTED');
  exception when raise_exception then
    if SQLERRM <> 'Debe verificar el código antes de iniciar el viaje' then raise; end if;
    v_expected_failure := true;
  end;
  if not v_expected_failure then raise exception 'Driver bypassed OTP'; end if;
  if booking_v2.verify_pickup_code(v_booking_id,'invalid') then raise exception 'Bad OTP accepted'; end if;
  if (select failed_attempts from booking_v2.booking_access_codes where booking_id=v_booking_id
      and invalidated_at is null) <> 1 then raise exception 'Failed attempt did not persist'; end if;
  if not booking_v2.verify_pickup_code(v_booking_id,v_pickup_code) then raise exception 'Valid OTP rejected'; end if;
  perform booking_v2.transition_booking_status(
    v_booking_id, 'ARRIVED_PICKUP', 'STARTED', v_driver_id, 'APP',
    null, null, 4.6000000, -74.0800000, 5, null
  );
  perform set_config('request.jwt.claim.sub', '', true);

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
