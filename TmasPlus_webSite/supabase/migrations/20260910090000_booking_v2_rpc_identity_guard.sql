-- Preserve the original creation implementation behind a non-public wrapper.
alter function booking_v2.create_booking(varchar,uuid,uuid,booking_v2.booking_type,timestamptz,timestamptz,
  text,numeric,numeric,text,numeric,numeric,jsonb,text,varchar,integer,integer,numeric,jsonb)
rename to create_booking_internal;
revoke all on function booking_v2.create_booking_internal(varchar,uuid,uuid,booking_v2.booking_type,timestamptz,timestamptz,
  text,numeric,numeric,text,numeric,numeric,jsonb,text,varchar,integer,integer,numeric,jsonb) from public,anon,authenticated,service_role;

create function booking_v2.create_booking(
  p_idempotency_key varchar,p_customer_id uuid,p_requested_car_type_id uuid,p_booking_type booking_v2.booking_type,
  p_scheduled_at timestamptz,p_request_expires_at timestamptz,p_pickup_address text,p_pickup_lat numeric,p_pickup_lng numeric,
  p_dropoff_address text,p_dropoff_lat numeric,p_dropoff_lng numeric,p_waypoints jsonb,p_observations text,p_payment_mode varchar,
  p_estimated_distance_m integer,p_estimated_duration_s integer,p_estimated_fare numeric,p_tariff_snapshot jsonb
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
begin
  if auth.uid() is not null and not exists(select 1 from public.users
    where id=booking_v2.current_app_user_id() and blocked is not true) then
    raise exception 'Perfil habilitado requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key,0));
  if exists(select 1 from booking_v2.bookings where idempotency_key=p_idempotency_key and customer_id is distinct from p_customer_id) then
    raise exception 'La clave de idempotencia pertenece a otra solicitud'; end if;
  return booking_v2.create_booking_internal(p_idempotency_key,p_customer_id,p_requested_car_type_id,p_booking_type,
    p_scheduled_at,p_request_expires_at,p_pickup_address,p_pickup_lat,p_pickup_lng,p_dropoff_address,p_dropoff_lat,p_dropoff_lng,
    p_waypoints,p_observations,p_payment_mode,p_estimated_distance_m,p_estimated_duration_s,p_estimated_fare,p_tariff_snapshot);
end $$;
revoke all on function booking_v2.create_booking(varchar,uuid,uuid,booking_v2.booking_type,timestamptz,timestamptz,
  text,numeric,numeric,text,numeric,numeric,jsonb,text,varchar,integer,integer,numeric,jsonb) from public;
grant execute on function booking_v2.create_booking(varchar,uuid,uuid,booking_v2.booking_type,timestamptz,timestamptz,
  text,numeric,numeric,text,numeric,numeric,jsonb,text,varchar,integer,integer,numeric,jsonb) to authenticated,service_role;

create function booking_v2.guard_assignment_identity() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare actor uuid:=booking_v2.current_app_user_id();
begin
  if auth.uid() is not null then
    if actor is null or not exists(select 1 from public.users where id=actor and blocked is not true)
      or (not booking_v2.is_admin() and actor<>new.driver_id) then raise exception 'Asignación no autorizada'; end if;
    if new.assigned_by_user_id is distinct from actor then raise exception 'Autor de asignación inválido'; end if;
    if not exists(select 1 from booking_v2.bookings b join public.car_types ct on ct.id=b.requested_car_type_id
      join public.cars c on c.id=new.vehicle_id where b.id=new.booking_id
      and (b.request_expires_at is null or b.request_expires_at>now())
      and booking_v2.category_matches(ct.id,c.service_type)) then
      raise exception 'Reserva vencida o vehículo de categoría incompatible'; end if;
  end if;
  return new;
end $$;
revoke all on function booking_v2.guard_assignment_identity() from public;
create trigger guard_assignment_identity before insert on booking_v2.booking_assignments
for each row execute function booking_v2.guard_assignment_identity();
