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

  return json({ success: true, bookings: data ?? [] });
});
