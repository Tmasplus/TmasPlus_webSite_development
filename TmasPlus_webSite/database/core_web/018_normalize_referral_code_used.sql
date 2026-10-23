-- Ejecutar despues de 015_backfill_referral_code_used.sql. NO aplicado: requiere autorizacion expresa para produccion
-- (crea funcion + trigger en persona y corrige filas existentes).
-- Problema: persona.codigo_referido_usado se guarda tal como lo escribe la gente (sin guion, con simbolos, minusculas...).
-- Los codigos reales (codigo_referido.codigo) son SIEMPRE AAA-XXXXX en mayusculas (762/762 en produccion).
-- Cambios:
--  1) normalizar_codigo_referido(text): quita espacios/simbolos, mayusculas e inserta el guion cuando hay exactamente 8
--     caracteres alfanumericos. Si no cuadra con el formato, devuelve el texto limpio sin inventar nada (NO trunca).
--  2) Trigger BEFORE INSERT/UPDATE en persona: todo codigo que entre por web, app o SQL queda normalizado.
--     No rechaza codigos inexistentes (eso rompería el alta de usuarios en auth); la validacion de existencia la hacen los clientes.
--  3) Corrige SOLO las filas existentes cuya version normalizada coincide con un codigo real (con respaldo para revertir).
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.normalizar_codigo_referido(p text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT CASE
   WHEN c = '' THEN NULL
   WHEN length(c) = 8 THEN left(c,3)||'-'||substr(c,4)
   ELSE c
 END
 FROM (SELECT regexp_replace(upper(coalesce(p,'')),'[^A-Z0-9]','','g') AS c) t
$$;

CREATE OR REPLACE FUNCTION public.trg_persona_normalizar_codigo_referido() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 NEW.codigo_referido_usado := public.normalizar_codigo_referido(NEW.codigo_referido_usado);
 RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS persona_normalizar_codigo_referido ON public.persona;
CREATE TRIGGER persona_normalizar_codigo_referido
 BEFORE INSERT OR UPDATE OF codigo_referido_usado ON public.persona
 FOR EACH ROW EXECUTE FUNCTION public.trg_persona_normalizar_codigo_referido();

-- Respaldo y correccion de lo ya guardado (solo si el resultado es un codigo que existe).
CREATE TABLE IF NOT EXISTS public._respaldo_018_codigo_referido AS
SELECT p.id AS id_persona, p.codigo_referido_usado AS codigo_anterior
FROM public.persona p
WHERE p.codigo_referido_usado IS NOT NULL
 AND p.codigo_referido_usado IS DISTINCT FROM public.normalizar_codigo_referido(p.codigo_referido_usado)
 AND EXISTS (SELECT 1 FROM public.codigo_referido c
             WHERE c.codigo = public.normalizar_codigo_referido(p.codigo_referido_usado));

UPDATE public.persona p SET codigo_referido_usado = public.normalizar_codigo_referido(p.codigo_referido_usado)
FROM public._respaldo_018_codigo_referido r WHERE r.id_persona = p.id;

NOTIFY pgrst,'reload schema';
COMMIT;

-- Comprobar: filas con codigo que no existe (deben quedar solo los mal digitados de verdad):
--   SELECT count(*) FROM public.persona p WHERE nullif(trim(codigo_referido_usado),'') IS NOT NULL
--   AND NOT EXISTS (SELECT 1 FROM public.codigo_referido c WHERE c.codigo = p.codigo_referido_usado);
-- Revertir:
--   DROP TRIGGER persona_normalizar_codigo_referido ON public.persona;
--   DROP FUNCTION public.trg_persona_normalizar_codigo_referido(); DROP FUNCTION public.normalizar_codigo_referido(text);
--   UPDATE public.persona p SET codigo_referido_usado=r.codigo_anterior FROM public._respaldo_018_codigo_referido r WHERE r.id_persona=p.id;
--   DROP TABLE public._respaldo_018_codigo_referido;
