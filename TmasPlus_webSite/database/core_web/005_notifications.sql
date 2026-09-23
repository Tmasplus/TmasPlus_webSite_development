-- Cola pg_net y auditoria existentes. No crea tablas. queued NO confirma entrega.
BEGIN;
CREATE OR REPLACE VIEW public.web_push_history WITH (security_invoker=true) AS
SELECT tipo_evento AS request_id,titulo AS title,cuerpo AS body,estado AS status,
 count(*) AS recipients,min(enviado_en) AS created_at FROM public.evento_notificacion
WHERE tipo_evento LIKE 'web:%' AND public.es_admin() GROUP BY tipo_evento,titulo,cuerpo,estado;
REVOKE ALL ON public.web_push_history FROM anon;
GRANT SELECT ON public.web_push_history TO authenticated;
CREATE OR REPLACE FUNCTION public.web_send_mass_push(p_request_id uuid,p_title text,p_body text,
 p_audience text,p_platform text) RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE tag text:='web:'||p_request_id::text; n integer:=0; messages jsonb:='[]'; device record;
BEGIN
 PERFORM public.web_require_admin();
 IF p_request_id IS NULL OR coalesce(length(trim(p_title)),0) NOT BETWEEN 1 AND 100
 OR coalesce(length(trim(p_body)),0) NOT BETWEEN 1 AND 1000
 OR p_audience IS NULL OR p_audience NOT IN ('driver','customer')
 OR p_platform IS NULL OR p_platform NOT IN ('ALL','ANDROID','IOS') THEN RAISE EXCEPTION 'Notificacion invalida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tag,0));
 SELECT count(*) INTO n FROM public.evento_notificacion WHERE tipo_evento=tag;
 IF n>0 THEN
  IF EXISTS(SELECT 1 FROM public.evento_notificacion WHERE tipo_evento=tag AND (titulo<>trim(p_title) OR cuerpo<>trim(p_body)))
  THEN RAISE EXCEPTION 'Identificador ya utilizado'; END IF;
  RETURN n;
 END IF;
 FOR device IN SELECT dp.* FROM public.dispositivo_push dp JOIN public.persona p ON p.id=dp.id_persona
  WHERE NOT p.bloqueado AND dp.push_token ~ '^(ExponentPushToken|ExpoPushToken)\[[^]]+\]$'
  AND (p_platform='ALL' OR upper(dp.plataforma::text)=p_platform)
  AND EXISTS(SELECT 1 FROM public.persona_rol pr WHERE pr.id_persona=p.id
   AND pr.rol::text=CASE p_audience WHEN 'driver' THEN 'conductor' ELSE 'cliente' END) ORDER BY dp.id
 LOOP
  n:=n+1;
  IF n>10000 THEN RAISE EXCEPTION 'Mas de 10000 dispositivos: requiere segmentar'; END IF;
  -- Es el canal Android de la app; no es una dependencia del esquema SQL retirado.
  messages:=messages||jsonb_build_array(jsonb_build_object('to',device.push_token,'title',trim(p_title),
   'body',trim(p_body),'sound','default','channelId','bookings-v2','priority','high',
   'data',jsonb_build_object('type','announcement','requestId',p_request_id)));
  INSERT INTO public.evento_notificacion(id_persona,tipo_evento,titulo,cuerpo,estado)
  VALUES(device.id_persona,tag,trim(p_title),trim(p_body),'queued');
  IF jsonb_array_length(messages)=100 THEN
   PERFORM net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=messages,headers:='{"Content-Type":"application/json"}'::jsonb);
   messages:='[]';
  END IF;
 END LOOP;
 IF jsonb_array_length(messages)>0 THEN
  PERFORM net.http_post(url:='https://exp.host/--/api/v2/push/send',body:=messages,headers:='{"Content-Type":"application/json"}'::jsonb);
 END IF;
 RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.web_send_mass_push(uuid,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.web_send_mass_push(uuid,text,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
