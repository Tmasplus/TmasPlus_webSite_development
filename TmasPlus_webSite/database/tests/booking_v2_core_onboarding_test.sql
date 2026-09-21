-- Real legacy tables and triggers, including Auth identity FK; always rolled back
-- by the runner. No email, push delivery or external Auth API is called.
DO $test$
DECLARE
  admin_id uuid:=gen_random_uuid(); admin_auth uuid:=gen_random_uuid();
  driver_auth uuid:=gen_random_uuid(); customer_auth uuid:=gen_random_uuid();
  company_auth uuid:=gen_random_uuid(); failed_auth uuid:=gen_random_uuid(); self_auth uuid:=gen_random_uuid();
  category_id integer; category_uuid uuid:=gen_random_uuid();
  v_driver_id uuid; v_customer_id uuid; v_vehicle_id uuid; v_company_id uuid; v_booking_id uuid;
  result jsonb; payload jsonb; denied boolean; v_plate text:='ONB'||left(replace(gen_random_uuid()::text,'-',''),12);
BEGIN
  INSERT INTO public.persona(id,auth_id,nombre,telefono,email)
    VALUES(admin_id,admin_auth,'Onboarding admin',left(admin_id::text,18),admin_id||'@fixture.invalid');
  INSERT INTO public.persona_rol(id_persona,rol) VALUES(admin_id,'admin');
  INSERT INTO auth.users(id,email) VALUES
    (driver_auth,driver_auth||'@fixture.invalid'),(customer_auth,customer_auth||'@fixture.invalid'),
    (company_auth,company_auth||'@fixture.invalid'),(failed_auth,failed_auth||'@fixture.invalid'),
    (self_auth,self_auth||'@fixture.invalid');
  INSERT INTO public.categoria_vehiculo(nombre,activo) VALUES('Onboarding fixture',true) RETURNING id INTO category_id;
  INSERT INTO booking_v2.core_category_ids VALUES(category_uuid,category_id);
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  SET LOCAL ROLE authenticated;
  payload:=jsonb_build_object('user_type','driver','email',driver_auth||'@fixture.invalid','first_name','Nuevo',
    'last_name','Conductor','mobile',left(driver_auth::text,18),'make','Test brand','model','Test model',
    'plate',lower(v_plate),'vehicle_type',category_uuid::text);
  result:=booking_v2.admin_create_profile(driver_auth,payload);
  v_driver_id:=(result->'user'->>'id')::uuid; v_vehicle_id:=(result->'car'->>'id')::uuid;
  IF result->'user'->>'approved'<>'false' OR result->'user'->>'blocked'<>'true' THEN
    RAISE EXCEPTION 'New driver must be pending and blocked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM booking_v2.core_cars WHERE id=v_vehicle_id AND driver_id=v_driver_id AND plate=upper(v_plate)) THEN
    RAISE EXCEPTION 'New vehicle missing from core'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(booking_v2.list_assignable_drivers('Nuevo')) x WHERE x->>'id'=v_driver_id::text) THEN
    RAISE EXCEPTION 'Pending driver is assignable'; END IF;
  result:=booking_v2.admin_create_profile(customer_auth,jsonb_build_object('user_type','customer',
    'email',customer_auth||'@fixture.invalid','first_name','Nuevo','last_name','Cliente','mobile',left(customer_auth::text,18)));
  v_customer_id:=(result->'user'->>'id')::uuid;
  result:=booking_v2.admin_create_profile(company_auth,jsonb_build_object('user_type','company',
    'email',company_auth||'@fixture.invalid','first_name','Nueva','last_name','Empresa','mobile',left(company_auth::text,18),'company_name','Empresa de prueba'));
  v_company_id:=(result->'user'->>'id')::uuid;
  -- Failed vehicle must roll back both legacy and core profile inserts.
  denied:=false;
  BEGIN
    PERFORM booking_v2.admin_create_profile(failed_auth,payload||jsonb_build_object('email',failed_auth||'@fixture.invalid',
      'mobile',left(failed_auth::text,18),'plate',v_plate||'F','vehicle_type','missing-category'));
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied OR EXISTS(SELECT 1 FROM booking_v2.core_users WHERE auth_id=failed_auth)
    OR EXISTS(SELECT 1 FROM public.users WHERE auth_id=failed_auth) THEN RAISE EXCEPTION 'Failed onboarding left a partial profile'; END IF;
  -- Retry using a formatted duplicate of the registered v_plate.
  denied:=false;
  BEGIN
    PERFORM booking_v2.admin_create_profile(failed_auth,payload||jsonb_build_object('email',failed_auth||'@fixture.invalid',
      'mobile',left(failed_auth::text,18),'plate',left(v_plate,3)||'-'||substr(v_plate,4)));
  EXCEPTION WHEN unique_violation THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Formatted duplicate v_plate accepted'; END IF;
  denied:=false;
  BEGIN PERFORM booking_v2.admin_create_profile(driver_auth,payload);
  EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Duplicate Auth identity accepted'; END IF;
  -- Approval is performed by the actual modal command and its real triggers.
  PERFORM booking_v2.admin_update_profile(v_driver_id,'{"approved":true,"blocked":false}',
    jsonb_build_object('id',v_vehicle_id,'color','Blue'));
  PERFORM booking_v2.admin_update_profile(v_customer_id,'{"approved":true,"blocked":false}');
  IF NOT EXISTS(SELECT 1 FROM booking_v2.core_users WHERE id=v_driver_id AND approved AND NOT blocked) THEN
    RAISE EXCEPTION 'Approval did not reach canonical profile'; END IF;
  RESET ROLE;
  IF NOT EXISTS(SELECT 1 FROM public.perfil_empresa WHERE id_persona=v_company_id AND razon_social='Empresa de prueba') THEN
    RAISE EXCEPTION 'Company profile missing'; END IF;
  INSERT INTO public.memberships(uid,conductor,status,fecha_inicio,fecha_terminada)
    VALUES(gen_random_uuid(),driver_auth,'ACTIVA',current_date-1,current_date+1);
  UPDATE public.users SET driver_active_status=true WHERE id=v_driver_id;
  SET LOCAL ROLE authenticated;
  v_booking_id:=booking_v2.create_booking(
    p_idempotency_key=>'onboarding-'||gen_random_uuid()::text,p_customer_id=>v_customer_id,
    p_requested_car_type_id=>category_uuid,p_booking_type=>'IMMEDIATE',p_scheduled_at=>NULL,
    p_request_expires_at=>now()+interval '10 minutes',p_pickup_address=>'Fixture pickup',
    p_pickup_lat=>4.6,p_pickup_lng=>-74.08,p_dropoff_address=>'Fixture destination',
    p_dropoff_lat=>4.65,p_dropoff_lng=>-74.1,p_waypoints=>'[]',p_observations=>'Onboarding test',
    p_payment_mode=>'cash',p_estimated_distance_m=>8500,p_estimated_duration_s=>1200,
    p_estimated_fare=>20000,p_tariff_snapshot=>'{}');
  PERFORM booking_v2.assign_booking(v_booking_id,v_driver_id,v_vehicle_id,admin_id);
  PERFORM booking_v2.transition_booking_status(v_booking_id,'PENDING','ACCEPTED',admin_id,'ADMIN');
  -- Real direct vehicle editor route, not just combined onboarding.
  INSERT INTO public.cars(driver_id,make,model,plate,service_type)
    VALUES(v_driver_id,'Test brand','Second vehicle',v_plate||'2',category_uuid::text);
  IF NOT EXISTS(SELECT 1 FROM booking_v2.core_cars WHERE plate=upper(v_plate)||'2') THEN
    RAISE EXCEPTION 'Separate new vehicle did not synchronize'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',driver_auth::text,true);
  SET LOCAL ROLE authenticated;
  PERFORM booking_v2.record_vehicle_position(4.61,-74.08,5,now(),v_booking_id);
  denied:=false;
  BEGIN PERFORM booking_v2.admin_update_profile(v_customer_id,'{"approved":true}');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin can approve profiles'; END IF;
  denied:=false;
  BEGIN PERFORM booking_v2.admin_create_profile(failed_auth,payload);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Non-admin can use dashboard onboarding'; END IF;
  RESET ROLE;
  -- Verified public signup resumes safely and idempotently, without Auth hooks.
  UPDATE auth.users SET email_confirmed_at=now(),raw_user_meta_data=jsonb_build_object(
    'user_type','driver','first_name','Verified','last_name','Signup','mobile',left(failed_auth::text,18),
    'approved',true,'blocked',false) WHERE id=failed_auth;
  PERFORM set_config('request.jwt.claim.sub',failed_auth::text,true);
  SET LOCAL ROLE authenticated;
  result:=booking_v2.ensure_driver_profile();
  IF result->>'approved'<>'false' OR result->>'blocked'<>'true' OR
    booking_v2.ensure_driver_profile()->>'id' IS DISTINCT FROM result->>'id' THEN
    RAISE EXCEPTION 'Verified signup was not safely idempotent'; END IF;
  INSERT INTO public.cars(driver_id,make,model,plate,service_type)
    VALUES((result->>'id')::uuid,'Test brand','Pending signup',v_plate||'S',category_uuid::text);
  RESET ROLE;
  -- Unverified account cannot use the signup-resume command.
  PERFORM set_config('request.jwt.claim.sub',self_auth::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN PERFORM booking_v2.ensure_driver_profile(); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Unverified signup accepted'; END IF;
  RESET ROLE;
  -- Existing self-insert policy must not bypass approval through legacy defaults.
  PERFORM set_config('request.jwt.claim.sub',self_auth::text,true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.users(auth_id,email,first_name,last_name,mobile,user_type,approved,blocked)
    VALUES(self_auth,self_auth||'@fixture.invalid','Self','Driver',left(self_auth::text,18),'driver',true,false);
  IF EXISTS(SELECT 1 FROM public.users WHERE auth_id=self_auth AND (approved OR NOT blocked)) THEN
    RAISE EXCEPTION 'Self-registration elevated approval'; END IF;
  RESET ROLE;
  UPDATE public.persona SET bloqueado=true WHERE id=admin_id;
  PERFORM set_config('request.jwt.claim.sub',admin_auth::text,true);
  SET LOCAL ROLE authenticated;
  denied:=false;
  BEGIN PERFORM booking_v2.admin_update_profile(v_driver_id,'{"blocked":false}');
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Blocked admin can change profiles'; END IF;
  RESET ROLE;
  SET LOCAL ROLE anon;
  denied:=false;
  BEGIN PERFORM booking_v2.admin_create_profile(failed_auth,payload);
  EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'Anonymous onboarding allowed'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub','',true);
END $test$;
