-- Pickup codes are issued BEFORE STARTED. Plaintext is returned only to the
-- customer/admin once; the database stores a salted hash. Driver verifies by RPC.
create or replace function booking_v2.is_admin()
returns boolean language sql stable security definer
set search_path = pg_catalog, public as $$
  select exists (select 1 from public.users where auth_id = auth.uid()
    and user_type = 'admin' and approved is true and blocked is not true);
$$;

create or replace function booking_v2.issue_pickup_code(p_booking_id uuid)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, booking_v2, extensions as $$
declare
  b booking_v2.bookings%rowtype;
  actor uuid := booking_v2.current_app_user_id();
  code text;
  expiration timestamptz := clock_timestamp() + interval '24 hours';
begin
  if actor is null or not exists (select 1 from public.users where id=actor and blocked is not true) then
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
$$;

create or replace function booking_v2.verify_pickup_code(p_booking_id uuid, p_code text)
returns boolean language plpgsql security definer
set search_path = pg_catalog, public, booking_v2, extensions as $$
declare
  b booking_v2.bookings%rowtype;
  c booking_v2.booking_access_codes%rowtype;
  actor uuid := booking_v2.current_app_user_id();
begin
  if actor is null or not exists (select 1 from public.users where id=actor
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
$$;

create or replace function booking_v2.require_verified_pickup()
returns trigger language plpgsql security definer set search_path=pg_catalog,booking_v2 as $$
begin
  if new.status='STARTED' and old.status is distinct from new.status and not exists (
    select 1 from booking_v2.booking_access_codes where booking_id=new.id and verified_at is not null
      and invalidated_at is null
  ) then raise exception 'Debe verificar el código antes de iniciar el viaje'; end if;
  return new;
end;
$$;
drop trigger if exists trg_require_verified_pickup on booking_v2.bookings;
create trigger trg_require_verified_pickup before update of status on booking_v2.bookings
  for each row execute function booking_v2.require_verified_pickup();

revoke all on function booking_v2.issue_pickup_code(uuid) from public;
revoke all on function booking_v2.verify_pickup_code(uuid,text) from public;
revoke all on function booking_v2.require_verified_pickup() from public;
grant execute on function booking_v2.issue_pickup_code(uuid) to authenticated;
grant execute on function booking_v2.verify_pickup_code(uuid,text) to authenticated;
-- Retire the old arbitrary-hash endpoint from application roles.
revoke execute on function booking_v2.issue_access_code(uuid,text,timestamptz) from authenticated, service_role;
revoke select on booking_v2.booking_access_codes from authenticated;
