-- Read projection for the existing mobile screens. No legacy booking is written.
create table booking_v2.mobile_details (
  booking_id uuid primary key references booking_v2.bookings(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb
);
create table booking_v2.mobile_bookings (like public.bookings including defaults);
alter table booking_v2.mobile_bookings add primary key(id);
alter table booking_v2.mobile_bookings add foreign key(id) references booking_v2.bookings(id) on delete cascade;
alter table booking_v2.mobile_bookings enable row level security;
alter table booking_v2.mobile_details enable row level security;

create or replace function booking_v2.can_access_booking(p_booking_id uuid)
returns boolean language sql stable security definer
set search_path=pg_catalog,public,booking_v2 as $$
  select exists (
    select 1 from public.users u join booking_v2.bookings b on b.id=p_booking_id
    where u.auth_id=auth.uid() and u.blocked is not true and (
      (u.user_type='admin' and u.approved is true) or b.customer_id=u.id or exists (
        select 1 from booking_v2.booking_assignments a where a.booking_id=b.id and a.driver_id=u.id
      ) or (u.user_type='driver' and u.approved is true and b.status='PENDING'
        and (b.request_expires_at is null or b.request_expires_at>now())
        and not exists(select 1 from booking_v2.booking_assignments a where a.booking_id=b.id and a.closed_at is null)
        and exists(select 1 from public.memberships m where m.conductor=coalesce(u.auth_id,u.id)
          and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
      )
    )
  );
$$;
create policy mobile_read on booking_v2.mobile_bookings for select to authenticated
using(booking_v2.can_access_booking(id));
grant select on booking_v2.mobile_bookings to authenticated;

create function booking_v2.refresh_mobile_booking(p_id uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare
  b booking_v2.bookings%rowtype;
  a booking_v2.booking_assignments%rowtype;
  f booking_v2.booking_fares%rowtype;
  u public.users%rowtype;
  row_data jsonb;
  output_row booking_v2.mobile_bookings%rowtype;
  category_name text;
  columns_sql text;
begin
  select * into b from booking_v2.bookings where id=p_id;
  if not found then return; end if;
  select * into a from booking_v2.booking_assignments where booking_id=p_id
    order by (closed_at is null) desc, assigned_at desc limit 1;
  select * into f from booking_v2.booking_fares where booking_id=p_id;
  select * into u from public.users where id=b.customer_id;
  select name into category_name from public.car_types where id=b.requested_car_type_id;
  select coalesce(payload,'{}'::jsonb) into row_data from booking_v2.mobile_details where booking_id=p_id;
  row_data := coalesce(row_data,'{}'::jsonb) || jsonb_build_object(
    'id',b.id,'customer_id',b.customer_id,'customer',b.customer_id,
    'customer_name',concat_ws(' ',u.first_name,u.last_name),'customer_email',u.email,'customer_contact',u.mobile,
    'driver_id',a.driver_id,'driver',a.driver_id,'driver_name',a.driver_name_snapshot,
    'driver_contact',a.driver_contact_snapshot,'car_id',a.vehicle_id,'car_type_id',b.requested_car_type_id,
    'car_type',category_name,'plate_number',a.vehicle_plate_snapshot,'vehicle_number',a.vehicle_plate_snapshot,
    'vehicle_make',a.vehicle_make_snapshot,'vehicle_model',a.vehicle_model_snapshot,'vehicle_color',a.vehicle_color_snapshot,
    'car_model',a.vehicle_model_snapshot,'status',case b.status
       when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
       when 'COMPLETED' then 'COMPLETE' when 'PENDING' then case when b.booking_type='IMMEDIATE' then 'NEW' else 'PENDING' end
       else b.status::text end,
    'booking_type',case b.booking_type when 'SCHEDULED' then 'reservation' else 'immediate' end,
    'booking_date',coalesce(b.scheduled_at,b.created_at),'request_expires_at',b.request_expires_at,
    'reference',b.reference,'created_at',b.created_at,'updated_at',b.updated_at
  ) || jsonb_build_object(
    'pickup_address',b.pickup_address,'pickup_lat',b.pickup_lat,'pickup_lng',b.pickup_lng,
    'drop_address',b.dropoff_address,'drop_lat',b.dropoff_lat,'drop_lng',b.dropoff_lng,
    'pickup_location',jsonb_build_object('address',b.pickup_address,'lat',b.pickup_lat,'lng',b.pickup_lng),
    'destination_location',jsonb_build_object('address',b.dropoff_address,'lat',b.dropoff_lat,'lng',b.dropoff_lng),
    'price',coalesce(f.final_fare,f.estimated_fare,0),'estimate',f.estimated_fare,
    'total_cost',coalesce(f.final_fare,f.estimated_fare,0),'trip_cost',coalesce(f.final_fare,f.estimated_fare,0),
    'distance',coalesce(f.actual_distance_m,f.estimated_distance_m)/1000.0,
    'duration',coalesce(f.actual_duration_s,f.estimated_duration_s)/60,
    'driver_share',f.driver_earnings,'convenience_fees',f.convenience_fee,'discount',f.discount_amount,
    'payment_mode',b.payment_mode,'observations',b.observations,
    'trip_start_time',b.started_at,'trip_end_time',b.completed_at,'driver_arrived_time',b.arrived_pickup_at,
    'otp',null,'otp_verified',exists(select 1 from booking_v2.booking_access_codes c
        where c.booking_id=b.id and c.verified_at is not null and c.invalidated_at is null),
    'otp_timer_started_at',b.arrived_pickup_at,'otp_timer_duration',180,
    'reason',b.cancellation_reason,'waypoints',coalesce(b.waypoints,'[]'::jsonb)
  );
  output_row := jsonb_populate_record(null::booking_v2.mobile_bookings,row_data);
  -- An upsert of the full projection avoids deleting/reinserting on every event.
  if exists(select 1 from booking_v2.mobile_bookings where id=p_id) then
    select string_agg(quote_ident(attname),',' order by attnum) into columns_sql
      from pg_attribute where attrelid='booking_v2.mobile_bookings'::regclass and attnum>0 and not attisdropped;
    execute format('update booking_v2.mobile_bookings set (%s)=(select %s from jsonb_populate_record(null::booking_v2.mobile_bookings,$1)) where id=$2',
      columns_sql,columns_sql) using row_data,p_id;
  else
    insert into booking_v2.mobile_bookings select output_row.*;
  end if;
end;
$$;

create function booking_v2.refresh_mobile_trigger() returns trigger
language plpgsql security definer set search_path=pg_catalog,booking_v2 as $$
begin
  if tg_table_name='bookings' then perform booking_v2.refresh_mobile_booking(new.id);
  else perform booking_v2.refresh_mobile_booking(new.booking_id); end if;
  return new;
end;
$$;
create trigger refresh_mobile after insert or update on booking_v2.bookings
for each row execute function booking_v2.refresh_mobile_trigger();
create trigger refresh_mobile after insert or update on booking_v2.booking_assignments
for each row execute function booking_v2.refresh_mobile_trigger();
create trigger refresh_mobile after insert or update on booking_v2.booking_fares
for each row execute function booking_v2.refresh_mobile_trigger();
create trigger refresh_mobile after insert or update on booking_v2.booking_access_codes
for each row execute function booking_v2.refresh_mobile_trigger();
create trigger refresh_mobile after insert or update on booking_v2.mobile_details
for each row execute function booking_v2.refresh_mobile_trigger();
revoke all on function booking_v2.refresh_mobile_booking(uuid) from public;
revoke all on function booking_v2.refresh_mobile_trigger() from public;

create view public.bookings_v2_mobile with (security_barrier=true) as
select p.* from booking_v2.mobile_bookings p where booking_v2.can_access_booking(p.id);
grant select on public.bookings_v2_mobile to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
    select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='booking_v2' and tablename='mobile_bookings'
  ) then alter publication supabase_realtime add table booking_v2.mobile_bookings; end if;
end $$;
