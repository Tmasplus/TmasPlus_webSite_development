-- Permite que un CONDUCTOR autenticado registre su propio vehículo desde el
-- portal web (página /driver-status), para luego poder subir la Tarjeta de
-- propiedad y el SOAT.
--
-- Contexto: cars.driver_id referencia users.id (PK de la tabla users de la App).
-- El conductor se autentica con su sesión de Supabase (rol `authenticated`),
-- donde auth.uid() corresponde a users.auth_id (o, en registros antiguos, a
-- users.id). La política acepta ambos mapeos.
--
-- Nota: NO se altera el estado de RLS de la tabla a propósito. El SELECT y el
-- UPDATE del conductor sobre `cars` ya funcionan, así que aquí solo se agrega
-- la política de INSERT que faltaba. Si RLS estuviera deshabilitado, esta
-- política simplemente queda inactiva hasta que se habilite (no rompe nada).

drop policy if exists "drivers_insert_own_car" on public.cars;

create policy "drivers_insert_own_car"
on public.cars
for insert
to authenticated
with check (
  driver_id in (
    select u.id
    from public.users u
    where u.auth_id = auth.uid()
       or u.id = auth.uid()
  )
);
