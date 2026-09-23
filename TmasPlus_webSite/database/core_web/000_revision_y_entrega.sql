-- ENTREGA WEB -> APLICACIONCORE (zvplcamcyldcquxqnftb).
-- Este archivo SOLO CONSULTA. No crea datos ni envia notificaciones.
-- 1. Confirmar proyecto en Dashboard y tomar respaldo antes de instalar.
-- 2. Revisar resultados de abajo, especialmente buckets y URLs externas.
-- 3. Ejecutar instalar_core_web.sql (incluye 001 a 008, en UNA transaccion).
--    No ejecutar tambien los archivos individuales. Ante error, todo revierte.
--    No ejecutar el dump schema_aplicacioncore.sql ni antiguos SQL de prueba.
-- 4. Desplegar desde este repositorio, siempre con destino explicito:
--    npx supabase functions deploy core-create-user --project-ref zvplcamcyldcquxqnftb
--    npx supabase functions deploy core-invite-user --project-ref zvplcamcyldcquxqnftb
--    npx supabase functions deploy core-complaint-response --project-ref zvplcamcyldcquxqnftb
--    Secrets propios de core: SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY (automaticos),
--    CORE_WEB_URL (https://DOMINIO/update-password, permitida en Auth),
--    RESEND_API_KEY y CORE_EMAIL_FROM (remitente verificado).
--    Nunca poner service-role, RESEND_API_KEY ni claves privadas en VITE_*.
-- 5. Web: .env.local.example + ANON/public key DE CORE + Google Maps browser key.
-- 6. Probar con cuentas autorizadas: login, altas, documentos, categorias,
--    reservas/asignacion/cancelacion, membresias, referidos, quejas y mapa.
--    Reservas y aprobaciones conservan los triggers REALES de core.
--    Envio masivo es real: no probar con audiencias reales sin autorizacion.
--    'queued' en notificaciones NO confirma entrega; no hay reintento automatico.
-- No se crean tablas ni se eliminan datos; las vistas web_* usan tablas core.
-- No se migran archivos de otros proyectos automaticamente: requieren copia
-- controlada por el propietario y actualizacion de sus referencias.

SELECT current_database(),current_user,version();
SELECT name,to_regclass('public.'||name) IS NOT NULL AS existe FROM unnest(ARRAY[
 'persona','perfil_conductor','perfil_cliente','perfil_empresa','persona_rol',
 'reserva','vehiculo','reserva_tracking','reserva_snapshot','categoria_vehiculo',
 'documento_persona','documento_vehiculo','codigo_referido','referido','membresia',
 'queja','dispositivo_push','evento_notificacion','users','cars','bookings']) name;
SELECT expected.id, b.id IS NOT NULL AS existe,b.public,b.file_size_limit,b.allowed_mime_types
FROM unnest(ARRAY['driver-documents','vehicle-documents','car-images','user-profiles',
 'user-documents','booking-media','public-site-assets']) expected(id)
LEFT JOIN storage.buckets b ON b.id=expected.id;
-- Solo conteos; no expone URLs firmadas ni datos personales.
SELECT origen,count(*) AS referencias_externas FROM (
 SELECT 'documento_persona' AS origen,storage_path AS ref FROM public.documento_persona
 UNION ALL SELECT 'documento_vehiculo',storage_path FROM public.documento_vehiculo
 UNION ALL SELECT 'persona.imagen_perfil',imagen_perfil FROM public.persona
 UNION ALL SELECT 'vehiculo.foto_1',foto_1 FROM public.vehiculo
 UNION ALL SELECT 'vehiculo.foto_2',foto_2 FROM public.vehiculo
) refs WHERE ref ~ '^https?://' AND ref NOT LIKE 'https://zvplcamcyldcquxqnftb.supabase.co/%' GROUP BY origen;
SELECT extname FROM pg_extension WHERE extname='pg_net';
SELECT tablename,policyname,cmd FROM pg_policies WHERE schemaname IN ('public','storage') ORDER BY tablename,policyname;
