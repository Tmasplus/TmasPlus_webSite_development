// bookingWebhookDispatcher — recibe eventos de la tabla `bookings` desde un
// Database Webhook de Supabase y traduce cada evento relevante en una llamada
// a la Edge Function `sendPush`.
//
// Configuración del Database Webhook (Panel Supabase → Database → Webhooks):
//   Name:     booking-events
//   Table:    bookings
//   Events:   INSERT, UPDATE
//   URL:      https://<PROJECT>.supabase.co/functions/v1/bookingWebhookDispatcher
//   Method:   POST
//   Headers:  Authorization: Bearer <SERVICE_ROLE>
//
// Eventos manejados (los 5 "simples" del entregable — el evento #3 "servicios
// cerca del conductor" queda pendiente por complejidad geoespacial):
//
//   INSERT booking con driver IS NOT NULL, booking_type = 'immediate'
//     → driver: push "Nueva reserva" (canal new-service-loop, sonido horn)
//
//   INSERT booking con driver IS NOT NULL, booking_type = 'reservation'
//     → driver: push "Servicio programado" (canal bookings-v2, sonido default)
//
//   UPDATE status: * → ACCEPTED       → customer: "Conductor asignado"
//   UPDATE status: * → ARRIVED        → customer: "Tu conductor llegó"
//   UPDATE status: * → COMPLETE       → customer: "Servicio finalizado"
//
// Notas de idempotencia: Supabase puede reintentar webhooks si la respuesta
// tarda. Si esto se vuelve un problema, agregar cheque contra
// notification_events (event_type, booking_id) antes de reenviar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/sendPush`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Shape del payload que envía Supabase Database Webhooks
interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  schema: string;
  record: Record<string, any> | null;
  old_record?: Record<string, any> | null;
}

interface PushPayload {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "horn" | "notifi" | "default";
  channelId?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Función mal configurada: faltan SUPABASE_URL / SERVICE_ROLE" }, 500);
  }

  // Autenticación: confiamos en la validación de Supabase.
  // config.toml declara verify_jwt=true, por lo que Supabase valida el JWT
  // antes de que la request llegue acá. Si llegó, es válido.
  //
  // NOTA: antes había una validación literal `token === SERVICE_ROLE_KEY`
  // que se rompía cuando Supabase migró a keys sb_secret_* — el webhook
  // manda el JWT legacy (eyJhb...) que Supabase inyecta, pero la env var
  // podía tener el formato nuevo, causando 403 en cada llamada.
  // Ver diagnóstico 2026-08-14 en net._http_response.
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Falta header Authorization" }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }

  if (payload.table !== "bookings") {
    return json({ skipped: true, reason: "table not bookings" });
  }

  const pushPayload = decidePayload(payload);

  if (!pushPayload) {
    return json({ skipped: true, reason: "no matching event" });
  }

  // Fire and forget al sendPush. Si falla, se logea en notification_events
  // por la propia sendPush.
  try {
    const res = await fetch(SEND_PUSH_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(pushPayload),
    });
    const result = await res.json();
    return json({ dispatched: true, sendPush: result });
  } catch (err) {
    console.error("[bookingWebhookDispatcher] sendPush call failed:", err);
    return json({ error: "sendPush call failed", detail: String(err) }, 500);
  }
});

function decidePayload(evt: WebhookPayload): PushPayload | null {
  const record = evt.record;
  const oldRecord = evt.old_record ?? null;

  if (!record) return null;

  // ─── INSERT con driver asignado ────────────────────────────────────────
  if (evt.type === "INSERT" && record.driver) {
    const esProgramado = record.booking_type === "reservation";

    if (esProgramado) {
      return {
        user_ids: [record.driver],
        title: "Servicio programado",
        body: buildDriverBody(record, "programado"),
        data: {
          type: "booking-scheduled",
          bookingId: record.id,
        },
        sound: "default",
        channelId: "bookings-v2",
      };
    }

    // immediate: activar loop de sonido hasta aceptar
    return {
      user_ids: [record.driver],
      title: "Nueva reserva",
      body: buildDriverBody(record, "inmediato"),
      data: {
        type: "new-service-loop",
        bookingId: record.id,
      },
      sound: "horn",
      channelId: "new-service-loop",
    };
  }

  // ─── UPDATE status → nuevos estados que notifican al customer ──────────
  if (evt.type === "UPDATE" && oldRecord && record.status !== oldRecord.status) {
    if (!record.customer) return null;

    switch (record.status) {
      case "ACCEPTED":
        return {
          user_ids: [record.customer],
          title: "Conductor asignado",
          body: buildAcceptedBody(record),
          data: {
            type: "booking-update",
            bookingId: record.id,
            newStatus: "ACCEPTED",
          },
          sound: "default",
          channelId: "bookings-v2",
        };

      case "ARRIVED":
        return {
          user_ids: [record.customer],
          title: "Tu conductor llegó",
          body: "Tu conductor está esperando en el punto de recogida",
          data: {
            type: "booking-update",
            bookingId: record.id,
            newStatus: "ARRIVED",
          },
          sound: "default",
          channelId: "bookings-v2",
        };

      case "COMPLETE":
        return {
          user_ids: [record.customer],
          title: "Servicio finalizado",
          body: buildCompleteBody(record),
          data: {
            type: "booking-update",
            bookingId: record.id,
            newStatus: "COMPLETE",
          },
          sound: "default",
          channelId: "bookings-v2",
        };

      default:
        return null;
    }
  }

  return null;
}

function buildDriverBody(record: Record<string, any>, tipo: "inmediato" | "programado"): string {
  const car = record.car_type ?? "Servicio";
  const pickup = truncate(record.pickup_address ?? "Ubicación por definir", 60);
  if (tipo === "programado") {
    const when = record.booking_date ? formatShortDate(record.booking_date) : "";
    return when ? `${car} · ${when} · ${pickup}` : `${car} · ${pickup}`;
  }
  return `${car} · ${pickup}`;
}

function buildAcceptedBody(record: Record<string, any>): string {
  const name = record.driver_name ?? "Tu conductor";
  const plate = record.plate_number ? ` · Placa ${record.plate_number}` : "";
  return `${name}${plate}`;
}

function buildCompleteBody(record: Record<string, any>): string {
  const total = record.total_cost;
  if (total == null) return "Gracias por viajar con T+Plus";
  const formatted = Number(total).toLocaleString("es-CO");
  return `Total: $${formatted}`;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    // Formato: "31 jul 14:30"
    return d.toLocaleString("es-CO", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Bogota",
    });
  } catch {
    return "";
  }
}
