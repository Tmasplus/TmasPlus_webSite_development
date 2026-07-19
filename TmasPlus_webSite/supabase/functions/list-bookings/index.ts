import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Lee reservas en la BD secundaria (App) con SERVICE ROLE.
//
// El dashboard se autentica contra el proyecto PRIMARIO. Ese JWT no es valido
// para consultar el proyecto secundario cuando RLS esta activo, asi que un
// select directo desde el navegador llega como anon y puede devolver [] sin
// error. Aqui validamos el token primario y leemos con service role.

const SECONDARY_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECONDARY_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PRIMARY_URL = Deno.env.get("PRIMARY_SUPABASE_URL") ?? "";
const PRIMARY_ANON_KEY = Deno.env.get("PRIMARY_SUPABASE_ANON_KEY") ?? "";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-platform, x-app-environment",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

interface ListBookingsBody {
  query?: string;
  limit?: number;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_SERVICE_ROLE) {
    return json({ error: "Funcion mal configurada: faltan credenciales del proyecto secundario" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY) {
    return json({ error: "Funcion mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorizacion" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token invalido o expirado" }, 401);
  }

  let body: ListBookingsBody = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const q = body.query?.trim();
  const limit = Math.min(Math.max(Number(body.limit) || 1000, 1), 1000);

  let request = admin
    .from("bookings")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (q) {
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);
    request = isUuid
      ? request.or(`id.eq.${q},reference.eq.${q}`)
      : request.or(`reference.eq.${q},reference.ilike.%${q}%`);
  }

  const { data, error } = await request;
  if (error) {
    return json({ error: `Error al obtener reservas: ${error.message}` }, 500);
  }

  const bookings = (data ?? []) as Array<Record<string, unknown>>;

  // Adjunta el historial de snapshots del ciclo de vida del servicio
  // (service_data_snapshots) a cada reserva. La tabla vive en el proyecto
  // secundario con RLS, asi que solo es legible con service role desde aqui;
  // el navegador no puede leerla directamente (igual que bookings).
  const ids = bookings.map((b) => b.id).filter(Boolean) as string[];
  if (ids.length) {
    const byBooking = new Map<string, Array<Record<string, unknown>>>();
    let snapshotsOk = true;

    // Se consulta por lotes: un .in() con ~1000 UUIDs genera una URL enorme que
    // PostgREST rechaza con 400 (mismo problema visto en categoriesByDriver).
    const CHUNK = 150;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const { data: snaps, error: snapErr } = await admin
        .from("service_data_snapshots")
        .select(
          "id, booking_id, stage, captured_at, driver_id, customer_id, location_lat, location_lng, distance_km, duration_seconds, price_calculated, raw_data, created_at"
        )
        .in("booking_id", chunk)
        .order("captured_at", { ascending: true });

      if (snapErr) {
        snapshotsOk = false;
        break;
      }
      for (const s of (snaps ?? []) as Array<Record<string, unknown>>) {
        const key = String(s.booking_id);
        const arr = byBooking.get(key) ?? [];
        arr.push(s);
        byBooking.set(key, arr);
      }
    }

    // Un fallo leyendo snapshots no debe romper el listado de reservas.
    for (const b of bookings) {
      b.service_data_snapshots = snapshotsOk ? byBooking.get(String(b.id)) ?? [] : [];
    }
  }

  return json({ success: true, bookings });
});
