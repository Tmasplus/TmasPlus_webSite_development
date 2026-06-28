import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Crea una reserva en la BD secundaria (App) con SERVICE ROLE.
//
// Por qué existe esta función:
// El dashboard se autentica contra el proyecto PRIMARIO. Ese JWT NO es válido
// para el proyecto secundario (distinto auth server / secreto JWT), así que un
// insert directo desde el navegador llega como `anon` y, con RLS habilitado,
// es rechazado ("new row violates row-level security policy" / 401). La forma
// correcta —y la que ya usan update-user, set-user-blocked, delete-user— es
// validar el token primario aquí y escribir con service role (bypassa RLS).

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

interface CreateBookingBody {
  booking: Record<string, unknown>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_SERVICE_ROLE) {
    return json({ error: "Función mal configurada: faltan credenciales del proyecto secundario" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY) {
    return json({ error: "Función mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY" }, 500);
  }

  // 1. Validar el JWT del proyecto primario (admin que llama desde el dashboard)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }

  // 2. Parsear payload
  let body: CreateBookingBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const booking = body?.booking;
  if (!booking || typeof booking !== "object" || Array.isArray(booking)) {
    return json({ error: "Falta el objeto 'booking'" }, 400);
  }
  if (!booking.customer_id) {
    return json({ error: "La reserva debe incluir customer_id" }, 400);
  }

  // 3. Insertar en el proyecto secundario con service role (ignora RLS)
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: inserted, error: insertErr } = await admin
    .from("bookings")
    .insert(booking)
    .select()
    .single();

  if (insertErr) {
    return json({ error: `Error al crear la reserva: ${insertErr.message}` }, 500);
  }

  return json({ success: true, booking: inserted });
});
