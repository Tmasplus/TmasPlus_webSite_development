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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// Solo permitimos actualizar columnas conocidas; cualquier otra clave del
// cuerpo se ignora para no dejar que el cliente escriba columnas arbitrarias.
const USER_FIELDS = [
  "first_name",
  "last_name",
  "email",
  "mobile",
  "user_type",
  "city",
  "document_number",
  "document_type",
  "license_number",
  "blocked",
  "approved",
] as const;

const CAR_FIELDS = [
  "make",
  "model",
  "plate",
  "color",
  "fuel_type",
  "transmission",
  "capacity",
  "service_type",
] as const;

interface UpdateUserBody {
  id: string;
  user?: Record<string, unknown>;
  car?: { id: string } & Record<string, unknown>;
}

function pick(source: Record<string, unknown>, allowed: readonly string[]) {
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
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
  let body: UpdateUserBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.id || typeof body.id !== "string") {
    return json({ error: "Falta el id del usuario" }, 400);
  }

  const userPayload = pick(body.user ?? {}, USER_FIELDS);
  if (Object.keys(userPayload).length === 0 && !body.car) {
    return json({ error: "No hay campos para actualizar" }, 400);
  }

  // 3. Cliente admin del proyecto secundario (service role)
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Actualizar la fila de users (si hay campos)
  let updatedUser: Record<string, unknown> | null = null;
  if (Object.keys(userPayload).length > 0) {
    userPayload.updated_at = new Date().toISOString();
    const { data, error } = await admin
      .from("users")
      .update(userPayload)
      .eq("id", body.id)
      .select()
      .maybeSingle();
    if (error) {
      return json({ error: `Error al actualizar el usuario: ${error.message}` }, 500);
    }
    if (!data) {
      return json({ error: "Usuario no encontrado" }, 404);
    }
    updatedUser = data;
  }

  // 5. Actualizar el vehículo asociado (opcional)
  let updatedCar: Record<string, unknown> | null = null;
  if (body.car?.id) {
    const carPayload = pick(body.car, CAR_FIELDS);
    if (Object.keys(carPayload).length > 0) {
      carPayload.updated_at = new Date().toISOString();
      const { data, error } = await admin
        .from("cars")
        .update(carPayload)
        .eq("id", body.car.id)
        .select()
        .maybeSingle();
      if (error) {
        return json({ error: `Error al actualizar el vehículo: ${error.message}` }, 500);
      }
      updatedCar = data;
    }
  }

  return json({ success: true, user: updatedUser, car: updatedCar });
});
