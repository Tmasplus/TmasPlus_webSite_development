// Edge Function (desplegar en el proyecto SECUNDARIO).
//
// Replica un driver recién registrado en el secundario hacia el proyecto
// primario, creando:
//   1. auth.users en primary (mismo email/password, email_confirm: true)
//   2. public.users en primary con user_type='driver', approved=false
//
// Idempotente: si el usuario ya existe en primary, se actualiza la contraseña
// para mantener sincronización con el secondary, y la fila en public.users
// se hace upsert por auth_id.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// Auto-inyectadas por Supabase al desplegar (apuntan al proyecto donde corre la función = SECONDARY)
const SECONDARY_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECONDARY_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Secrets que hay que definir manualmente al desplegar
const PRIMARY_URL = Deno.env.get("PRIMARY_SUPABASE_URL") ?? "";
const PRIMARY_SERVICE_ROLE = Deno.env.get("PRIMARY_SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

interface SyncDriverBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  city?: string | null;
  profile_image?: string | null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_ANON_KEY) {
    return json({ error: "Función mal configurada: faltan SUPABASE_URL / SUPABASE_ANON_KEY" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_SERVICE_ROLE) {
    return json(
      { error: "Función mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_SERVICE_ROLE_KEY" },
      500,
    );
  }

  // 1. Validar el JWT del proyecto SECUNDARIO (la app móvil acaba de hacer signUp ahí)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const secondary = createClient(SECONDARY_URL, SECONDARY_ANON_KEY);
  const { data: callerData, error: callerErr } = await secondary.auth.getUser(token);
  if (callerErr || !callerData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }
  const callerEmail = callerData.user.email?.toLowerCase() ?? "";

  // 2. Parsear payload
  let body: SyncDriverBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.email || !body.password || !body.first_name || !body.last_name) {
    return json({ error: "Faltan campos requeridos (email, password, first_name, last_name)" }, 400);
  }

  // El email del payload debe coincidir con el del JWT del llamante para evitar
  // que un driver pida sincronizar la cuenta de otro.
  if (body.email.trim().toLowerCase() !== callerEmail) {
    return json({ error: "El email del payload no coincide con la sesión" }, 403);
  }

  // 3. Cliente admin del proyecto PRIMARIO
  const primaryAdmin = createClient(PRIMARY_URL, PRIMARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const normalizedEmail = body.email.trim();

  // 4. ¿Ya existe ese email en auth del primary?
  let primaryAuthId: string | null = null;
  let authCreated = false;
  try {
    const { data: list, error: listErr } = await primaryAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw listErr;
    const match = list?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail.toLowerCase());
    if (match) primaryAuthId = match.id;
  } catch (e) {
    return json({ error: `No se pudo consultar auth del primary: ${(e as Error)?.message}` }, 500);
  }

  if (primaryAuthId) {
    // 4a. Resetear contraseña para mantener sincronía con secondary
    const { error: updateErr } = await primaryAdmin.auth.admin.updateUserById(primaryAuthId, {
      password: body.password,
    });
    if (updateErr) {
      return json({ error: `No se pudo sincronizar contraseña en primary: ${updateErr.message}` }, 500);
    }
  } else {
    // 4b. Crear cuenta nueva en auth del primary
    const { data: created, error: createErr } = await primaryAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: {
        first_name: body.first_name,
        last_name: body.last_name,
        mobile: body.mobile ?? null,
        user_type: "driver",
        synced_from_secondary: true,
      },
    });
    if (createErr || !created?.user) {
      return json(
        { error: `No se pudo crear cuenta en primary: ${createErr?.message ?? "sin detalle"}` },
        500,
      );
    }
    primaryAuthId = created.user.id;
    authCreated = true;
  }

  // 5. Upsert en public.users del primary (driver no aprobado)
  const now = new Date().toISOString();
  const userRow = {
    auth_id: primaryAuthId,
    email: normalizedEmail,
    first_name: body.first_name,
    last_name: body.last_name,
    mobile: body.mobile ?? null,
    city: body.city ?? null,
    profile_image: body.profile_image ?? null,
    user_type: "driver" as const,
    approved: false,
    blocked: false,
    updated_at: now,
  };

  const { data: existingRow, error: existingErr } = await primaryAdmin
    .from("users")
    .select("id")
    .eq("auth_id", primaryAuthId)
    .maybeSingle();
  if (existingErr) {
    return json({ error: `Error consultando users en primary: ${existingErr.message}` }, 500);
  }

  let profile: unknown;
  if (existingRow) {
    const { data, error } = await primaryAdmin
      .from("users")
      .update(userRow)
      .eq("auth_id", primaryAuthId)
      .select()
      .single();
    if (error) return json({ error: `Error actualizando users en primary: ${error.message}` }, 500);
    profile = data;
  } else {
    const { data, error } = await primaryAdmin
      .from("users")
      .insert({ ...userRow, created_at: now })
      .select()
      .single();
    if (error) return json({ error: `Error insertando users en primary: ${error.message}` }, 500);
    profile = data;
  }

  return json({
    ok: true,
    authCreated,
    primaryAuthId,
    profile,
  });
});
