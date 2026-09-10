-- Expose booking_v2 through PostgREST and finish the dashboard-facing API.
alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public, booking_v2';
notify pgrst, 'reload config';

create or replace function booking_v2.validate_new_booking()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
begin
  if not exists (
    select 1 from public.car_types
    where id = new.requested_car_type_id and is_active = true
  ) then
    raise exception 'La categoría solicitada no existe o está deshabilitada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_new_booking on booking_v2.bookings;
create trigger trg_validate_new_booking
before insert or update of requested_car_type_id on booking_v2.bookings
for each row execute function booking_v2.validate_new_booking();

create or replace function booking_v2.validate_new_assignment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
begin
  if not exists (
    select 1
    from public.memberships m
    where m.conductor = new.driver_id
      and upper(m.status) = 'ACTIVA'
      and m.fecha_inicio <= current_date
      and m.fecha_terminada >= current_date
  ) then
    raise exception 'El conductor no tiene una membresía activa y vigente';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_new_assignment on booking_v2.booking_assignments;
create trigger trg_validate_new_assignment
before insert on booking_v2.booking_assignments
for each row execute function booking_v2.validate_new_assignment();

create or replace function booking_v2.delete_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
begin
  if not booking_v2.is_admin() then
    raise exception 'Solo un administrador puede eliminar reservas';
  end if;

  delete from booking_v2.bookings where id = p_booking_id;
  if not found then
    raise exception 'Reserva no encontrada';
  end if;
end;
$$;

revoke all on function booking_v2.delete_booking(uuid) from public;
grant execute on function booking_v2.delete_booking(uuid) to authenticated;
