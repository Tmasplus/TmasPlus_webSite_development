-- 020: depura vehiculos con la misma placa (comparada sin espacios ni simbolos).
-- Origen: carga masiva del 2026-09-19 18:19:11 que dejo 19 placas dobles; el indice
-- vehiculo_placa_key solo ve la placa cruda ("ABC 123" y "ABC123" no chocan).
-- Alcance: solo pares del MISMO conductor (18). NWW507 (dos conductores) queda
-- fuera hasta confirmar con el conductor; no se toca.
-- Por cada placa conserva UNA fila: mas reservas > activa > mas documentos > mas antigua.
--   - Categoria: se deja la de la fila conservada.
--   - Documentos de la fila a borrar que la conservada no tenga: se mueven.
--   - Campos vacios de la conservada (marca, color, anio, combustible, transmision,
--     fotos, caracteristicas): se completan con los de la fila a borrar.
--   - Reservas de la fila a borrar: se reasignan a la conservada.
--   - La placa conservada queda normalizada (solo A-Z y 0-9).
-- Esperado hoy: conservar 18, borrar 18, 0 reservas en borrados, 9 documentos a mover.
-- Todo en una transaccion: si algo no cuadra, aborta y no cambia nada.
-- Reversion: no hay vuelta atras tras COMMIT. Antes de aplicar, respaldar las filas
-- a borrar (vehiculo y documento_vehiculo) con la consulta de abajo.
--
-- Respaldo previo (ejecutar y guardar el resultado):
--   SELECT v.* FROM public.vehiculo v WHERE regexp_replace(upper(v.placa),'[^A-Z0-9]','','g') IN (
--     SELECT regexp_replace(upper(placa),'[^A-Z0-9]','','g') FROM public.vehiculo
--     GROUP BY 1 HAVING count(*)>1);

BEGIN;

CREATE TEMP TABLE _dup ON COMMIT DROP AS
WITH v AS (
  SELECT v.id, v.id_conductor, regexp_replace(upper(v.placa),'[^A-Z0-9]','','g') p,
         v.activo, v.creado_en,
         (SELECT count(*) FROM public.reserva r WHERE r.id_vehiculo=v.id) reservas,
         (SELECT count(*) FROM public.documento_vehiculo d WHERE d.id_vehiculo=v.id) docs
  FROM public.vehiculo v),
g AS (SELECT p FROM v GROUP BY p HAVING count(*)>1 AND count(DISTINCT id_conductor)=1)
SELECT v.*, row_number() OVER (PARTITION BY p ORDER BY reservas DESC, activo DESC, docs DESC, creado_en, id) rn
FROM v JOIN g USING(p);

DO $$ BEGIN
  IF (SELECT count(*) FROM _dup WHERE rn>1) <> 18 OR (SELECT count(*) FROM _dup WHERE rn=1) <> 18 THEN
    RAISE EXCEPTION 'Se esperaban 18 pares; los datos cambiaron. Revisar antes de aplicar.';
  END IF;
END $$;

-- 1) Documentos que solo tiene la fila a borrar.
INSERT INTO public.documento_vehiculo(id_vehiculo,tipo,lado,storage_path,fecha_vencimiento)
SELECT k.id, d.tipo, d.lado, d.storage_path, d.fecha_vencimiento
FROM _dup l JOIN _dup k ON k.p=l.p AND k.rn=1
JOIN public.documento_vehiculo d ON d.id_vehiculo=l.id
WHERE l.rn>1
ON CONFLICT (id_vehiculo,tipo,lado) DO NOTHING;

-- 2) Reservas de las filas a borrar pasan a la conservada.
UPDATE public.reserva r SET id_vehiculo=k.id
FROM _dup l JOIN _dup k ON k.p=l.p AND k.rn=1
WHERE l.rn>1 AND r.id_vehiculo=l.id;

-- 3) Completar vacios de la conservada con los de la fila a borrar.
UPDATE public.vehiculo k SET
  id_marca=coalesce(k.id_marca,s.id_marca),
  color=coalesce(nullif(trim(k.color),''),s.color),
  anio=coalesce(k.anio,s.anio),
  tipo_combustible=coalesce(k.tipo_combustible,s.tipo_combustible),
  transmision=coalesce(k.transmision,s.transmision),
  foto_1=coalesce(k.foto_1,s.foto_1),
  foto_2=coalesce(k.foto_2,s.foto_2),
  caracteristicas=coalesce(k.caracteristicas,s.caracteristicas)
FROM (
  SELECT kd.id kid,
         (array_agg(v.id_marca) FILTER (WHERE v.id_marca IS NOT NULL))[1] id_marca,
         (array_agg(nullif(trim(v.color),'')) FILTER (WHERE nullif(trim(v.color),'') IS NOT NULL))[1] color,
         (array_agg(v.anio) FILTER (WHERE v.anio IS NOT NULL))[1] anio,
         (array_agg(v.tipo_combustible) FILTER (WHERE v.tipo_combustible IS NOT NULL))[1] tipo_combustible,
         (array_agg(v.transmision) FILTER (WHERE v.transmision IS NOT NULL))[1] transmision,
         (array_agg(v.foto_1) FILTER (WHERE v.foto_1 IS NOT NULL))[1] foto_1,
         (array_agg(v.foto_2) FILTER (WHERE v.foto_2 IS NOT NULL))[1] foto_2,
         (array_agg(v.caracteristicas) FILTER (WHERE v.caracteristicas IS NOT NULL))[1] caracteristicas
  FROM _dup kd JOIN _dup ld ON ld.p=kd.p AND ld.rn>1
  JOIN public.vehiculo v ON v.id=ld.id
  WHERE kd.rn=1 GROUP BY kd.id) s
WHERE k.id=s.kid;

-- 4) Borrar las filas sobrantes (sus documentos se van por ON DELETE CASCADE).
DELETE FROM public.vehiculo WHERE id IN (SELECT id FROM _dup WHERE rn>1);

-- 5) Normalizar la placa de las conservadas.
UPDATE public.vehiculo v SET placa=d.p FROM _dup d WHERE d.rn=1 AND v.id=d.id AND v.placa<>d.p;

-- Verificacion: no deben quedar placas repetidas entre las tratadas.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.vehiculo v
             WHERE regexp_replace(upper(v.placa),'[^A-Z0-9]','','g') IN (SELECT p FROM _dup WHERE rn=1)
             GROUP BY regexp_replace(upper(v.placa),'[^A-Z0-9]','','g') HAVING count(*)>1) THEN
    RAISE EXCEPTION 'Quedaron placas repetidas; se revierte.';
  END IF;
END $$;

COMMIT;
