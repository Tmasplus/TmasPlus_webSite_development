-- Executed inside the foundation runner's transaction; never standalone.
DO $test$
DECLARE n integer;
BEGIN
  IF to_regclass('public.persona') IS NULL OR to_regclass('booking_v2.bookings') IS NULL THEN
    RAISE EXCEPTION 'Missing core or booking_v2 foundation';
  END IF;
  SELECT count(*) INTO n FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace
  WHERE s.nspname='public' AND p.proname IN (
    'core_check_email_exists','core_get_active_booking_by_plate','core_get_auth_profile',
    'core_get_my_memberships','core_get_service_timeline');
  IF n <> 5 THEN RAISE EXCEPTION 'Expected five namespaced compatibility routines'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_temp.core_original_routines old
    LEFT JOIN pg_proc p ON p.oid=old.oid
    WHERE p.oid IS NULL OR md5(pg_get_functiondef(p.oid))<>old.hash
  ) THEN RAISE EXCEPTION 'Existing routine was changed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM booking_v2.test_patch_receipts WHERE name='core/005_core_booking_reads.sql') AND EXISTS (
    SELECT 1 FROM pg_class t JOIN pg_namespace s ON s.oid=t.relnamespace
    WHERE s.nspname='public' AND t.relname IN ('persona','vehiculo','reserva','categoria_vehiculo')
      AND (NOT t.relrowsecurity OR has_table_privilege('anon',t.oid,'SELECT')
        OR has_table_privilege('authenticated',t.oid,'INSERT'))
  ) THEN RAISE EXCEPTION 'Core tables must remain closed in foundation stage'; END IF;
  IF has_function_privilege('anon','public.core_get_active_booking_by_plate(text)','EXECUTE')
    OR has_function_privilege('authenticated','public.core_get_active_booking_by_plate(text)','EXECUTE')
  THEN RAISE EXCEPTION 'Unreviewed core location RPC must not be callable'; END IF;
  IF EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace s ON s.oid=c.relnamespace
    WHERE s.nspname='public' AND c.relname='reserva' AND NOT t.tgisinternal AND t.tgenabled<>'D'
  ) THEN RAISE EXCEPTION 'Core reservation automations must remain disabled'; END IF;
END $test$;
