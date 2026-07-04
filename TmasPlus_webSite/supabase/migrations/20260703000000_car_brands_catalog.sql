-- ============================================================================
-- Catálogo de MARCAS de vehículos (car_brands)
--
-- Objetivo: que las marcas se administren desde la web (módulo "Marcas de
-- Vehículos") y la App las lea de aquí para poblar el selector al registrar un
-- vehículo. La App guarda el `name` elegido en `cars.make` (como hoy), así que
-- los vehículos existentes NO se ven afectados.
--
-- EJECUTAR EN EL PROYECTO SECUNDARIO / DE LA APP (utofhxgzkdhljrixperh),
-- en Supabase Studio → SQL Editor. Es el mismo proyecto donde vive `car_types`.
-- ============================================================================

create table if not exists public.car_brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Nombre único sin distinguir mayúsculas/acentos-simples (evita "Toyota"/"toyota")
create unique index if not exists car_brands_name_unique_ci
  on public.car_brands (lower(name));

-- ----------------------------------------------------------------------------
-- RLS: lectura y escritura para anon + authenticated.
--
-- Por qué anon: el dashboard web accede al proyecto secundario con la anon key
-- y NO siempre queda con sesión `authenticated` aquí (el login secundario del
-- admin es "best effort" y falla en silencio si la cuenta no existe en el auth
-- de este proyecto). Sin `anon` en el policy de escritura, el INSERT desde la
-- web falla con "new row violates row-level security policy". Es el mismo
-- patrón de acceso que usan las demás tablas de catálogo (p. ej. car_types).
-- ----------------------------------------------------------------------------
alter table public.car_brands enable row level security;

drop policy if exists "car_brands_select_all" on public.car_brands;
create policy "car_brands_select_all"
  on public.car_brands
  for select
  to anon, authenticated
  using (true);

drop policy if exists "car_brands_write_authenticated" on public.car_brands;
drop policy if exists "car_brands_write_all" on public.car_brands;
create policy "car_brands_write_all"
  on public.car_brands
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ----------------------------------------------------------------------------
-- Sin seed: la tabla arranca vacía. Todas las marcas se crean desde la web
-- (módulo "Marcas de Vehículos") y aparecen solas en el select de la App.
--
-- (Opcional) Si quisieras precargar las marcas que ya usan los vehículos
-- existentes, descomenta esto:
--
-- insert into public.car_brands (name)
-- select distinct trim(make)
-- from public.cars
-- where make is not null and trim(make) <> ''
-- on conflict (lower(name)) do nothing;
