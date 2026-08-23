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
// Eventos manejados:
//
//   INSERT booking con driver IS NOT NULL, booking_type = 'immediate'
//     → driver: push "Nueva reserva" (canal new-service-loop, sonido horn)
//
//   INSERT booking con driver IS NOT NULL, booking_type = 'reservation'
//     → driver: push "Servicio programado" (canal bookings-v2, sonido default)
//
//   INSERT booking con driver IS NULL, booking_type = 'reservation', status abierto
//     → FAN-OUT a conductores elegibles (en línea + vehículo activo del mismo
//       service_type): push "Nueva reserva programada" (canal driver-new-booking).
//       Reemplaza el aviso LOCAL que hacía el polling del cliente (solo foreground).
//
//   UPDATE status: * → ACCEPTED       → customer: "Conductor asignado"
//   UPDATE status: * → ARRIVED        → customer: "Tu conductor llegó"
//   UPDATE status: * → COMPLETE       → customer: "Servicio finalizado"
//
// Pendiente por complejidad geoespacial: "servicios inmediatos cerca del
// conductor" (fan-out filtrado por distancia al pickup).
//
// Notas de idempotencia: Supabase puede reintentar webhooks si la respuesta
// tarda. Si esto se vuelve un problema, agregar cheque contra
// notification_events (event_type, booking_id) antes de reenviar.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/sendPush`;

// Cliente admin (service_role) — necesario para el fan-out de reservas nuevas:
// hay que resolver qué conductores son elegibles (en línea + vehículo activo del
// mismo service_type) antes de llamar a sendPush.
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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

  const pushPayload = await decidePayload(payload);

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

async function decidePayload(evt: WebhookPayload): Promise<PushPayload | null> {
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

  // ─── INSERT reserva SIN conductor → fan-out a conductores elegibles ─────
  // Las reservas se crean PENDING y sin `driver` (pool abierto): el conductor
  // las toma desde la pantalla de reservas. Antes, el aviso lo generaba el
  // polling del cliente (notificación LOCAL), que solo corre con la app
  // abierta → no llegaba en segundo plano. Aquí lo emitimos como push real
  // (FCM) a todos los conductores en línea con vehículo activo del mismo tipo.
  if (
    evt.type === "INSERT" &&
    !record.driver &&
    record.booking_type === "reservation" &&
    esEstadoAbierto(record.status)
  ) {
    const driverIds = await getEligibleDriverIds(record.car_type ?? null);
    if (driverIds.length === 0) {
      console.log(
        "[bookingWebhookDispatcher] reserva nueva sin conductores elegibles",
        { bookingId: record.id, car_type: record.car_type },
      );
      return null;
    }
    return {
      user_ids: driverIds,
      title: "📅 Nueva reserva programada",
      body: buildDriverBody(record, "programado"),
      data: {
        type: "booking-scheduled",
        bookingId: record.id,
      },
      sound: "default",
      channelId: "driver-new-booking",
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

// Estados en los que una reserva está "abierta" (aún sin conductor, disponible
// para el pool). Coincide con el filtro del cliente (status=PENDING).
function esEstadoAbierto(status: unknown): boolean {
  const s = String(status ?? "").toUpperCase();
  return s === "PENDING" || s === "NEW";
}

// Devuelve los users.id de conductores elegibles para una reserva del car_type
// dado: en línea (driver_active_status=true) y con un vehículo activo cuyo
// service_type coincide. NO filtra por push_token — de eso se encarga sendPush
// (descarta y audita como 'skipped' los que no tengan token Expo válido).
async function getEligibleDriverIds(carType: string | null): Promise<string[]> {
  if (!carType || !String(carType).trim()) return [];

  // 1. Vehículos activos del mismo service_type (case-insensitive).
  const { data: cars, error: carsErr } = await admin
    .from("cars")
    .select("driver_id")
    .eq("is_active", true)
    .ilike("service_type", String(carType).trim());

  if (carsErr) {
    console.error("[bookingWebhookDispatcher] cars query failed:", carsErr);
    return [];
  }

  const candidateIds = [
    ...new Set(
      (cars ?? [])
        .map((c: { driver_id: string | null }) => c.driver_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (candidateIds.length === 0) return [];

  // 2. De esos, los que sean conductores en línea.
  const { data: drivers, error: driversErr } = await admin
    .from("users")
    .select("id")
    .in("id", candidateIds)
    .eq("user_type", "driver")
    .eq("driver_active_status", true);

  if (driversErr) {
    console.error("[bookingWebhookDispatcher] drivers query failed:", driversErr);
    return [];
  }

  return (drivers ?? []).map((d: { id: string }) => d.id);
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
