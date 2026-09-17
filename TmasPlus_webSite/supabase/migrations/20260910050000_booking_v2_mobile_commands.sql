-- Existing screens write a compatibility view; all state changes go through v2 RPCs.
create function public.write_booking_v2_mobile() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare
  actor uuid := booking_v2.current_app_user_id();
  b booking_v2.bookings%rowtype;
  target_id uuid;
  customer uuid;
  category uuid;
  driver uuid;
  vehicle uuid;
  target_status booking_v2.booking_status;
  changed jsonb;
begin
  if actor is null or not exists(select 1 from public.users where id=actor and blocked is not true) then
    raise exception 'Perfil habilitado requerido'; end if;
  if tg_op='INSERT' then
    customer := coalesce(new.customer_id,new.customer,actor);
    if not exists(select 1 from public.users where id=customer) then
      select id into customer from public.users where auth_id=customer;
    end if;
    category := new.car_type_id;
    if category is null then
      select id into category from public.car_types where is_active is true
        and booking_v2.category_matches(id,new.car_type) order by id limit 1;
    end if;
    target_id := booking_v2.create_booking(
      coalesce(new.id::text,nullif(new.reference,''),gen_random_uuid()::text),customer,category,
      case when new.booking_type='reservation' then 'SCHEDULED'::booking_v2.booking_type else 'IMMEDIATE'::booking_v2.booking_type end,
      case when new.booking_type='reservation' then new.booking_date end,new.request_expires_at,
      coalesce(new.pickup_address,new.pickup_location->>'address'),coalesce(new.pickup_lat,(new.pickup_location->>'lat')::numeric),
      coalesce(new.pickup_lng,(new.pickup_location->>'lng')::numeric),
      coalesce(new.drop_address,new.destination_location->>'address'),coalesce(new.drop_lat,(new.destination_location->>'lat')::numeric),
      coalesce(new.drop_lng,(new.destination_location->>'lng')::numeric),coalesce(new.waypoints,'[]'),new.observations,
      coalesce(new.payment_mode,'cash'),round(coalesce(new.distance,0)*1000)::int,coalesce(new.duration,0)*60,
      coalesce(new.total_cost,new.estimate,new.price,0),jsonb_build_object('source','mobile-v2')
    );
    insert into booking_v2.mobile_details(booking_id,payload) values(target_id,
      jsonb_build_object('customer_city',new.customer_city,'trip_type',new.trip_type,'trip_urban',new.trip_urban))
      on conflict(booking_id) do nothing;
  else
    target_id := old.id;
    if new.id is distinct from old.id then raise exception 'No puede cambiar el ID'; end if;
    select * into strict b from booking_v2.bookings where id=target_id for update;
    target_status := b.status;
    select coalesce(jsonb_object_agg(n.key,n.value),'{}') into changed from jsonb_each(to_jsonb(new)) n
      where n.value is distinct from (to_jsonb(old)->n.key);
    if new.otp_verified is distinct from old.otp_verified or new.otp is distinct from old.otp then
      raise exception 'Use la verificación OTP del servidor'; end if;
    if not booking_v2.is_admin() and b.customer_id=actor then
      if changed - array['status','reason','cancelled_by','cancelled_at','cancellation_time','customer_status','driver_status',
        'driver_rating','rating','review','customer_review','observations','otp_timer_started_at','otp_timer_duration'] <> '{}' then
        raise exception 'El cliente no puede modificar estos datos';
      end if;
      if new.status is distinct from old.status and new.status<>'CANCELLED' then
        raise exception 'El cliente solo puede cancelar'; end if;
      if changed ? 'observations' and new.status<>'CANCELLED' then
        raise exception 'Observaciones del cliente solo admitidas al cancelar'; end if;
    elsif not booking_v2.is_admin() and not exists(select 1 from booking_v2.booking_assignments
        where booking_id=target_id and driver_id=actor and closed_at is null) then
      if not (b.status='PENDING' and new.status='ACCEPTED') then
        raise exception 'Solo el conductor asignado puede modificar la reserva'; end if;
    end if;
    if new.customer_id is distinct from old.customer_id or new.customer is distinct from old.customer
       or new.car_type_id is distinct from old.car_type_id then raise exception 'Identidad/categoría inmutable'; end if;
    if b.status='PENDING' and new.status='ACCEPTED' then
      driver := coalesce(new.driver_id,new.driver,actor);
      if not exists(select 1 from public.users where id=driver) then select id into driver from public.users where auth_id=driver; end if;
      if not booking_v2.is_admin() and driver<>actor then raise exception 'No puede asignar a otro conductor'; end if;
      select id into vehicle from public.cars where driver_id=driver and is_active is true
        and booking_v2.category_matches(b.requested_car_type_id,service_type)
        order by (id=new.car_id) desc nulls last,updated_at desc,id limit 1;
      if not exists(select 1 from booking_v2.booking_assignments where booking_id=target_id and closed_at is null) then
        perform booking_v2.assign_booking(target_id,driver,vehicle,null);
      end if;
    end if;
    if new.status is distinct from old.status then
      target_status := case new.status when 'ARRIVED' then 'ARRIVED_PICKUP'::booking_v2.booking_status
        when 'REACHED' then 'ARRIVED_DESTINATION'::booking_v2.booking_status when 'COMPLETE' then 'COMPLETED'::booking_v2.booking_status
        when 'NEW' then 'PENDING'::booking_v2.booking_status else new.status::booking_v2.booking_status end;
      -- The existing finalization button reports arrival and completion together.
      if b.status='STARTED' and target_status='COMPLETED' then
        perform booking_v2.transition_booking_status(target_id,b.status,'ARRIVED_DESTINATION',null,'APP',null,
          '{"reported_with_completion":true}'::jsonb,new.drop_lat,new.drop_lng);
        b.status := 'ARRIVED_DESTINATION';
      end if;
      perform booking_v2.transition_booking_status(target_id,b.status,target_status,null,'APP',
        coalesce(new.reason,case when target_status='CANCELLED' then new.observations end),null,
        new.drop_lat,new.drop_lng,null,case when target_status='CANCELLED' then 'USER_CANCELLED' end);
    end if;
    if (changed ?| array['price','total_cost','trip_cost','driver_share','convenience_fees','discount','distance','duration'])
       or (target_status='COMPLETED' and b.status<>'COMPLETED') then
      if not booking_v2.is_admin() and not exists(select 1 from booking_v2.booking_assignments
        where booking_id=target_id and driver_id=actor and closed_at is null) then raise exception 'Importes no autorizados'; end if;
      update booking_v2.booking_fares set
        final_fare=case when target_status in ('COMPLETED','PAID') then
          case when changed ? 'total_cost' then new.total_cost when changed ? 'trip_cost' then new.trip_cost
            when changed ? 'price' then new.price else coalesce(new.total_cost,new.trip_cost,new.price) end
          else final_fare end,
        driver_earnings=coalesce(new.driver_share,driver_earnings),convenience_fee=coalesce(new.convenience_fees,convenience_fee),
        discount_amount=coalesce(new.discount,discount_amount),actual_distance_m=round(new.distance*1000)::int,
        actual_duration_s=new.duration*60,finalized_at=case when target_status in ('COMPLETED','PAID') then now() else finalized_at end
        where booking_id=target_id;
    end if;
    insert into booking_v2.mobile_details(booking_id,payload) values(target_id,
      jsonb_build_object('driver_rating',new.driver_rating,'customer_rating',new.customer_rating,'customer_review',new.customer_review,
        'review',new.review,'rating',new.rating,'coords',new.coords))
      on conflict(booking_id) do update set payload=booking_v2.mobile_details.payload || excluded.payload;
  end if;
  perform booking_v2.refresh_mobile_booking(target_id);
  if tg_op='INSERT' then perform booking_v2.deliver_pickup_code(target_id); end if;
  select * into new from public.bookings_v2_mobile where id=target_id;
  return new;
