-- CORE ONLY: revisar y ejecutar en zvplcamcyldcquxqnftb (PRODUCCION). NO aplicada.
-- Objetivo: unificar marcas repetidas que solo cambian en mayusculas/espacios
-- (p. ej. Renault / RENAULT) y evitar que vuelvan a crearse.
--
-- Por que: web_cars_write exige EXACTAMENTE 1 marca activa con lower(nombre)=lower(trim(make)).
-- Con dos marcas "iguales" n=2 y el guardado falla con
-- "Seleccione una marca existente y activa".
--
-- Antes de ejecutar (para poder revertir el repunteo de vehiculos):
--   SELECT v.id, v.id_marca FROM public.vehiculo v
--   WHERE v.id_marca IN (SELECT m.id FROM public.marca_vehiculo m
--     WHERE lower(regexp_replace(btrim(m.nombre),'\s+',' ','g')) IN (
--       SELECT lower(regexp_replace(btrim(nombre),'\s+',' ','g')) FROM public.marca_vehiculo
--       GROUP BY 1 HAVING count(*)>1));
--   -> guardar el resultado fuera del repo.
--
-- Regla de la marca que se conserva por grupo: la que mas vehiculos tiene;
-- empate -> la mas antigua; empate -> menor id. Revisar los empates (p. ej. MG, JAC S2).
BEGIN;
SET LOCAL lock_timeout = '5s';

-- 1) Repuntar vehiculos de las marcas repetidas hacia la que se conserva.
WITH ranked AS (
  SELECT m.id, lower(regexp_replace(btrim(m.nombre),'\s+',' ','g')) AS k,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(btrim(m.nombre),'\s+',' ','g'))
      ORDER BY (SELECT count(*) FROM public.vehiculo v WHERE v.id_marca=m.id) DESC, m.creado_en, m.id
    ) AS rn
  FROM public.marca_vehiculo m
), keep AS (SELECT k, id AS keep_id FROM ranked WHERE rn=1)
UPDATE public.vehiculo v SET id_marca=keep.keep_id
FROM ranked r JOIN keep ON keep.k=r.k
WHERE v.id_marca=r.id AND r.rn>1;

-- 2) Borrar las marcas sobrantes (ya sin vehiculos).
WITH ranked AS (
  SELECT m.id,
    row_number() OVER (
      PARTITION BY lower(regexp_replace(btrim(m.nombre),'\s+',' ','g'))
      ORDER BY (SELECT count(*) FROM public.vehiculo v WHERE v.id_marca=m.id) DESC, m.creado_en, m.id
    ) AS rn
  FROM public.marca_vehiculo m
)
DELETE FROM public.marca_vehiculo m USING ranked r WHERE m.id=r.id AND r.rn>1;

-- 3) Dejar los nombres sin espacios de mas.
UPDATE public.marca_vehiculo SET nombre=regexp_replace(btrim(nombre),'\s+',' ','g')
WHERE nombre IS DISTINCT FROM regexp_replace(btrim(nombre),'\s+',' ','g');

-- 3b) Empate Mg/MG (0 vehiculos): se conserva la mas antigua ("Mg"); la grafia correcta es MG.
UPDATE public.marca_vehiculo SET nombre='MG' WHERE nombre='Mg';

-- 4) Impedir nuevos duplicados (el UNIQUE actual distingue mayusculas).
CREATE UNIQUE INDEX IF NOT EXISTS marca_vehiculo_nombre_norm_uq
  ON public.marca_vehiculo (lower(regexp_replace(btrim(nombre),'\s+',' ','g')));

-- Comprobacion: debe devolver 0 filas.
-- SELECT lower(nombre), count(*) FROM public.marca_vehiculo GROUP BY 1 HAVING count(*)>1;

COMMIT;

-- Reversion: DROP INDEX public.marca_vehiculo_nombre_norm_uq; el repunteo/borrado de
-- marcas solo se deshace con el listado guardado arriba (recrear marca y devolver id_marca).
--
-- Nota (no incluida a proposito): vehiculo_id_marca_fkey es ON DELETE SET NULL, asi que borrar
-- una marca en uso deja esos vehiculos sin marca (hoy hay vehiculos asi: ver informe).
-- La web ya avisa y pide confirmacion; si se quiere bloquear el borrado, cambiar la FK a
-- ON DELETE RESTRICT (decision pendiente).
