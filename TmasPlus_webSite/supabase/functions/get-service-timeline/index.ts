import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

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

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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
  const { data: userData, error: userError } = await primary.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "Token invalido o expirado" }, 401);
  }

  let body: { bookingIds?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }

  const bookingIds = Array.isArray(body.bookingIds)
    ? [...new Set(body.bookingIds.filter((id): id is string => typeof id === "string" && UUID_PATTERN.test(id)))]
    : [];

  if (bookingIds.length === 0) return json({ error: "Faltan bookingIds validos" }, 400);
  if (bookingIds.length > 1000) return json({ error: "Maximo 1000 bookingIds por solicitud" }, 400);

  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin
    .from("service_data_snapshots")
    .select("*")
    .in("booking_id", bookingIds)
    .order("captured_at", { ascending: true });

  if (error) {
    return json({ error: `Error al obtener snapshots: ${error.message}` }, 500);
  }

  return json({ success: true, snapshots: data ?? [] });
});
