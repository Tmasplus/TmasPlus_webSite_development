# Documentación de Arquitectura: Automatización de Correos y Aprobaciones

Este documento detalla el flujo de trabajo automatizado para la aprobación de conductores y el envío de correos transaccionales (Código de Referido) utilizando Supabase y la API de Resend.

## 1. Arquitectura del Flujo (End-to-End)

La arquitectura sigue un modelo de eventos basado en el servidor (Event-Driven Architecture) para garantizar máxima seguridad y evitar exponer credenciales en el Frontend.

1. **Frontend (React):** El administrador hace clic en "Aprobar" en el `DriverReviewModal.tsx`.
2. **Backend (PostgreSQL):** La base de datos actualiza el campo `approved` de `false` a `true` en la tabla `public.users`.
3. **Trigger / Webhook:** Un Database Webhook de Supabase escucha este cambio de estado (UPDATE) e invoca la Edge Function.
4. **Edge Function (Deno):** Recibe el payload, consulta el código de referido del conductor, ensambla la plantilla HTML y se comunica con Resend.
5. **Servidor de Correos (Resend):** Despacha el correo a la bandeja de entrada del conductor.

## 2. Componentes del Sistema

### A. Frontend (Panel Administrativo)
* **`DriversPage.tsx`**: Panel principal con filtros (estado, referidos) y buscador.
* **`DriverReviewModal.tsx`**: Modal que genera URLs firmadas (SecureDocumentLink) para ver documentos en Buckets Privados y envía la orden de actualización (`DriversService.approveDriver`).

### B. Base de Datos (Supabase PostgreSQL)
* **Tabla `users`**: Almacena el perfil. Requiere la configuración `ALTER TABLE public.users REPLICA IDENTITY FULL;` para que el Webhook pueda comparar el estado anterior (`old_record`) con el nuevo (`record`).
* **Tabla `referral_codes`**: Tabla vinculada donde el Trigger `handle_new_user` o la lógica de negocio inserta el código único del conductor.

### C. Webhooks (El Gatillo)
* **Nombre:** `trigger_approval_email`
* **Tabla:** `public.users`
* **Eventos:** Solo `UPDATE`.
* **Destino:** Supabase Edge Function (`send-approval-email`).

### D. Edge Functions
* Escrita en **TypeScript (Deno)**.
* Validaciones de seguridad: Solo se ejecuta si `isNowApproved === true`, `wasPreviouslyApproved === false` y el `user_type === 'driver'`.
* Utiliza el secreto `RESEND_API_KEY` almacenado en la bóveda de Supabase (Vault).

## 3. Limitaciones del Plan Gratuito (Resend) y Escalabilidad

Actualmente, el sistema opera bajo el **Plan FREE de Resend**, el cual tiene restricciones estrictas para evitar el Spam. El equipo de administración debe tener en cuenta los siguientes límites operativos:

* **Límite Diario:** Máximo **100 correos por día**. *(No se deben aprobar más de 100 conductores en un periodo de 24 horas, de lo contrario los correos a partir del 101 fallarán o se encolarán).*
* **Límite Mensual:** Máximo **3,000 correos al mes**.
* **Restricción de Dominio (Desarrollo):** Sin un dominio verificado, Resend solo permite enviar correos a la cuenta registrada en el panel de Resend. Para enviar a correos reales de usuarios (Gmail, Hotmail, etc.), es **obligatorio verificar el dominio de la empresa (tmasplus.com)** agregando los registros DNS correspondientes.

*Nota de Escalabilidad:* Cuando la operación supere los 100 registros diarios, se deberá hacer el upgrade al plan Pro de Resend ($20 USD/mes) para habilitar 50,000 envíos sin límite diario estricto.