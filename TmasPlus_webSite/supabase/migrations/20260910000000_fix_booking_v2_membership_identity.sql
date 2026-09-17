-- memberships.conductor references auth.users, not public.users.
-- Prefer the explicit auth_id. Only legacy profiles without auth_id use id.
create or replace function booking_v2.validate_new_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
begin
  if not exists (
    select 1
    from public.users u
    join public.memberships m on m.conductor = coalesce(u.auth_id, u.id)
    where u.id = new.driver_id
      and upper(m.status) = 'ACTIVA'
      and m.fecha_inicio <= current_date
      and m.fecha_terminada >= current_date
  ) then
    raise exception 'El conductor no tiene una membresía activa y vigente';
  end if;
  return new;
end;
$$;
