-- All fixtures and test writes run in a separate transaction ending in ROLLBACK.
DO $test$
DECLARE
  admin_id uuid:=gen_random_uuid(); admin_auth uuid:=gen_random_uuid();
  customer_id uuid:=gen_random_uuid(); customer_auth uuid:=gen_random_uuid();
  driver_id uuid:=gen_random_uuid(); driver_auth uuid:=gen_random_uuid();
  outsider_id uuid:=gen_random_uuid(); outsider_auth uuid:=gen_random_uuid();
  vehicle_id uuid:=gen_random_uuid(); category_uuid uuid:=gen_random_uuid();
  category_id integer; booking_id uuid; token text; otp text; n integer; denied boolean;
  edited_category uuid; campaign_id uuid;
BEGIN
  INSERT INTO public.persona(id,auth_id,nombre,telefono,email) VALUES
    (admin_id,admin_auth,'Core admin',left(admin_id::text,20),'core.admin@fixture.invalid'),
    (customer_id,customer_auth,'Core customer',left(customer_id::text,20),'core.customer@fixture.invalid'),
    (driver_id,driver_auth,'Core driver',left(driver_id::text,20),'core.driver@fixture.invalid'),
    (outsider_id,outsider_auth,'Core outsider',left(outsider_id::text,20),'core.outsider@fixture.invalid');
  INSERT INTO public.persona_rol VALUES
    (admin_id,'admin',now()),(customer_id,'cliente',now()),
    (driver_id,'conductor',now()),(outsider_id,'cliente',now());
  INSERT INTO public.perfil_conductor(id_persona,aprobado,activo,en_servicio) VALUES(driver_id,true,true,true);
  INSERT INTO public.categoria_vehiculo(nombre,activo) VALUES('Core fixture',true) RETURNING id INTO category_id;
  INSERT INTO booking_v2.core_category_ids VALUES(category_uuid,category_id);
  INSERT INTO public.vehiculo(id,id_conductor,id_categoria,placa,linea,activo)
    VALUES(vehicle_id,driver_id,category_id,'CORE-TEST','Fixture',true);
  INSERT INTO public.membresia(id_conductor,estado,fecha_inicio,fecha_fin)
    VALUES(driver_id,'ACTIVA',current_date-1,current_date+1);
  IF EXISTS(SELECT 1 FROM public.users WHERE id IN (admin_id,customer_id,driver_id)) THEN
    RAISE EXCEPTION 'Fixtures must not rely on legacy users'; END IF;

  -- Exercise adapters without invoking the old system's unrelated automations.
  CREATE TEMP TABLE core_legacy_user_stub ON COMMIT DROP AS SELECT * FROM public.users WITH NO DATA;
  CREATE TRIGGER test_profile_bridge AFTER UPDATE ON core_legacy_user_stub
    FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_profile();
  GRANT SELECT,UPDATE ON core_legacy_user_stub TO authenticated;
  INSERT INTO core_legacy_user_stub(id,auth_id,user_type,first_name,mobile,approved,blocked,is_active,driver_active_status)
    VALUES(driver_id,driver_auth,'driver','Core driver',left(driver_id::text,20),true,false,true,true);
  UPDATE core_legacy_user_stub SET driver_active_status=false WHERE id=driver_id;
  IF EXISTS(SELECT 1 FROM public.perfil_conductor WHERE id_persona=driver_id AND en_servicio) THEN
    RAISE EXCEPTION 'Legacy availability was not synchronized'; END IF;
  UPDATE core_legacy_user_stub SET driver_active_status=true WHERE id=driver_id;
  CREATE TEMP TABLE core_legacy_car_stub ON COMMIT DROP AS SELECT * FROM public.cars WITH NO DATA;
  CREATE TRIGGER test_vehicle_bridge AFTER UPDATE ON core_legacy_car_stub
    FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_vehicle();
  INSERT INTO core_legacy_car_stub(id,driver_id,plate,model,color,service_type,is_active)
    VALUES(vehicle_id,driver_id,'CORE-TEST','Fixture','Red','Core fixture',true);
  UPDATE core_legacy_car_stub SET color='Blue' WHERE id=vehicle_id;
  IF NOT EXISTS(SELECT 1 FROM public.vehiculo WHERE id=vehicle_id AND color='Blue') THEN
    RAISE EXCEPTION 'Legacy vehicle update was not synchronized'; END IF;
  CREATE TEMP TABLE core_legacy_membership_stub ON COMMIT DROP AS SELECT * FROM public.memberships WITH NO DATA;
  CREATE TRIGGER test_membership_bridge AFTER INSERT OR UPDATE OR DELETE ON core_legacy_membership_stub
    FOR EACH ROW EXECUTE FUNCTION booking_v2.sync_migrated_membership();
  INSERT INTO core_legacy_membership_stub(uid,conductor,status,fecha_inicio,fecha_terminada)
    VALUES(gen_random_uuid(),driver_auth,'ACTIVA',current_date-1,current_date+1);
  UPDATE core_legacy_membership_stub SET status='CANCELADA';
  IF NOT EXISTS(SELECT 1 FROM public.membresia WHERE id_conductor=driver_id AND estado='CANCELADA') THEN
    RAISE EXCEPTION 'Legacy membership update was not synchronized'; END IF;

  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  SET LOCAL ROLE authenticated;
  IF NOT booking_v2.is_admin() OR public.get_perfil_dashboard()->>'id' <> admin_id::text THEN
    RAISE EXCEPTION 'Core admin identity/profile failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM booking_v2.core_users WHERE id=customer_id) THEN
    RAISE EXCEPTION 'Admin cannot search core customers'; END IF;
  INSERT INTO booking_v2.core_car_types(name,base_price) VALUES('Core editor fixture',1234)
    RETURNING id INTO edited_category;
  UPDATE booking_v2.core_car_types SET price_per_km=456 WHERE id=edited_category;
  IF NOT EXISTS(SELECT 1 FROM booking_v2.core_car_types WHERE id=edited_category AND price_per_km=456) THEN
    RAISE EXCEPTION 'Core category editor failed'; END IF;
  DELETE FROM booking_v2.core_car_types WHERE id=edited_category;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(booking_v2.list_assignable_drivers('Core driver')) d
    WHERE d->>'id'=driver_id::text) THEN RAISE EXCEPTION 'Core membership/vehicle lookup failed'; END IF;
  booking_id:=booking_v2.create_booking(
    p_idempotency_key=>'core-'||gen_random_uuid()::text,p_customer_id=>customer_id,
    p_requested_car_type_id=>category_uuid,p_booking_type=>'IMMEDIATE',p_scheduled_at=>NULL,
    p_request_expires_at=>now()+interval '10 minutes',p_pickup_address=>'Fixture pickup',
    p_pickup_lat=>4.6,p_pickup_lng=>-74.08,p_dropoff_address=>'Fixture destination',
    p_dropoff_lat=>4.65,p_dropoff_lng=>-74.1,p_waypoints=>'[]',p_observations=>'Core test',
    p_payment_mode=>'cash',p_estimated_distance_m=>8500,p_estimated_duration_s=>1200,
    p_estimated_fare=>20000,p_tariff_snapshot=>'{}');
  PERFORM booking_v2.assign_booking(booking_id,driver_id,vehicle_id,admin_id);
  PERFORM booking_v2.transition_booking_status(booking_id,'PENDING','ACCEPTED',admin_id,'ADMIN');
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub',customer_auth::text,true);
  SET LOCAL ROLE authenticated;
  otp:=booking_v2.deliver_pickup_code(booking_id)->>'code';
  IF otp IS NULL THEN RAISE EXCEPTION 'Customer OTP delivery failed'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',driver_auth::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN UPDATE core_legacy_user_stub SET approved=false WHERE id=driver_id;
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Driver can change migrated approval through legacy adapter'; END IF;
  IF booking_v2.visible_pickup_code(booking_id) IS NOT NULL THEN RAISE EXCEPTION 'Driver sees customer OTP'; END IF;
  PERFORM booking_v2.record_vehicle_position(4.61,-74.08,5,now(),booking_id);
  PERFORM booking_v2.transition_booking_status(booking_id,'ACCEPTED','ARRIVED_PICKUP',driver_id,'APP');
  IF NOT booking_v2.verify_pickup_code(booking_id,otp) THEN RAISE EXCEPTION 'OTP verification failed'; END IF;
  PERFORM booking_v2.transition_booking_status(booking_id,'ARRIVED_PICKUP','STARTED',driver_id,'APP');
  PERFORM booking_v2.record_vehicle_position(4.62,-74.08,5,now()+interval '1 second',booking_id);
  -- Fake token stays within this rollback transaction; no sender/Edge Function invoked.
  token:='ExpoPushToken[CORE_TEST_'||replace(driver_id::text,'-','')||']';
  PERFORM booking_v2.register_push_device(token,'ANDROID');
  PERFORM booking_v2.register_push_device(replace(token,'CORE_TEST_','CORE_IOS_'),'IOS');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  SET LOCAL ROLE authenticated;
  IF NOT EXISTS(SELECT 1 FROM booking_v2.list_vehicle_locations('CORETEST') WHERE booking_status='STARTED') THEN
    RAISE EXCEPTION 'Core plate map/STARTED location failed'; END IF;
  campaign_id:=booking_v2.create_push_campaign(gen_random_uuid(),'Core fixture','Not sent','driver','ANDROID');
  IF NOT EXISTS(SELECT 1 FROM booking_v2.push_campaigns WHERE id=campaign_id AND recipients>=1) THEN
    RAISE EXCEPTION 'Android core campaign has no recipient'; END IF;
  campaign_id:=booking_v2.create_push_campaign(gen_random_uuid(),'Core fixture','Not sent','driver','IOS');
  IF NOT EXISTS(SELECT 1 FROM booking_v2.push_campaigns WHERE id=campaign_id AND recipients>=1) THEN
    RAISE EXCEPTION 'iOS core campaign has no recipient'; END IF;
  RESET ROLE;

  PERFORM set_config('request.jwt.claim.sub',outsider_auth::text,true);
  SET LOCAL ROLE authenticated;
  IF EXISTS(SELECT 1 FROM booking_v2.bookings WHERE id=booking_id) OR
    EXISTS(SELECT 1 FROM booking_v2.list_vehicle_locations('CORETEST')) THEN
    RAISE EXCEPTION 'Unrelated customer can read a booking/location'; END IF;
  denied:=false;
  BEGIN PERFORM booking_v2.create_push_campaign(gen_random_uuid(),'Forbidden','Forbidden','driver','ALL');
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Customer can create a mass campaign'; END IF;
  denied:=false;
  BEGIN INSERT INTO booking_v2.core_car_types(name) VALUES('Forbidden');
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Customer can edit categories'; END IF;
  RESET ROLE;
  UPDATE public.persona SET bloqueado=true WHERE id=admin_id;
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  SET LOCAL ROLE authenticated;
  IF booking_v2.is_admin() THEN RAISE EXCEPTION 'Blocked core admin still authorized'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  denied:=false;
  BEGIN PERFORM public.get_perfil_dashboard(); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous can execute core dashboard RPC'; END IF;
  RESET ROLE;
END $test$;
