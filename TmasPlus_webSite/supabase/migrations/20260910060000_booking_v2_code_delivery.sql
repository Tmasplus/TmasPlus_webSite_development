-- Allow customer/admin to recover their pickup code after reopening the app.
-- Verification still uses the salted hash; delivery text is encrypted server-side.
create table booking_v2.code_delivery_key(singleton boolean primary key check(singleton), secret text not null);
insert into booking_v2.code_delivery_key values(true,encode(extensions.gen_random_bytes(32),'hex'));
create table booking_v2.code_delivery(booking_id uuid primary key references booking_v2.bookings(id) on delete cascade, ciphertext bytea not null);
alter table booking_v2.code_delivery_key enable row level security;
alter table booking_v2.code_delivery enable row level security;
revoke all on booking_v2.code_delivery_key,booking_v2.code_delivery from public,anon,authenticated;

create function booking_v2.deliver_pickup_code(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,booking_v2,extensions as $$
declare
  actor uuid := booking_v2.current_app_user_id();
  b booking_v2.bookings%rowtype;
  answer jsonb;
  ciphertext bytea;
begin
  select * into strict b from booking_v2.bookings where id=p_booking_id for update;
  if actor is null or not exists(select 1 from public.users where id=actor and blocked is not true)
     or (actor<>b.customer_id and not booking_v2.is_admin()) then
    raise exception 'Solo el cliente o un administrador puede obtener el código';
  end if;
  select d.ciphertext into ciphertext from booking_v2.code_delivery d where booking_id=b.id;
  if ciphertext is not null and exists(select 1 from booking_v2.booking_access_codes
      where booking_id=b.id and invalidated_at is null and expires_at>clock_timestamp()) then
    return jsonb_build_object('code',extensions.pgp_sym_decrypt(ciphertext,(select secret from booking_v2.code_delivery_key)),
      'verified',exists(select 1 from booking_v2.booking_access_codes where booking_id=b.id and verified_at is not null and invalidated_at is null));
  end if;
  answer := booking_v2.issue_pickup_code(b.id);
  insert into booking_v2.code_delivery values(b.id,extensions.pgp_sym_encrypt(answer->>'code',(select secret from booking_v2.code_delivery_key)))
    on conflict(booking_id) do update set ciphertext=excluded.ciphertext;
  return answer || '{"verified":false}'::jsonb;
end;
$$;
revoke all on function booking_v2.deliver_pickup_code(uuid) from public;
grant execute on function booking_v2.deliver_pickup_code(uuid) to authenticated;
revoke execute on function booking_v2.issue_pickup_code(uuid) from authenticated;

create function booking_v2.visible_pickup_code(p_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public,booking_v2,extensions as $$
  select extensions.pgp_sym_decrypt(d.ciphertext,k.secret)
  from booking_v2.code_delivery d cross join booking_v2.code_delivery_key k
  join booking_v2.bookings b on b.id=p_id
  where d.booking_id=b.id and (b.customer_id=booking_v2.current_app_user_id() or booking_v2.is_admin())
    and exists(select 1 from public.users u where u.auth_id=auth.uid() and u.blocked is not true)
    and exists(select 1 from booking_v2.booking_access_codes c where c.booking_id=b.id
      and c.invalidated_at is null and c.expires_at>now());
$$;
revoke all on function booking_v2.visible_pickup_code(uuid) from public;
grant execute on function booking_v2.visible_pickup_code(uuid) to authenticated;
create or replace view public.bookings_v2_mobile with (security_barrier=true) as
select (jsonb_populate_record(null::booking_v2.mobile_bookings,to_jsonb(p) ||
  jsonb_build_object('otp',booking_v2.visible_pickup_code(p.id)))).*
from booking_v2.mobile_bookings p where booking_v2.can_access_booking(p.id);
-- Direct web RPC creation gets the same OTP as inserts through the mobile view.
create function booking_v2.deliver_created_booking_code() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
begin
  if auth.uid() is not null then perform booking_v2.deliver_pickup_code(new.id); end if;
  return new;
end $$;
revoke all on function booking_v2.deliver_created_booking_code() from public;
create trigger deliver_created_code after insert on booking_v2.bookings
for each row execute function booking_v2.deliver_created_booking_code();
