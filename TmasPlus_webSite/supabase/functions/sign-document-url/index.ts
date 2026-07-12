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

/**
 * Verifica que el JWT del proyecto primario pertenezca a un admin aprobado y no
 * bloqueado, vía el RPC `get_auth_profile` (security definer). Mismo patrón que
 * usa `upload-driver-document` para autorizar al panel contra el proyecto
 * secundario.
 */
async function isPrimaryAdmin(token: string): Promise<boolean> {
  const authedPrimary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await authedPrimary.rpc("get_auth_profile");
  if (error || !data) return false;
  const profile = Array.isArray(data) ? data[0] : data;
  return profile?.user_type === "admin" && profile?.approved === true && profile?.blocked !== true;
}

interface SignBody {
  bucket: string;
  path: string;
  expiresIn?: number;
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

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }
  if (!(await isPrimaryAdmin(token))) {
    return json({ error: "Acceso denegado: se requiere rol de administrador" }, 403);
  }

  let body: SignBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.bucket || !body.path) {
    return json({ error: "Faltan campos requeridos (bucket, path)" }, 400);
  }

  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.storage
    .from(body.bucket)
    .createSignedUrl(body.path, body.expiresIn ?? 3600);
  if (error || !data?.signedUrl) {
    return json({ error: error?.message || "No se pudo firmar el documento" }, 404);
  }

  return json({ signedUrl: data.signedUrl });
});