end;
$$;
revoke all on function public.write_booking_v2_mobile() from public;
create trigger write_v2_mobile instead of insert or update on public.bookings_v2_mobile
for each row execute function public.write_booking_v2_mobile();
grant insert,update on public.bookings_v2_mobile to authenticated;

-- Tracking has its own v2 FK; legacy tracking/history is left in place.
create table booking_v2.booking_tracking (like public.booking_tracking including defaults);
alter table booking_v2.booking_tracking add primary key(id);
alter table booking_v2.booking_tracking add foreign key(booking_id) references booking_v2.bookings(id) on delete cascade;
alter table booking_v2.booking_tracking enable row level security;
create policy tracking_read on booking_v2.booking_tracking for select to authenticated
using(booking_v2.can_access_booking(booking_id));
create policy tracking_write on booking_v2.booking_tracking for insert to authenticated with check(
  driver_id=booking_v2.current_app_user_id() and exists(select 1 from booking_v2.booking_assignments a
    where a.booking_id=booking_tracking.booking_id and a.driver_id=booking_v2.current_app_user_id() and a.closed_at is null)
);
grant select,insert on booking_v2.booking_tracking to authenticated;
create view public.booking_tracking_v2 with(security_invoker=true) as select * from booking_v2.booking_tracking;
grant select,insert on public.booking_tracking_v2 to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='booking_v2' and tablename='booking_tracking'
  ) then alter publication supabase_realtime add table booking_v2.booking_tracking; end if;
end $$;
