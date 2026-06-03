-- =====================================================================
-- ARREGLO RLS PARA public.cars  — EJECUTAR EN LA BD SECUNDARIA (App)
-- Proyecto: utofhxgzkdhljrixperh
--
-- DIAGNÓSTICO (confirmado con pg_policies):
--   * public.users  TIENE  "Allow anonymous read"  ->  SELECT / public / USING (true)
--     => la lista de /users carga porque cualquiera (anon) puede leerla.
--   * public.cars   NO tiene ninguna política public/anónima de SELECT.
--     La única de lectura amplia es "Admins can view all cars", que exige
--     una fila en users con auth_id = auth.uid() AND user_type='admin'
--     AND approved=true. El dashboard lee con el token del proyecto
--     PRIMARIO, así que auth.uid() no resuelve a ese admin en la
--     secundaria y la consulta de cars vuelve vacía => el modal no
--     muestra el vehículo.
--
-- FIX: replicar en cars el MISMO patrón de lectura anónima que ya usa
-- users. No expone nada nuevo: users (nombres, email, teléfono, documento)
-- ya es legible por anon en esta BD; cars queda al mismo nivel.
-- Las políticas existentes de conductor (ver/editar su propio coche) se
-- mantienen; esta SELECT pública se suma (las policies se aplican con OR).
-- =====================================================================

DROP POLICY IF EXISTS "Allow anonymous read cars" ON public.cars;
CREATE POLICY "Allow anonymous read cars" ON public.cars
  FOR SELECT
  TO public
  USING (true);

-- ---------------------------------------------------------------------
-- VERIFICACIÓN: la nueva política debe aparecer en la lista
-- ---------------------------------------------------------------------
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'cars'
ORDER BY policyname;

-- =====================================================================
-- ALTERNATIVA MÁS ESTRICTA (opcional, en lugar de la de arriba):
-- Si NO quieres lectura anónima de cars y prefieres limitarla a admins,
-- haría falta que el dashboard se autentique en la secundaria como el
-- admin (y que exista su fila en users con user_type='admin', approved=true).
-- En ese caso la política "Admins can view all cars" ya existente bastaría
-- y no hay que crear nada aquí; el cambio sería en el código del dashboard
-- (dejar de sobreescribir el token secundario con el primario en
-- syncSession). Pídemelo y lo implemento por código en vez de por SQL.
-- =====================================================================
