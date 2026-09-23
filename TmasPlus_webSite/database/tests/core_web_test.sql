-- Synthetic fixtures only, executed by scripts/test-core-web.mjs on loopback.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000001','admin@fixture.invalid',now(),'{}'),
 ('00000000-0000-4000-8000-000000000002','driver@fixture.invalid',now(),'{"user_type":"driver","first_name":"Driver","last_name":"Test","mobile":"fixture-driver"}'),
 ('00000000-0000-4000-8000-000000000003','client@fixture.invalid',now(),'{}');
INSERT INTO public.persona(id,auth_id,telefono,email) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','fixture-admin','admin@fixture.invalid');
INSERT INTO public.persona_rol(id_persona,rol) VALUES('10000000-0000-4000-8000-000000000001','admin');
INSERT INTO public.categoria_vehiculo(id,nombre) VALUES(101,'Test Particular');
INSERT INTO public.marca_vehiculo(nombre) VALUES('Test Brand');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT public.web_ensure_driver_profile();
DO $$ DECLARE uid uuid; BEGIN
 SELECT id INTO uid FROM public.web_users WHERE auth_id=auth.uid();
 IF NOT EXISTS(SELECT 1 FROM public.web_users WHERE id=uid AND NOT approved AND blocked) THEN RAISE EXCEPTION 'unsafe signup defaults'; END IF;
 BEGIN
  UPDATE public.web_users SET approved=true WHERE id=uid;
  RAISE EXCEPTION 'self approval allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.web_require_admin(); RAISE EXCEPTION 'nonadmin allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.web_users SET verify_id_image='fixture/id-front.pdf' WHERE id=uid;
 INSERT INTO storage.objects(bucket_id,name) VALUES('driver-documents',uid::text||'/fixture.pdf');
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES('driver-documents','other-profile/fixture.pdf');
  RAISE EXCEPTION 'storage allowed another owner';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.documento_persona WHERE id_persona=uid AND tipo='identidad') THEN RAISE EXCEPTION 'document missing'; END IF;
 INSERT INTO public.web_cars(driver_id,make,model,plate,service_type) VALUES(uid,'Test Brand','Test','TEST101','101');
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
SELECT public.web_admin_create_profile('00000000-0000-4000-8000-000000000003',
 '{"user_type":"customer","first_name":"Client","last_name":"Test","email":"client@fixture.invalid","mobile":"fixture-client"}');
DO $$ <<scenario>> DECLARE driver uuid; client uuid; bid uuid; row_id uuid; BEGIN
 SELECT id INTO driver FROM public.web_users WHERE email='driver@fixture.invalid';
 SELECT id INTO client FROM public.web_users WHERE email='client@fixture.invalid';
 PERFORM public.web_admin_update_profile(driver,'{"approved":true,"blocked":false}');
 IF (SELECT count(*) FROM public.web_assignable_drivers(''))<>1 THEN RAISE EXCEPTION 'driver missing'; END IF;
 -- Source reference trigger intentionally absent: fixture supplies a default.
 bid:=public.web_create_booking(jsonb_build_object('customer_id',client,'car_type_id','101','booking_type','immediate',
  'pickup',jsonb_build_object('address','A','lat',4.6,'lng',-74), 'destination',jsonb_build_object('address','B','lat',4.7,'lng',-74),
  'distance_km',1,'duration_min',2,'total_cost',100,'estimate',100,'convenience_fees',15,'discount',5,'payment_mode','cash'));
 IF NOT EXISTS(SELECT 1 FROM public.reserva WHERE id=bid AND costo_total=100 AND costo_viaje=90)
 THEN RAISE EXCEPTION 'core cost trigger changed final charge'; END IF;
 PERFORM public.web_assign_booking(bid,driver);
 IF (SELECT estado FROM public.reserva WHERE id=bid)<>'ACCEPTED' THEN RAISE EXCEPTION 'assignment failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.web_assignable_drivers('')) THEN RAISE EXCEPTION 'busy driver offered'; END IF;
 PERFORM public.web_cancel_booking(bid,'Test');
 IF (SELECT costo_total FROM public.reserva WHERE id=bid)<>100 THEN RAISE EXCEPTION 'cost changed on update'; END IF;
 IF (SELECT estado FROM public.reserva WHERE id=bid)<>'CANCELLED' THEN RAISE EXCEPTION 'cancel failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.web_bookings WHERE id=bid AND cancelled_at IS NOT NULL) THEN RAISE EXCEPTION 'booking projection missing'; END IF;
 IF (SELECT ocupado FROM public.perfil_conductor WHERE id_persona=driver) THEN RAISE EXCEPTION 'driver still busy'; END IF;
 INSERT INTO public.web_memberships(conductor,status,costo,fecha_inicio,fecha_terminada,periodo)
 VALUES(driver,'ACTIVA',100,current_date,current_date+30,30);
 IF NOT EXISTS(SELECT 1 FROM public.membresia WHERE id_conductor=driver AND estado='ACTIVA') THEN RAISE EXCEPTION 'membership identity wrong'; END IF;
 INSERT INTO public.web_referral_codes(driver_id,referral_code,is_active) VALUES(driver,'FIXTURE',true);
 INSERT INTO public.web_referrals(referral_code_id,referrer_id,referred_driver_id,referral_code)
 SELECT id,scenario.driver,scenario.driver,'FIXTURE' FROM public.web_referral_codes WHERE referral_code='FIXTURE';
 IF (SELECT total_referrals FROM public.web_referral_codes WHERE referral_code='FIXTURE')<>1 THEN RAISE EXCEPTION 'referral count wrong'; END IF;
 IF (SELECT rc.driver->>'id' FROM public.web_referral_codes rc WHERE referral_code='FIXTURE')<>driver::text THEN RAISE EXCEPTION 'referral join missing'; END IF;
 INSERT INTO public.web_complaints(user_id,subject,body) VALUES(client,'Test complaint','Synthetic');
 UPDATE public.web_complaints SET admin_response='Test response',status='resolved' WHERE user_id=client;
 IF NOT EXISTS(SELECT 1 FROM public.queja WHERE id_reportante=client AND respuesta_admin='Test response') THEN RAISE EXCEPTION 'complaint write missing'; END IF;
 INSERT INTO public.dispositivo_push(id_persona,push_token,plataforma) VALUES(driver,'ExpoPushToken[fixture]','android');
 IF public.web_send_mass_push('30000000-0000-4000-8000-000000000001','Test','No real push','driver','ANDROID')<>1 THEN RAISE EXCEPTION 'push missing'; END IF;
 PERFORM public.web_send_mass_push('30000000-0000-4000-8000-000000000001','Test','No real push','driver','ANDROID');
 IF (SELECT count(*) FROM public.evento_notificacion WHERE tipo_evento='web:30000000-0000-4000-8000-000000000001')<>1 THEN RAISE EXCEPTION 'duplicate push'; END IF;
END $$;
ROLLBACK;
