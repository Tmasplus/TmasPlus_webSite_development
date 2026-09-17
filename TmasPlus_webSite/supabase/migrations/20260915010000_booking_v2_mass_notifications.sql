create table booking_v2.push_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  token text not null unique, platform text not null check(platform in ('ANDROID','IOS')),
  updated_at timestamptz not null default now(), enabled boolean not null default true
);
create table booking_v2.push_campaigns (
  id uuid primary key, created_by uuid not null references public.users(id),
  title text not null check(length(title) between 1 and 100), body text not null check(length(body) between 1 and 1000),
  audience text not null check(audience in ('driver','customer')), platform text not null check(platform in ('ALL','ANDROID','IOS')),
  created_at timestamptz not null default now(), recipients integer not null default 0
);
create table booking_v2.push_deliveries (
  id uuid primary key default gen_random_uuid(), campaign_id uuid not null references booking_v2.push_campaigns(id),
  device_id uuid not null references booking_v2.push_devices(id), recipient_id uuid not null references public.users(id),
  status text not null default 'pending' check(status in ('pending','accepted','failed')),
  attempts integer not null default 0, locked_until timestamptz, ticket_id text,last_error text,
  unique(campaign_id,device_id)
);
alter table booking_v2.push_devices enable row level security;
alter table booking_v2.push_campaigns enable row level security;
alter table booking_v2.push_deliveries enable row level security;
create policy admin_read on booking_v2.push_campaigns for select to authenticated using(booking_v2.is_admin());
create policy admin_read on booking_v2.push_deliveries for select to authenticated using(booking_v2.is_admin());
grant select on booking_v2.push_campaigns,booking_v2.push_deliveries to authenticated;
grant select,update on booking_v2.push_devices,booking_v2.push_deliveries to service_role;
grant select on booking_v2.push_campaigns to service_role;

create function booking_v2.register_push_device(p_token text,p_platform text) returns void
language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare actor uuid:=booking_v2.current_app_user_id();
begin
  if not exists(select 1 from public.users where id=actor and blocked is not true) then raise exception 'Sesión habilitada requerida'; end if;
  if p_token is null or length(p_token)>250 or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$'
    or p_platform is null or p_platform not in ('ANDROID','IOS') then raise exception 'Dispositivo inválido'; end if;
  insert into booking_v2.push_devices(user_id,token,platform) values(actor,p_token,p_platform)
  on conflict(token) do update set user_id=excluded.user_id,platform=excluded.platform,updated_at=now(),enabled=true;
end $$;
revoke all on function booking_v2.register_push_device(text,text) from public;
grant execute on function booking_v2.register_push_device(text,text) to authenticated;

create function booking_v2.create_push_campaign(p_id uuid,p_title text,p_body text,p_audience text,p_platform text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,booking_v2 as $$
declare previous booking_v2.push_campaigns%rowtype; n integer;
begin
  if not booking_v2.is_admin() then raise exception 'Administrador aprobado requerido'; end if;
  if p_id is null then raise exception 'ID requerido'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into previous from booking_v2.push_campaigns where id=p_id;
  if found then
    if previous.created_by<>booking_v2.current_app_user_id() or previous.title is distinct from trim(p_title)
      or previous.body is distinct from trim(p_body) or previous.audience is distinct from p_audience or previous.platform is distinct from p_platform then
      raise exception 'ID reutilizado con otro contenido'; end if;
    return p_id;
  end if;
  insert into booking_v2.push_campaigns(id,created_by,title,body,audience,platform)
    values(p_id,booking_v2.current_app_user_id(),trim(p_title),trim(p_body),p_audience,p_platform);
  insert into booking_v2.push_deliveries(campaign_id,device_id,recipient_id)
    select p_id,d.id,u.id from booking_v2.push_devices d join public.users u on u.id=d.user_id
    where d.enabled and d.updated_at>now()-interval '90 days' and u.blocked is not true and u.user_type=p_audience
      and (p_platform='ALL' or d.platform=p_platform);
  get diagnostics n=row_count;
  update booking_v2.push_campaigns set recipients=n where id=p_id;
  return p_id;
end $$;
revoke all on function booking_v2.create_push_campaign(uuid,text,text,text,text) from public;
grant execute on function booking_v2.create_push_campaign(uuid,text,text,text,text) to authenticated;

create function booking_v2.claim_push_deliveries(p_campaign_id uuid)
returns setof booking_v2.push_deliveries language sql security definer set search_path=pg_catalog,public,booking_v2 as $$
  update booking_v2.push_deliveries d set attempts=d.attempts+1,locked_until=now()+interval '5 minutes'
  where d.id in (select id from booking_v2.push_deliveries where campaign_id=p_campaign_id and status='pending' and attempts<5
    and (locked_until is null or locked_until<now()) order by id limit 100 for update skip locked) returning d.*;
$$;
revoke all on function booking_v2.claim_push_deliveries(uuid) from public;
grant execute on function booking_v2.claim_push_deliveries(uuid) to service_role;

create function booking_v2.push_campaign_counts()
returns table(campaign_id uuid,pending bigint,accepted bigint,failed bigint)
language plpgsql stable security definer set search_path=pg_catalog,public,booking_v2 as $$
begin
  if not booking_v2.is_admin() then raise exception 'Administrador aprobado requerido'; end if;
  return query select d.campaign_id,count(*) filter(where d.status='pending'),count(*) filter(where d.status='accepted'),
    count(*) filter(where d.status='failed') from booking_v2.push_deliveries d group by d.campaign_id;
end $$;
revoke all on function booking_v2.push_campaign_counts() from public;
grant execute on function booking_v2.push_campaign_counts() to authenticated;
