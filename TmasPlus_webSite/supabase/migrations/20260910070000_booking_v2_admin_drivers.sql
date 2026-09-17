-- The web and mobile clients use the same project and canonical profile ids.
-- Matches the legacy aliases in src/utils/carTypeCatalog.ts; cars still store text.
create function booking_v2.category_matches(p_category_id uuid,p_value text)
returns boolean language sql stable security definer set search_path=pg_catalog,public,booking_v2 as $$
  select exists(select 1 from public.car_types ct where ct.id=p_category_id and ct.is_active is true
    and regexp_replace(lower(coalesce(p_value,'')),'[^a-z0-9]','','g') in (
      regexp_replace(lower(ct.name),'[^a-z0-9]','','g'),
      regexp_replace(ct.id::text,'[^a-z0-9]','','g'),
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'particular'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'servicioespecial'
        when '102d2c48-ee88-4652-ae6c-8f2fe3ae2d20' then 'taxiplus'
        when 'a111364a-95d0-4ac8-8305-35c7536dd064' then 'vanplus' end,
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'tplusparticular'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'tplusespecial'
        when '102d2c48-ee88-4652-ae6c-8f2fe3ae2d20' then 'tplustaxi'
        when 'a111364a-95d0-4ac8-8305-35c7536dd064' then 'tplusvan' end,
      case ct.id::text when '6975bdc7-e6b0-4002-ba3b-45f2a5d439cc' then 'xplus'
        when '2acdb415-df6d-4087-bc54-1c741ea86de6' then 'comfortplus' end
    ));
$$;
revoke all on function booking_v2.category_matches(uuid,text) from public;

create function booking_v2.list_assignable_drivers(p_query text default '')
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,booking_v2 as $$
begin
  if not booking_v2.is_admin() then raise exception 'Administrador aprobado requerido'; end if;
  return coalesce((select jsonb_agg(result order by result->>'first_name') from (
    select jsonb_build_object('id',u.id,'auth_id',u.auth_id,'first_name',u.first_name,
      'last_name',u.last_name,'email',u.email,'mobile',u.mobile,'approved',u.approved,
      'blocked',u.blocked,'driver_active_status',u.driver_active_status,'vehicle',
      jsonb_build_object('id',c.id,'make',c.make,'model',c.model,'plate',c.plate,'service_type',c.service_type)) result
    from public.users u
    join lateral (select * from public.cars where driver_id=u.id and is_active is true
      order by updated_at desc nulls last,id limit 1) c on true
    where u.user_type='driver' and u.approved is true and u.blocked is not true
      and exists(select 1 from public.memberships m where m.conductor=coalesce(u.auth_id,u.id)
        and upper(m.status)='ACTIVA' and current_date between m.fecha_inicio and m.fecha_terminada)
      and (coalesce(trim(p_query),'')='' or concat_ws(' ',u.first_name,u.last_name,u.email,u.mobile,c.plate)
        ilike '%' || trim(p_query) || '%')
  ) eligible),'[]'::jsonb);
end $$;
revoke all on function booking_v2.list_assignable_drivers(text) from public;
grant execute on function booking_v2.list_assignable_drivers(text) to authenticated;
