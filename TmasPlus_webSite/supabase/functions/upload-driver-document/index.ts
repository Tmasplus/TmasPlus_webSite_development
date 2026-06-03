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
 * bloqueado, vía el RPC `get_auth_profile` (security definer).
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

// Registro de documentos: a qué tabla/columna y bucket pertenece cada uno.
// scope "user" → tabla users (carpeta = id del conductor)
// scope "car"  → tabla cars  (carpeta = id del vehículo en la base secundaria)
type DocScope = "user" | "car";
interface DocDef {
  scope: DocScope;
  column: string;
  bucket: string;
}

const DOC_DEFS: Record<string, DocDef> = {
  verify_id_image: { scope: "user", column: "verify_id_image", bucket: "driver-documents" },
  verify_id_image_bk: { scope: "user", column: "verify_id_image_bk", bucket: "driver-documents" },
  license_image: { scope: "user", column: "license_image", bucket: "driver-documents" },
  license_image_back: { scope: "user", column: "license_image_back", bucket: "driver-documents" },
  car_image_1: { scope: "car", column: "car_image_1", bucket: "car-images" },
  car_image_2: { scope: "car", column: "car_image_2", bucket: "car-images" },
  card_prop_image: { scope: "car", column: "card_prop_image", bucket: "vehicle-documents" },
  card_prop_image_back: { scope: "car", column: "card_prop_image_back", bucket: "vehicle-documents" },
  soat_image: { scope: "car", column: "soat_image", bucket: "vehicle-documents" },
  tecnomecanica_image: { scope: "car", column: "tecnomecanica_image", bucket: "vehicle-documents" },
};

interface UploadBody {
  driverId: string;
  field: string;
  fileBase64: string; // contenido del archivo (sin el prefijo data:)
  contentType: string;
  fileName?: string;
}

function base64ToUint8Array(b64: string): Uint8Array {
  // Acepta data URLs por si llega con prefijo
  const comma = b64.indexOf(",");
  const clean = b64.startsWith("data:") && comma !== -1 ? b64.slice(comma + 1) : b64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extFromName(name: string | undefined, contentType: string): string {
  if (name && name.includes(".")) return name.split(".").pop()!.toLowerCase();
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("png")) return "png";
  return "jpg";
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

  // 1. Validar el JWT del proyecto primario (admin del dashboard)
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

  // 2. Parsear payload
  let body: UploadBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.driverId || !body.field || !body.fileBase64 || !body.contentType) {
    return json({ error: "Faltan campos requeridos (driverId, field, fileBase64, contentType)" }, 400);
  }

  const def = DOC_DEFS[body.field];
  if (!def) return json({ error: `Documento no soportado: ${body.field}` }, 400);

  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Resolver la fila destino (usuario o vehículo) en la base secundaria
  const { data: userRow, error: userRowErr } = await admin
    .from("users")
    .select("id")
    .eq("id", body.driverId)
    .maybeSingle();
  if (userRowErr) return json({ error: `Error buscando usuario: ${userRowErr.message}` }, 500);
  if (!userRow) {
    return json({ error: "El conductor no está importado a la App todavía. Impórtalo primero." }, 409);
  }

  let folderId = body.driverId;
  let targetTable = "users";
  let targetId = body.driverId;

  if (def.scope === "car") {
    const { data: carRow, error: carErr } = await admin
      .from("cars")
      .select("id")
      .eq("driver_id", body.driverId)
      .maybeSingle();
    if (carErr) return json({ error: `Error buscando vehículo: ${carErr.message}` }, 500);
    if (!carRow) {
      return json({ error: "El conductor no tiene vehículo en la App. Re-sincronízalo primero." }, 409);
    }
    folderId = carRow.id;
    targetTable = "cars";
    targetId = carRow.id;
  }

  // 4. Subir el archivo al storage secundario
  let bytes: Uint8Array;
  try {
    bytes = base64ToUint8Array(body.fileBase64);
  } catch {
    return json({ error: "No se pudo decodificar el archivo (base64 inválido)" }, 400);
  }

  const ext = extFromName(body.fileName, body.contentType);
  const objectPath = `${folderId}/${body.field}_${Date.now()}.${ext}`;

  const { error: uploadErr } = await admin.storage
    .from(def.bucket)
    .upload(objectPath, bytes, { contentType: body.contentType, upsert: true });
  if (uploadErr) {
    return json({ error: `Error al subir archivo a la App: ${uploadErr.message}` }, 500);
  }

  const { data: pub } = admin.storage.from(def.bucket).getPublicUrl(objectPath);
  const publicUrl = pub?.publicUrl ?? null;

  // 5. Escribir la URL en la columna correspondiente
  const { error: updateErr } = await admin
    .from(targetTable)
    .update({ [def.column]: publicUrl, updated_at: new Date().toISOString() })
    .eq("id", targetId);
  if (updateErr) {
    return json({ error: `Archivo subido pero no se pudo actualizar el registro: ${updateErr.message}` }, 500);
  }

  return json({ url: publicUrl, bucket: def.bucket, path: objectPath });
});
