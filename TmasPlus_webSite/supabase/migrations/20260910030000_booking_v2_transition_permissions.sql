-- Authorization per action, rather than treating read access as write permission.
create or replace function booking_v2.transition_booking_status(
  p_booking_id uuid,
  p_expected_status booking_v2.booking_status,
  p_new_status booking_v2.booking_status,
  p_changed_by_user_id uuid default null,
  p_source booking_v2.event_source default 'SYSTEM',
  p_reason text default null,
  p_metadata jsonb default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_accuracy_m numeric default null,
  p_cancellation_category varchar default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, booking_v2
as $$
declare
  v_current_status booking_v2.booking_status;
  v_requires_assignment boolean;
  v_assignment_id uuid;
  v_milestone booking_v2.milestone_type;
  v_actor_id uuid;
begin
  v_actor_id := coalesce(p_changed_by_user_id, booking_v2.current_app_user_id());

  if auth.uid() is not null then
    v_actor_id := booking_v2.current_app_user_id();
    if v_actor_id is null or not exists (select 1 from public.users where id=v_actor_id and blocked is not true) then
      raise exception 'Perfil habilitado requerido';
    end if;
    if p_changed_by_user_id is not null and p_changed_by_user_id <> v_actor_id then
      raise exception 'No puede suplantar al actor de la transición';
    end if;
    p_source := case when booking_v2.is_admin() then 'ADMIN'::booking_v2.event_source else 'APP'::booking_v2.event_source end;
    if not booking_v2.is_admin() and not exists (
      select 1 from booking_v2.booking_assignments a join public.users u on u.id=a.driver_id
      where a.booking_id=p_booking_id and a.driver_id=v_actor_id and a.closed_at is null
        and u.approved is true and u.blocked is not true
    ) and not (p_new_status='CANCELLED' and exists (
      select 1 from booking_v2.bookings where id=p_booking_id and customer_id=v_actor_id
    )) then
      raise exception 'La acción requiere el conductor asignado o un administrador';
    end if;
  end if;

  if auth.uid() is not null
     and not booking_v2.can_access_booking(p_booking_id) then
    raise exception 'No tiene acceso a esta reserva';
  end if;

  select status into strict v_current_status
  from booking_v2.bookings
  where id = p_booking_id
  for update;

  if v_current_status <> p_expected_status then
    raise exception 'Estado esperado %, estado actual %', p_expected_status, v_current_status;
  end if;

  select requires_active_assignment into strict v_requires_assignment
  from booking_v2.booking_status_transitions
  where from_status = v_current_status
    and to_status = p_new_status;

  select id into v_assignment_id
  from booking_v2.booking_assignments
  where booking_id = p_booking_id
    and closed_at is null
  for update;

  if v_requires_assignment and v_assignment_id is null then
    raise exception 'La transición requiere una asignación activa';
  end if;

  case p_new_status
    when 'ACCEPTED' then
      update booking_v2.booking_assignments
      set assignment_status = 'ACCEPTED', accepted_at = now()
      where id = v_assignment_id;

      update booking_v2.bookings
      set status = p_new_status, accepted_at = now()
      where id = p_booking_id;

    when 'ARRIVED_PICKUP' then
      update booking_v2.bookings
      set status = p_new_status, arrived_pickup_at = now()
      where id = p_booking_id;
      v_milestone := 'ARRIVAL_PICKUP';

    when 'STARTED' then
      update booking_v2.bookings
      set status = p_new_status, started_at = now()
      where id = p_booking_id;
      v_milestone := 'PASSENGER_PICKED_UP';

    when 'ARRIVED_DESTINATION' then
      update booking_v2.bookings
      set status = p_new_status, arrived_destination_at = now()
      where id = p_booking_id;
      v_milestone := 'ARRIVAL_DESTINATION';

    when 'COMPLETED' then
      update booking_v2.bookings
      set status = p_new_status, completed_at = now()
      where id = p_booking_id;
      v_milestone := 'PASSENGER_DROPPED_OFF';

    when 'PAID' then
      update booking_v2.bookings
      set status = p_new_status, paid_at = now()
      where id = p_booking_id;

    when 'CANCELLED' then
      update booking_v2.bookings
      set status = p_new_status,
          cancelled_at = now(),
          cancelled_by_user_id = v_actor_id,
          cancellation_category = p_cancellation_category,
          cancellation_reason = p_reason
      where id = p_booking_id;

      if v_assignment_id is not null then
        update booking_v2.booking_assignments
        set assignment_status = 'CANCELLED',
            closed_at = now(),
            close_reason = p_reason
        where id = v_assignment_id;
      end if;

      update booking_v2.booking_access_codes
      set invalidated_at = now(), invalidation_reason = 'BOOKING_CANCELLED'
      where booking_id = p_booking_id
        and verified_at is null
        and invalidated_at is null;

      v_milestone := case p_cancellation_category
        when 'CUSTOMER_NO_SHOW' then 'CUSTOMER_NO_SHOW'::booking_v2.milestone_type
        when 'DRIVER_CANCELLED' then 'DRIVER_CANCELLED'::booking_v2.milestone_type
        when 'CUSTOMER_CANCELLED' then 'CUSTOMER_CANCELLED'::booking_v2.milestone_type
        else null
      end;

    else
      update booking_v2.bookings
      set status = p_new_status
      where id = p_booking_id;
  end case;

  insert into booking_v2.booking_status_events (
    booking_id, from_status, to_status,
    changed_by_user_id, source, reason, metadata
  ) values (
    p_booking_id, v_current_status, p_new_status,
    v_actor_id, coalesce(p_source, 'SYSTEM'), p_reason, p_metadata
  );

  if v_milestone is not null then
    insert into booking_v2.booking_milestones (
      booking_id, assignment_id, milestone_type,
      location_lat, location_lng, accuracy_m,
      recorded_by_user_id, source, metadata
    ) values (
      p_booking_id, v_assignment_id, v_milestone,
      p_location_lat, p_location_lng, p_accuracy_m,
      v_actor_id, coalesce(p_source, 'SYSTEM'), p_metadata
    )
    on conflict (booking_id, milestone_type) do update
    set occurred_at = excluded.occurred_at,
        location_lat = excluded.location_lat,
        location_lng = excluded.location_lng,
        accuracy_m = excluded.accuracy_m,
        metadata = excluded.metadata;
  end if;
exception
  when no_data_found then
    raise exception 'Reserva inexistente o transición no permitida';
end;
$$;
