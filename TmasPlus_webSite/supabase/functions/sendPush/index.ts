// sendPush — envía notificaciones push al Expo Push Service.
//
// Interfaz canónica del sistema de notificaciones T+Plus. Llamada desde:
//   - bookingWebhookDispatcher (eventos transaccionales de bookings)
//   - dispatchCampaign (marketing, cuando se implemente)
//   - dispatchScheduledCampaigns (programadas, cuando se implemente)
//
// Contrato:
//   POST /functions/v1/sendPush
//   Authorization: Bearer <SERVICE_ROLE>
//   Body: {
//     user_ids: string[],       // ids de users.id
//     title: string,
//     body: string,
//     data?: { type?: string, bookingId?: string, ... },
//     sound?: 'horn' | 'notifi' | 'default',
//     channelId?: string        // canal Android (bookings-v2, new-service-loop, campaigns)
//   }
//   Response: { sent: N, failed: N, cleaned: N }
//
// Diseño detallado en LLMWIKITmasPlus/WIKI/31-push-notifications-edge-function.md

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

// Batch máximo del Expo Push API (documentado). Enviar más en un solo request
// devuelve error 400. Chunkear al enviar.
const EXPO_BATCH_SIZE = 100;
// Pausa entre chunks para no gatillar rate limit (heurístico conservador).
const INTER_BATCH_DELAY_MS = 500;

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

interface SendPushBody {
  user_ids: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "horn" | "notifi" | "default";
  channelId?: string;
}

interface UserRow {
  id: string;
  push_token: string | null;
  push_platform: string | null;
}

