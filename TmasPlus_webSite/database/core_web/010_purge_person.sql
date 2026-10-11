-- Ejecutar despues de 009. NO aplicado: entregar a quien despliega core y PROBAR PRIMERO EN UNA RAMA/COPIA.
-- Borrado PERMANENTE de una persona y todo lo que cuelga de ella (viajes, tracking, snapshots, calificaciones,
-- documentos, vehiculos, tokens push, notificaciones, etc.). Descubre las FK dinamicamente (pg_constraint) y borra
-- hijos antes que padres, en UNA transaccion: si algo falla, no queda nada a medias.
-- Uso desde la web (Edge Function core-delete-user con permanent=true):
--   1) web_purge_person(id, true)  -> dry-run: devuelve cuantas filas se borrarian por tabla y revierte.
--   2) web_purge_person(id, false) -> borra de verdad. Despues la Edge Function elimina el usuario de auth.users.
-- Salvaguardas: solo admin; no a si mismo; no a administradores; no si tiene viajes activos.
-- AVISO: los viajes de la persona se borran tambien para la otra parte (cliente/conductor): decision de producto.
-- AVISO: si hay triggers DELETE sobre reserva/otras tablas que envien PUSH, se dispararian; revisar antes de aplicar.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public._web_purge_rows(p_rel regclass,p_where text,p_path oid[],p_counts jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE fk record; cc text; pc text; n bigint;
BEGIN
 IF coalesce(array_length(p_path,1),0)>8 THEN RAISE EXCEPTION 'Cadena de FK demasiado profunda en %',p_rel; END IF;
 FOR fk IN SELECT c.conrelid,c.conkey,c.confkey FROM pg_constraint c WHERE c.contype='f' AND c.confrelid=p_rel LOOP
  SELECT string_agg(format('%I',a.attname),',' ORDER BY k.ord) INTO cc
   FROM unnest(fk.conkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.attnum;
  SELECT string_agg(format('%I',a.attname),',' ORDER BY k.ord) INTO pc
   FROM unnest(fk.confkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=p_rel AND a.attnum=k.attnum;
  IF fk.conrelid=p_rel THEN
   -- Auto-referencia (p. ej. referido por otra persona): NO se borra a la otra persona, solo se desvincula.
   EXECUTE format('UPDATE %s SET %s WHERE (%s) IN (SELECT %s FROM %s WHERE %s)',
    p_rel,(SELECT string_agg(format('%I=NULL',a.attname),',') FROM unnest(fk.conkey) k(attnum) JOIN pg_attribute a ON a.attrelid=fk.conrelid AND a.attnum=k.attnum),
    cc,pc,p_rel,p_where);
  ELSIF fk.conrelid=ANY(p_path) THEN
   RAISE EXCEPTION 'Ciclo de FK entre % y %',p_rel,fk.conrelid::regclass;
  ELSE
   p_counts:=public._web_purge_rows(fk.conrelid,format('(%s) IN (SELECT %s FROM %s WHERE %s)',cc,pc,p_rel,p_where),p_path||p_rel::oid,p_counts);
  END IF;
 END LOOP;
 EXECUTE format('DELETE FROM %s WHERE %s',p_rel,p_where);
 GET DIAGNOSTICS n=ROW_COUNT;
 IF n>0 THEN
  p_counts:=jsonb_set(p_counts,ARRAY[p_rel::text],to_jsonb(coalesce((p_counts->>p_rel::text)::bigint,0)+n));
 END IF;
 RETURN p_counts;
END $$;

CREATE OR REPLACE FUNCTION public.web_purge_person(p_id uuid,p_dry_run boolean DEFAULT true) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE p public.persona%rowtype; counts jsonb:='{}'::jsonb;
BEGIN
 PERFORM public.web_require_admin();
 SELECT * INTO p FROM public.persona WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
 IF p.auth_id IS NOT NULL AND p.auth_id=auth.uid() THEN RAISE EXCEPTION 'No puede eliminar su propia cuenta de administrador'; END IF;
 IF EXISTS(SELECT 1 FROM public.persona_rol WHERE id_persona=p_id AND rol IN ('admin','empresa')) THEN
  RAISE EXCEPTION 'No se puede eliminar permanentemente a un administrador o una empresa desde aqui'; END IF;
 IF EXISTS(SELECT 1 FROM public.reserva WHERE (id_cliente=p_id OR id_conductor=p_id)
  AND estado IN ('NEW','PENDING','ACCEPTED','ARRIVED','STARTED','REACHED'))
 THEN RAISE EXCEPTION 'VIAJE_ACTIVO: el usuario tiene un viaje en curso. Debe finalizarlo antes de eliminarlo.'; END IF;
 IF p_dry_run THEN
  BEGIN
   counts:=public._web_purge_rows('public.persona'::regclass,format('id=%L',p_id),ARRAY[]::oid[],counts);
   RAISE EXCEPTION 'dry-run' USING ERRCODE='DR001';
  EXCEPTION WHEN SQLSTATE 'DR001' THEN
   -- Los cambios de BD se revierten; la variable local `counts` conserva los conteos.
   NULL;
  END;
 ELSE
  counts:=public._web_purge_rows('public.persona'::regclass,format('id=%L',p_id),ARRAY[]::oid[],counts);
 END IF;
 RETURN jsonb_build_object('auth_id',p.auth_id,'dry_run',p_dry_run,'counts',counts);
END $$;

REVOKE ALL ON FUNCTION public._web_purge_rows(regclass,text,oid[],jsonb),public.web_purge_person(uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.web_purge_person(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
