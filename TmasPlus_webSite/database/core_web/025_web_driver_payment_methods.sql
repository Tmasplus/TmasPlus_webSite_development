-- 025: metodos de pago del conductor visibles y editables desde la web (admin).
-- Cambios: vista public.web_driver_payment_methods (lectura) y RPC
--   public.web_set_driver_payment_methods(p_id, p_input) (escritura, solo admin).
-- No modifica tablas ni columnas; usa public.conductor_metodo_pago (024 ya aplicada: breb_activo).
-- Lectura: security_invoker; la politica p_conductor_metodo_pago_select ya permite es_admin().
-- Escritura: la politica ALL solo permite la fila propia, por eso la RPC es SECURITY DEFINER,
--   protegida por web_require_admin() y con las MISMAS reglas que app_conductor_metodos_pago_guardar.
-- Verificacion: SELECT count(*) FROM public.web_driver_payment_methods;  (como admin)
-- Reversion: DROP FUNCTION public.web_set_driver_payment_methods(uuid,jsonb);
--   DROP VIEW public.web_driver_payment_methods;
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE VIEW public.web_driver_payment_methods WITH (security_invoker=true) AS
SELECT m.id_persona AS id, m.efectivo, m.daviplata, m.daviplata_numero,
       m.nequi, m.nequi_numero, m.nequi_breb, m.breb_activo
  FROM public.conductor_metodo_pago m;

CREATE OR REPLACE FUNCTION public.web_set_driver_payment_methods(p_id uuid, p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
 dav text := public._metodo_pago_digitos10(p_input->>'daviplata_numero');
 neq text := public._metodo_pago_digitos10(p_input->>'nequi_numero');
 breb text := nullif(trim(coalesce(p_input->>'nequi_breb','')),'');
 v_nequi boolean := coalesce((p_input->>'nequi')::boolean,false);
 v_breb_activo boolean := coalesce((p_input->>'breb_activo')::boolean,false);
 dav_ok boolean := (dav IS NOT NULL AND length(dav)=10);
BEGIN
 PERFORM public.web_require_admin();
 IF NOT EXISTS (SELECT 1 FROM public.perfil_conductor WHERE id_persona=p_id) THEN
  RAISE EXCEPTION 'Conductor sin perfil de conductor';
 END IF;
 IF coalesce(nullif(regexp_replace(coalesce(p_input->>'daviplata_numero',''),'\D','','g'),''),'')<>''
    AND NOT dav_ok THEN
  RAISE EXCEPTION 'DaviPlata: deja el campo vacio o escribe exactamente 10 digitos';
 END IF;
 IF v_nequi AND (neq IS NULL OR length(neq)<>10) THEN
  RAISE EXCEPTION 'Si activas Nequi, indica un numero de 10 digitos';
 END IF;
 IF v_breb_activo AND breb IS NULL THEN
  RAISE EXCEPTION 'Si activas la llave Bre-b, escribela';
 END IF;
 IF NOT v_nequi THEN neq:=NULL; END IF;
 IF NOT v_breb_activo THEN breb:=NULL; END IF;
 IF NOT dav_ok THEN dav:=NULL; END IF;

 INSERT INTO public.conductor_metodo_pago AS t
  (id_persona,efectivo,daviplata,daviplata_numero,nequi,nequi_numero,nequi_breb,breb_activo)
 VALUES (p_id,true,dav_ok,dav,v_nequi,neq,breb,v_breb_activo)
 ON CONFLICT (id_persona) DO UPDATE SET
  efectivo=true,
  daviplata=EXCLUDED.daviplata,
  daviplata_numero=EXCLUDED.daviplata_numero,
  nequi=EXCLUDED.nequi,
  nequi_numero=EXCLUDED.nequi_numero,
  nequi_breb=EXCLUDED.nequi_breb,
  breb_activo=EXCLUDED.breb_activo,
  actualizado_en=now();

 RETURN jsonb_build_object('efectivo',true,'daviplata',dav_ok,'daviplata_numero',dav,
  'nequi',v_nequi,'nequi_numero',neq,'nequi_breb',breb,'breb_activo',v_breb_activo);
END $$;

REVOKE ALL ON public.web_driver_payment_methods FROM PUBLIC,anon;
GRANT SELECT ON public.web_driver_payment_methods TO authenticated;
REVOKE ALL ON FUNCTION public.web_set_driver_payment_methods(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_set_driver_payment_methods(uuid,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