// Expo Push API: shape del ticket devuelto por chunk.
interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "Función mal configurada: faltan SUPABASE_URL / SERVICE_ROLE" }, 500);
  }

  // Autenticación: solo service_role. El móvil NO debe llamar directo — esta
  // función la invocan Edge Functions internas (dispatcher, campañas).
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);
  if (token !== SERVICE_ROLE_KEY) {
    return json({ error: "Solo service_role puede invocar sendPush" }, 403);
  }

  let payload: SendPushBody;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Body inválido (JSON esperado)" }, 400);
  }

  const { user_ids, title, body, data, sound, channelId } = payload;

  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return json({ error: "user_ids debe ser array no vacío" }, 400);
  }
  if (!title || !body) {
    return json({ error: "title y body son requeridos" }, 400);
  }

  // 1. Traer tokens válidos
  const { data: users, error: usersErr } = await admin
    .from("users")
    .select("id, push_token, push_platform")
    .in("id", user_ids)
    .not("push_token", "is", null);

  if (usersErr) {
    console.error("[sendPush] users query failed:", usersErr);
    return json({ error: "No se pudieron cargar los tokens" }, 500);
  }

  // Filtrar tokens con formato Expo válido. Descartar el resto (probablemente
  // tokens legacy FCM sin migrar, o valores basura tipo 'token_error').
  const eligibleUsers = (users || []).filter((u: UserRow) =>
    typeof u.push_token === "string" &&
    u.push_token.startsWith("ExponentPushToken[")
  );

  if (eligibleUsers.length === 0) {
    console.warn("[sendPush] ningún user tenía push_token válido");
    // Registrar como skipped para auditoría
    await recordSkipped(user_ids, data);
    return json({ sent: 0, failed: 0, cleaned: 0, skipped: user_ids.length });
  }

  const soundValue =
    sound === "horn" ? "horn.wav"
    : sound === "notifi" ? "notifi.mpeg"
    : "default";

  const messages = eligibleUsers.map((u: UserRow) => ({
    to: u.push_token,
    title,
    body,
    data: data ?? {},
    sound: soundValue,
    channelId,
    priority: "high" as const,   // Wake up device en Doze mode
    _internal_userId: u.id,      // extra, no lo enviamos a Expo — se filtra abajo
  }));

  // 2. Chunking + envío a Expo
  const chunks = chunk(messages, EXPO_BATCH_SIZE);
  const allTickets: Array<{ userId: string; ticket: ExpoTicket }> = [];
  let failedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    // Filtrar campo interno antes de enviar
    const wireBody = c.map(({ _internal_userId, ...rest }) => rest);

    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify(wireBody),
      });
      const jsonRes = await res.json();
      const tickets: ExpoTicket[] = jsonRes?.data ?? [];

      // Cada ticket corresponde 1:1 con el mensaje enviado (mismo orden)
      c.forEach((msg, idx) => {
        const ticket = tickets[idx] ?? { status: "error", message: "sin ticket" };
        allTickets.push({ userId: msg._internal_userId, ticket });
        if (ticket.status === "error") failedCount++;
      });
    } catch (err) {
      console.error("[sendPush] chunk failed:", err);
      c.forEach((msg) => {
        allTickets.push({
          userId: msg._internal_userId,
          ticket: { status: "error", message: String(err) },
        });
        failedCount++;
      });
    }

    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  // 3. Cleanup: si Expo dice DeviceNotRegistered, borrar el push_token.
  // El próximo login del user re-registra un token nuevo.
  const toCleanUserIds = allTickets
    .filter((t) => t.ticket.status === "error" &&
      t.ticket.details?.error === "DeviceNotRegistered")
    .map((t) => t.userId);

  let cleanedCount = 0;
  if (toCleanUserIds.length > 0) {
    const { error: cleanErr, count } = await admin
      .from("users")
      .update({ push_token: null })
      .in("id", toCleanUserIds);
    if (cleanErr) {
      console.error("[sendPush] cleanup failed:", cleanErr);
    } else {
      cleanedCount = count ?? toCleanUserIds.length;
    }
  }

  // 4. Auditoría — registrar cada envío en notification_events
  const eventType = String(data?.type ?? "unknown");
  const bookingId = (data?.bookingId ?? data?.booking_id ?? null) as string | null;

  const auditRows = allTickets.map((t) => ({
    user_id: t.userId,
    event_type: eventType,
    booking_id: bookingId,
    title,
    body,
    status:
      t.ticket.status === "ok" ? "sent"
      : t.ticket.details?.error === "DeviceNotRegistered" ? "not_registered"
      : "failed",
    expo_receipt_id: t.ticket.id ?? null,
    error_message:
      t.ticket.status === "error"
        ? (t.ticket.message ?? t.ticket.details?.error ?? "unknown error")
        : null,
  }));

  if (auditRows.length > 0) {
    const { error: auditErr } = await admin
      .from("notification_events")
      .insert(auditRows);
    if (auditErr) {
      // No fatal — el push ya se envió. Solo logeamos.
      console.warn("[sendPush] audit insert failed:", auditErr);
    }
  }

  // Usuarios que quedaron fuera por no tener push_token válido
  const skippedCount = user_ids.length - eligibleUsers.length;
  if (skippedCount > 0) {
    await recordSkipped(
      user_ids.filter((id) => !eligibleUsers.some((u: UserRow) => u.id === id)),
      data,
      title,
      body,
    );
  }

  return json({
    sent: eligibleUsers.length - failedCount,
    failed: failedCount,
    cleaned: cleanedCount,
    skipped: skippedCount,
  });
});

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function recordSkipped(
  userIds: string[],
  data?: Record<string, unknown>,
  title?: string,
  body?: string,
) {
  if (userIds.length === 0) return;
  const eventType = String(data?.type ?? "unknown");
  const bookingId = (data?.bookingId ?? data?.booking_id ?? null) as string | null;

  try {
    await admin.from("notification_events").insert(
      userIds.map((id) => ({
        user_id: id,
        event_type: eventType,
        booking_id: bookingId,
        title: title ?? null,
        body: body ?? null,
        status: "skipped",
        error_message: "user sin push_token válido",
      })),
    );
  } catch (e) {
    console.warn("[sendPush] audit skipped failed:", e);
  }
}
