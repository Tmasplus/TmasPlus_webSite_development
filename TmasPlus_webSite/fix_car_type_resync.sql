-- ============================================================================
-- Resincroniza users.car_type (etiqueta denormalizada) con la categoría real
-- del vehículo activo (cars.service_type) en la BD de la App.
--
-- Por qué: el listado /users pinta la categoría priorizando users.car_type, que
-- en muchos registros está vacío o desincronizado respecto a cars.service_type
-- (la fuente canónica). Esto deja la columna "Categoría" mostrando un valor
-- equivocado. Este script alinea car_type con el service_type del vehículo
-- preferido de cada conductor.
--
-- Vehículo preferido = activo primero (is_active), luego el más reciente
-- (updated_at). cars.driver_id puede ser users.id o users.auth_id (filas
-- heredadas), por eso se cruzan ambos.
--
-- Mapeo service_type -> car_type:
--   particular         -> 'T+Plus Particular'
--   servicio_especial  -> 'T+Plus Especial'
--   taxi_plus          -> 'T+Plus Taxi'
--   van_plus           -> 'T+Plus Van'
--
-- Ejecutar en el SQL Editor del proyecto de la App (utofhxgzkdhljrixperh).
-- Recomendado: correr primero la VISTA PREVIA, revisar, y luego el UPDATE.
-- ============================================================================

-- CTE compartida: el vehículo preferido (con categoría) de cada usuario y la
-- etiqueta car_type que le corresponde.
WITH preferred_car AS (
  SELECT DISTINCT ON (u.id)
    u.id                AS user_id,
    u.car_type          AS car_type_actual,
    c.service_type      AS service_type,
    CASE c.service_type
      WHEN 'particular'        THEN 'T+Plus Particular'
      WHEN 'servicio_especial' THEN 'T+Plus Especial'
      WHEN 'taxi_plus'         THEN 'T+Plus Taxi'
      WHEN 'van_plus'          THEN 'T+Plus Van'
    END                 AS car_type_nuevo
  FROM users u
  JOIN cars c
    ON c.driver_id = u.id
    OR (u.auth_id IS NOT NULL AND c.driver_id = u.auth_id)
  WHERE c.service_type IN ('particular', 'servicio_especial', 'taxi_plus', 'van_plus')
  ORDER BY u.id, c.is_active DESC NULLS LAST, c.updated_at DESC NULLS LAST
)

-- ----------------------------------------------------------------------------
-- VISTA PREVIA (dry-run): qué filas cambiarían. NO modifica nada.
-- ----------------------------------------------------------------------------
SELECT user_id, car_type_actual, service_type, car_type_nuevo
FROM preferred_car
WHERE car_type_actual IS DISTINCT FROM car_type_nuevo
ORDER BY car_type_nuevo, user_id;


-- ----------------------------------------------------------------------------
-- ACTUALIZACIÓN: descomenta y ejecuta cuando la vista previa sea correcta.
-- (Repite la CTE porque cada sentencia SQL es independiente.)
-- ----------------------------------------------------------------------------
-- WITH preferred_car AS (
--   SELECT DISTINCT ON (u.id)
--     u.id           AS user_id,
--     c.service_type AS service_type,
--     CASE c.service_type
--       WHEN 'particular'        THEN 'T+Plus Particular'
--       WHEN 'servicio_especial' THEN 'T+Plus Especial'
--       WHEN 'taxi_plus'         THEN 'T+Plus Taxi'
--       WHEN 'van_plus'          THEN 'T+Plus Van'
--     END            AS car_type_nuevo
--   FROM users u
--   JOIN cars c
--     ON c.driver_id = u.id
--     OR (u.auth_id IS NOT NULL AND c.driver_id = u.auth_id)
--   WHERE c.service_type IN ('particular', 'servicio_especial', 'taxi_plus', 'van_plus')
--   ORDER BY u.id, c.is_active DESC NULLS LAST, c.updated_at DESC NULLS LAST
-- )
-- UPDATE users u
-- SET car_type   = pc.car_type_nuevo,
--     updated_at = now()
-- FROM preferred_car pc
-- WHERE u.id = pc.user_id
--   AND u.car_type IS DISTINCT FROM pc.car_type_nuevo;
