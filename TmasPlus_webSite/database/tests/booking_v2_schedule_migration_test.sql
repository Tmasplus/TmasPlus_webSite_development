-- Test project only. Synthetic fixtures; no changes survive ROLLBACK.
begin;
do $$
declare
  customer_id uuid := gen_random_uuid();
  category_id uuid := gen_random_uuid();
  scheduled_id uuid := gen_random_uuid();
  immediate_id uuid := gen_random_uuid();
  imported_id uuid;
  schedule_time timestamptz := now() + interval '3 days';
  expiration_time timestamptz := now() + interval '5 minutes';
  before_import jsonb;
  after_import jsonb;
begin
  insert into public.users(id, email, first_name, last_name, user_type)
  values(customer_id, customer_id::text || '@example.invalid', 'Schedule', 'Test', 'customer');
  insert into public.car_types(id, name, base_price, price_per_km, is_active)
  values(category_id, 'Test-' || category_id::text, 10000, 500, true);
  insert into public.bookings(id, customer_id, car_type_id, pickup_location,
    destination_location, price, booking_type, booking_date, request_expires_at, status)
  values
    (scheduled_id, customer_id, category_id, '{"address":"Test pickup"}',
      '{"address":"Test dropoff"}', 15000, 'reservation', schedule_time, null, 'PENDING'),
    (immediate_id, customer_id, category_id, '{"address":"Test pickup"}',
      '{"address":"Test dropoff"}', 15000, 'immediate', now(), expiration_time, 'NEW');

  select to_jsonb(b) into before_import from public.bookings b where id=scheduled_id;
  imported_id := booking_v2.migrate_legacy_booking(scheduled_id);
  if not exists (select 1 from booking_v2.bookings where id=imported_id
     and booking_type='SCHEDULED' and scheduled_at=schedule_time and legacy_booking_id=scheduled_id) then
    raise exception 'Scheduled booking lost its type or scheduled date';
  end if;
  if booking_v2.migrate_legacy_booking(scheduled_id) <> imported_id then
    raise exception 'Migration is not idempotent';
  end if;
  select to_jsonb(b) into after_import from public.bookings b where id=scheduled_id;
  if before_import is distinct from after_import then
    raise exception 'Legacy booking was modified';
  end if;

  imported_id := booking_v2.migrate_legacy_booking(immediate_id);
  if not exists (select 1 from booking_v2.bookings where id=imported_id
     and booking_type='IMMEDIATE' and scheduled_at is null and request_expires_at=expiration_time) then
    raise exception 'Immediate booking lost its expiration or acquired a schedule';
  end if;
  raise notice 'BOOKING_V2_SCHEDULE_MIGRATION_OK';
end;
$$;
rollback;
