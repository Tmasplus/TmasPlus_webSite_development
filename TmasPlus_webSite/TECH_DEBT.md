# Mejoras pendientes

## Alta prioridad

- Unificar Supabase Auth y datos para eliminar puentes con `service_role`.
- Migrar completamente reservas y la app móvil a `booking_v2`.
- Revisar autorización por rol y validación de payloads en todas las Edge Functions.
- Depurar duplicados de usuarios, documentos, vehículos y placas; agregar restricciones únicas acordadas.

## Prioridad media

- Reducir Edge Functions de usuarios a RPC + RLS; conservar Edge solo para secretos e integraciones externas.
- Retirar columnas, políticas, triggers y funciones heredadas de `public.bookings` después de migrar los datos.
- Centralizar lógica compartida de autenticación, errores y permisos mientras existan Edge Functions.
- Definir una sola fuente de rutas y tarifas para web y app; configurar Mapbox en todos los ambientes.

## Prioridad baja

- Añadir paginación y selección explícita de columnas en listados administrativos.
- Reemplazar eliminación física de reservas por archivado, salvo datos de prueba.
