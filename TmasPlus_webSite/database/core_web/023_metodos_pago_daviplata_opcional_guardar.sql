-- Permite guardar Nequi / Llave Bre-b sin exigir DaviPlata.
-- DaviPlata sigue recomendado para empresariales (completo = tiene 10 dígitos),
-- pero ya no bloquea el guardado de los demás métodos.
-- Ejecutar en Supabase (SQL Editor) después de 021_conductor_metodos_pago.sql.

CREATE OR REPLACE FUNCTION public.app_conductor_metodos_pago_guardar(p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  yo uuid:=public._conductor_activo();
  dav text:=public._metodo_pago_digitos10(p_input->>'daviplata_numero');
  neq text:=public._metodo_pago_digitos10(p_input->>'nequi_numero');
  breb text:=nullif(trim(coalesce(p_input->>'nequi_breb','')),'');
  nequi boolean:=coalesce((p_input->>'nequi')::boolean,false);
  breb_activo boolean:=coalesce((p_input->>'breb_activo')::boolean,false);
  dav_ok boolean:=(dav IS NOT NULL AND length(dav)=10);
BEGIN
  -- Si escriben DaviPlata incompleto (1–9 dígitos), rechazar; vacío = OK.
  IF coalesce(nullif(regexp_replace(coalesce(p_input->>'daviplata_numero',''), '\D', '', 'g'), ''), '') <> ''
     AND NOT dav_ok THEN
    RAISE EXCEPTION 'DaviPlata: deja el campo vacio o escribe exactamente 10 digitos';
  END IF;
  IF nequi AND (neq IS NULL OR length(neq)<>10) THEN
    RAISE EXCEPTION 'Si activas Nequi, indica un numero de 10 digitos';
  END IF;
  IF breb_activo AND breb IS NULL THEN
    RAISE EXCEPTION 'Si activas la llave Bre-b, escribelas';
  END IF;
  IF NOT nequi THEN neq:=NULL; END IF;
  IF NOT breb_activo THEN breb:=NULL; END IF;
  IF NOT dav_ok THEN dav:=NULL; END IF;

  INSERT INTO public.conductor_metodo_pago AS t(
    id_persona,efectivo,daviplata,daviplata_numero,nequi,nequi_numero,nequi_breb,breb_activo)
  VALUES(yo,true,dav_ok,dav,nequi,neq,breb,breb_activo)
  ON CONFLICT (id_persona) DO UPDATE SET
    efectivo=true,
    daviplata=EXCLUDED.daviplata,
    daviplata_numero=EXCLUDED.daviplata_numero,
    nequi=EXCLUDED.nequi,
    nequi_numero=EXCLUDED.nequi_numero,
    nequi_breb=EXCLUDED.nequi_breb,
    breb_activo=EXCLUDED.breb_activo;

  RETURN public.app_conductor_metodos_pago_get();
END $$;

COMMENT ON FUNCTION public.app_conductor_metodos_pago_guardar(jsonb) IS
  'Guarda metodos del conductor. DaviPlata opcional al guardar; Nequi/Bre-b validan si estan activos.';
