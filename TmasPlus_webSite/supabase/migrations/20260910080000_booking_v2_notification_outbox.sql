-- Transactional queue: no external requests, production webhooks or plaintext OTP.
create table booking_v2.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  booking_id uuid not null references booking_v2.bookings(id) on delete cascade,
  recipient_id uuid not null references public.users(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  unique(event_id,recipient_id)
);
alter table booking_v2.notification_outbox enable row level security;
create policy admin_notifications on booking_v2.notification_outbox for select to authenticated
using(booking_v2.is_admin());
grant select on booking_v2.notification_outbox to authenticated;
grant select,update on booking_v2.notification_outbox to service_role;

create function booking_v2.queue_booking_notification() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare b booking_v2.bookings%rowtype; legacy_status text; notice_type text;
begin
  select * into strict b from booking_v2.bookings where id=new.booking_id;
  if tg_table_name='booking_status_events' then
    legacy_status := case new.to_status when 'ARRIVED_PICKUP' then 'ARRIVED' when 'ARRIVED_DESTINATION' then 'REACHED'
      when 'COMPLETED' then 'COMPLETE' else new.to_status::text end;
    insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
    select new.id,b.id,recipient,jsonb_build_object('type','booking-update','bookingId',b.id,'newStatus',legacy_status)
    from (select b.customer_id recipient union select driver_id from booking_v2.booking_assignments
      where booking_id=b.id and closed_at is null) recipients
    on conflict(event_id,recipient_id) do nothing;
    if new.to_status='PENDING' then
      notice_type := case when b.booking_type='SCHEDULED' then 'booking-scheduled' else 'new-service-loop' end;
      insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
      select new.id,b.id,u.id,jsonb_build_object('type',notice_type,'bookingId',b.id,'role','driver')
      from public.users u where u.user_type='driver' and u.approved is true and u.blocked is not true
        and u.driver_active_status is true
        and exists(select 1 from public.memberships m where m.conductor=coalesce(u.auth_id,u.id)
          and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
        and exists(select 1 from public.cars c join public.car_types ct on ct.id=b.requested_car_type_id
          where c.driver_id=u.id and c.is_active is true and booking_v2.category_matches(ct.id,c.service_type))
      on conflict(event_id,recipient_id) do nothing;
    end if;
  else
    notice_type := case when b.booking_type='SCHEDULED' then 'booking-scheduled' else 'new-service-loop' end;
    insert into booking_v2.notification_outbox(event_id,booking_id,recipient_id,payload)
    values(new.id,b.id,new.driver_id,jsonb_build_object('type',notice_type,'bookingId',b.id,'role','driver'))
    on conflict(event_id,recipient_id) do nothing;
  end if;
  return new;
end $$;
revoke all on function booking_v2.queue_booking_notification() from public;
create trigger queue_notification after insert on booking_v2.booking_status_events
for each row execute function booking_v2.queue_booking_notification();
create trigger queue_notification after insert on booking_v2.booking_assignments
for each row execute function booking_v2.queue_booking_notification();

create function booking_v2.claim_notifications(p_limit integer default 20)
returns setof booking_v2.notification_outbox language sql security definer
set search_path=pg_catalog,public,booking_v2 as $$
  update booking_v2.notification_outbox q set locked_until=now()+interval '5 minutes',attempts=q.attempts+1
  where q.id in (select id from booking_v2.notification_outbox where sent_at is null and attempts<5
    and (locked_until is null or locked_until<now()) order by created_at limit greatest(1,least(p_limit,100))
    for update skip locked) returning q.*;
$$;
revoke all on function booking_v2.claim_notifications(integer) from public;
grant execute on function booking_v2.claim_notifications(integer) to service_role;
