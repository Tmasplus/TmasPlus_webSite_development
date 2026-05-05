-- POLÍTICAS RLS PARA MEMBERSHIPS - EJECUTA ESTO EN TU DB SECUNDARIA
-- Ejecuta estas consultas en orden en el SQL Editor de Supabase

-- 1. Habilitar RLS
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "Allow authenticated users to update memberships" ON public.memberships;
DROP POLICY IF EXISTS "Allow anonymous update" ON public.memberships;
DROP POLICY IF EXISTS "Allow anonymous read" ON public.memberships;
DROP POLICY IF EXISTS "Allow anonymous insert" ON public.memberships;

-- 3. Crear política permisiva para testing (permite todas las operaciones)
CREATE POLICY "Allow all operations on memberships" ON public.memberships
  FOR ALL USING (true) WITH CHECK (true);

-- 4. Verificar políticas configuradas
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE tablename = 'memberships';

-- 5. Probar UPDATE directo
UPDATE memberships
SET status = 'INACTIVA', updated_at = NOW()
WHERE uid = '28da74da-e9f0-42c0-9254-3180ed74008a'
RETURNING *;