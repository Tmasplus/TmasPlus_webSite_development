-- Driver identity comes from Auth; customers cannot publish someone else's GPS.
create table booking_v2.vehicle_positions (
  driver_id uuid primary key references public.users(id),
  vehicle_id uuid not null references public.cars(id),
  booking_id uuid references booking_v2.bookings(id) on delete set null,
  lat double precision not null check(lat between -90 and 90),
  lng double precision not null check(lng between -180 and 180),
  accuracy double precision check(accuracy>=0),
  recorded_at timestamptz not null
);
alter table booking_v2.vehicle_positions enable row level security;
revoke all on booking_v2.vehicle_positions from anon,authenticated;

create function booking_v2.record_vehicle_position(p_lat double precision,p_lng double precision,
  p_accuracy double precision default null,p_recorded_at timestamptz default now(),p_booking_id uuid default null)
returns void language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare actor uuid:=booking_v2.current_app_user_id(); vehicle uuid; trip uuid;
begin
  if not exists(select 1 from public.users where id=actor and user_type='driver' and approved is true and blocked is not true) then
    raise exception 'Conductor habilitado requerido'; end if;
  if p_lat is null or p_lng is null or not(p_lat between -90 and 90) or not(p_lng between -180 and 180)
    or p_recorded_at is null or p_recorded_at>now()+interval '30 seconds' or p_recorded_at<now()-interval '10 minutes'
    or (p_accuracy is not null and not(p_accuracy between 0 and 10000)) then raise exception 'Posición inválida o vencida'; end if;
  select a.vehicle_id,b.id into vehicle,trip from booking_v2.booking_assignments a join booking_v2.bookings b on b.id=a.booking_id
    where a.driver_id=actor and a.closed_at is null and b.status in ('ACCEPTED','ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION')
      and (p_booking_id is null or b.id=p_booking_id) order by a.assigned_at desc limit 1;
  if p_booking_id is not null and trip is null then raise exception 'Viaje no activo o no asignado'; end if;
  if trip is null then
    if not exists(select 1 from public.users where id=actor and driver_active_status is true) then raise exception 'Conductor desconectado'; end if;
    select id into vehicle from public.cars where driver_id=actor and is_active is true order by updated_at desc nulls last,id limit 1;
    if vehicle is null then raise exception 'Vehículo activo requerido'; end if;
  else
    insert into booking_v2.booking_tracking(booking_id,driver_id,lat,lng,accuracy,created_at)
      values(trip,actor,p_lat,p_lng,p_accuracy,p_recorded_at);
  end if;
  insert into booking_v2.vehicle_positions values(actor,vehicle,trip,p_lat,p_lng,p_accuracy,p_recorded_at)
  on conflict(driver_id) do update set vehicle_id=excluded.vehicle_id,booking_id=excluded.booking_id,
    lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,recorded_at=excluded.recorded_at
    where excluded.recorded_at>vehicle_positions.recorded_at;
end $$;
revoke all on function booking_v2.record_vehicle_position(double precision,double precision,double precision,timestamptz,uuid) from public;
grant execute on function booking_v2.record_vehicle_position(double precision,double precision,double precision,timestamptz,uuid) to authenticated;

-- Map/plate share the same permission boundary. A plate is not an access credential.
create function booking_v2.list_vehicle_locations(p_plate text default '')
returns table(driver_id uuid,vehicle_id uuid,booking_id uuid,plate_number text,driver_name text,car_model text,car_color text,
  booking_status text,driver_lat double precision,driver_lng double precision,recorded_at timestamptz,is_stale boolean)
language sql stable security definer set search_path=pg_catalog,public,booking_v2 as $$
 select p.driver_id,p.vehicle_id,b.id,c.plate::text,concat_ws(' ',u.first_name,u.last_name),concat_ws(' ',c.make,c.model),c.color::text,
   case b.status when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
     else coalesce(b.status::text,'AVAILABLE') end,p.lat,p.lng,p.recorded_at,p.recorded_at<now()-interval '60 seconds'
 from booking_v2.vehicle_positions p join public.users u on u.id=p.driver_id join public.cars c on c.id=p.vehicle_id
 left join booking_v2.bookings b on b.id=p.booking_id and b.status in ('ACCEPTED','ARRIVED_PICKUP','STARTED','ARRIVED_DESTINATION')
 where exists(select 1 from public.users viewer where viewer.id=booking_v2.current_app_user_id() and viewer.blocked is not true)
   and (booking_v2.is_admin() or p.driver_id=booking_v2.current_app_user_id() or b.customer_id=booking_v2.current_app_user_id())
   and u.blocked is not true and u.approved is true and c.is_active is true
   and (u.driver_active_status is true or b.id is not null)
   and (coalesce(trim(p_plate),'')='' or regexp_replace(upper(c.plate),'[^A-Z0-9]','','g') like
     '%'||regexp_replace(upper(p_plate),'[^A-Z0-9]','','g')||'%')
 order by p.recorded_at desc;
$$;
revoke all on function booking_v2.list_vehicle_locations(text) from public;
grant execute on function booking_v2.list_vehicle_locations(text) to authenticated;

create function booking_v2.get_active_booking_by_plate(p_plate text)
returns table(booking_id uuid,driver_name text,car_model text,car_color text,plate_number text,booking_status text,
  driver_lat double precision,driver_lng double precision,recorded_at timestamptz,is_stale boolean)
language sql stable security definer set search_path=pg_catalog,public,booking_v2 as $$
 select l.booking_id,l.driver_name,l.car_model,l.car_color,l.plate_number,l.booking_status,l.driver_lat,l.driver_lng,l.recorded_at,l.is_stale
 from booking_v2.list_vehicle_locations(p_plate) l where l.booking_id is not null
 and regexp_replace(upper(l.plate_number),'[^A-Z0-9]','','g')=regexp_replace(upper(p_plate),'[^A-Z0-9]','','g');
$$;
revoke all on function booking_v2.get_active_booking_by_plate(text) from public;
grant execute on function booking_v2.get_active_booking_by_plate(text) to authenticated;
