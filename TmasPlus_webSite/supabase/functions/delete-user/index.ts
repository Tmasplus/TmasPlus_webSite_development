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

interface DeleteUserBody {
  id: string;
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
  let body: DeleteUserBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.id || typeof body.id !== "string") {
    return json({ error: "Falta el id del usuario a eliminar" }, 400);
  }

  // 3. Cliente admin del proyecto secundario
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Buscar la fila para obtener auth_id (puede no existir si ya fue parcialmente borrado)
  const { data: targetRow, error: lookupErr } = await admin
    .from("users")
    .select("id, auth_id")
    .eq("id", body.id)
    .maybeSingle();

  if (lookupErr && (lookupErr as { code?: string }).code !== "PGRST116") {
    return json({ error: `Error buscando usuario: ${lookupErr.message}` }, 500);
  }

  const authId = targetRow?.auth_id ?? body.id;

  // 5. Borrar fila en public.users
  const { error: deleteRowErr } = await admin
    .from("users")
    .delete()
    .eq("id", body.id);

  if (deleteRowErr) {
    return json({ error: `Error al eliminar fila en users: ${deleteRowErr.message}` }, 500);
  }

  // 6. Borrar cuenta en auth.users. Ignoramos "user not found" para que la operación sea idempotente.
  let authDeleted = false;
  let authWarning: string | undefined;
  if (authId) {
    const { error: authDelErr } = await admin.auth.admin.deleteUser(authId);
    if (authDelErr) {
      const msg = authDelErr.message || "";
      if (/not.?found/i.test(msg) || (authDelErr as { status?: number }).status === 404) {
        authWarning = "La cuenta de auth no existía (ya estaba eliminada).";
      } else {
        authWarning = `No se pudo eliminar auth.users: ${msg}`;
      }
    } else {
      authDeleted = true;
    }
  } else {
    authWarning = "El usuario no tenía auth_id asociado.";
  }

  return json({ success: true, authDeleted, authWarning });
});
