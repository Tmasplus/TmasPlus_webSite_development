-- Push Notifications — schema base
--
-- Contexto: el sistema no notifica al conductor/cliente cuando ocurre un
-- evento del servicio (nuevo booking, cambio de estado). Diseño documentado
-- en LLMWIKITmasPlus/WIKI/31-push-notifications-edge-function.md y en
-- plan-notificaciones-AplicacionWebTmasplus.md.
--
-- Esta migración agrega solo las columnas mínimas + auditoría de eventos
-- transaccionales para los 5 eventos "simples":
--   - INSERT booking con driver asignado (immediate)
--   - INSERT booking con driver asignado (reservation)
--   - UPDATE status → ACCEPTED
--   - UPDATE status → ARRIVED
--   - UPDATE status → COMPLETE
--
-- La tabla campaigns/campaign_deliveries (marketing) se agrega en migración
-- separada cuando se aborde ese frente.

-- ─── users: metadata del push token ────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS push_platform TEXT
    CHECK (push_platform IN ('ios', 'android')),
  ADD COLUMN IF NOT EXISTS push_device_model TEXT,
  ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ;

-- Índice para consultas rápidas del dispatcher: "driver activo con push_token
-- válido para plataforma X". Parcial para no indexar filas sin token.
CREATE INDEX IF NOT EXISTS idx_users_push_active
  ON public.users (push_platform, user_type, driver_active_status)
  WHERE push_token IS NOT NULL;

-- ─── notification_events: auditoría de push transaccionales ────────────────
-- Cada envío exitoso o fallido queda registrado para poder debuggear
-- reclamos ("no me llegó la notificación de que llegó el conductor") y
-- generar métricas de entregabilidad.
CREATE TABLE IF NOT EXISTS public.notification_events (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,
    -- 'new-service-loop' | 'booking-scheduled' | 'booking-update'
    -- | 'booking-taken' | 'tracking_gap' | otros futuros
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  title TEXT,
  body TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status VARCHAR(20) NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'delivered', 'failed', 'not_registered', 'skipped')),
  expo_receipt_id TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notification_events_user_time
  ON public.notification_events (user_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_events_booking
  ON public.notification_events (booking_id)
  WHERE booking_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_events_type_time
  ON public.notification_events (event_type, sent_at DESC);

-- RLS: usuarios leen solo eventos propios. Admin/service_role lee todo.
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own notification events"
  ON public.notification_events
  FOR SELECT
  USING (user_id = auth.uid());

-- Los inserts los hace la Edge Function con service_role, no requieren
-- policy pública. Si en el futuro queremos que el móvil inserte (ej. click
-- tracking), agregar policy INSERT WITH CHECK (user_id = auth.uid()).

-- ─── Comentarios documentales ──────────────────────────────────────────────
COMMENT ON COLUMN public.users.push_platform IS
  'Plataforma del último dispositivo que registró push_token: ios | android';

COMMENT ON COLUMN public.users.push_device_model IS
  'Modelo del dispositivo (Device.modelName de expo-device). Útil para debugging por marca/modelo';

COMMENT ON COLUMN public.users.push_token_updated_at IS
  'Última vez que push_token fue re-registrado. Detectar tokens stale > 90 días';

COMMENT ON TABLE public.notification_events IS
  'Auditoría de push notifications transaccionales enviadas. Ver Edge Function sendPush.';
