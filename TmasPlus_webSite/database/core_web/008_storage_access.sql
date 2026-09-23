-- Solo permisos sobre Storage existente. NO crea buckets ni cambia su privacidad.
BEGIN;
CREATE OR REPLACE FUNCTION public.web_storage_owner(p_name text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.persona p LEFT JOIN public.perfil_conductor d ON d.id_persona=p.id
  WHERE p.auth_id=auth.uid() AND (NOT p.bloqueado OR d.aprobado=false)
  AND ((public.es_admin() AND NOT p.bloqueado)
   OR split_part(p_name,'/',1) IN (p.id::text,p.auth_id::text)
   OR EXISTS (SELECT 1 FROM public.vehiculo v WHERE v.id_conductor=p.id AND v.id::text=split_part(p_name,'/',1)))
 )
$$;
REVOKE ALL ON FUNCTION public.web_storage_owner(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_storage_owner(text) TO authenticated;
DROP POLICY IF EXISTS web_core_storage_read ON storage.objects;
CREATE POLICY web_core_storage_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));
DROP POLICY IF EXISTS web_core_storage_insert ON storage.objects;
CREATE POLICY web_core_storage_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));
DROP POLICY IF EXISTS web_core_storage_update ON storage.objects;
CREATE POLICY web_core_storage_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name))
WITH CHECK (bucket_id IN ('driver-documents','vehicle-documents','car-images','user-profiles','user-documents','booking-media','public-site-assets') AND public.web_storage_owner(name));
COMMIT;
