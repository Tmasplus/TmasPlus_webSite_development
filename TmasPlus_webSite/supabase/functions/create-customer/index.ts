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

interface CreateCustomerBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  city?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  referral_id?: string | null;
}

async function emailExistsInAuth(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> {
  // listUsers no soporta filtro por email en todas las versiones; paginamos.
  let page = 1;
  while (page <= 10) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    if (users.some((u) => u.email?.toLowerCase() === email.toLowerCase())) return true;
    if (users.length < 200) return false;
    page++;
  }
  return false;
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

  // 1. Validar el JWT del proyecto primario (el admin que llama desde el dashboard)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }

  // 2. Parsear payload
  let body: CreateCustomerBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.email || !body.password || !body.first_name || !body.last_name) {
    return json({ error: "Faltan campos requeridos (email, password, first_name, last_name)" }, 400);
  }

  const normalizedEmail = body.email.trim().toLowerCase();

  // 3. Cliente admin del proyecto secundario
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Verificar duplicados en public.users (email y teléfono) y en auth.users (email).
  const { data: emailRow, error: emailErr } = await admin
    .from("users")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (emailErr && (emailErr as { code?: string }).code !== "PGRST116") {
    return json({ error: `Error verificando email: ${emailErr.message}` }, 500);
  }
  if (emailRow) {
    return json({ error: `Ya existe un usuario con el email ${normalizedEmail}` }, 409);
  }

  if (body.mobile && body.mobile.trim() !== "") {
    const normalizedMobile = body.mobile.trim();
    const { data: mobileRow, error: mobileErr } = await admin
      .from("users")
      .select("id")
      .eq("mobile", normalizedMobile)
      .maybeSingle();
    if (mobileErr && (mobileErr as { code?: string }).code !== "PGRST116") {
      return json({ error: `Error verificando teléfono: ${mobileErr.message}` }, 500);
    }
    if (mobileRow) {
      return json({ error: `Ya existe un usuario con el teléfono ${normalizedMobile}` }, 409);
    }
  }

  try {
    if (await emailExistsInAuth(admin, normalizedEmail)) {
      return json({ error: `El email ${normalizedEmail} ya tiene cuenta de autenticación` }, 409);
    }
  } catch (e) {
    return json({ error: `Error verificando cuenta de auth: ${(e as Error).message}` }, 500);
  }

  // 5. Crear cuenta en auth.users de la BD secundaria
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      first_name: body.first_name,
      last_name: body.last_name,
      mobile: body.mobile ?? null,
      user_type: "customer",
      created_from_dashboard: true,
    },
  });

  if (createErr || !created?.user) {
    const msg = createErr?.message || "Error desconocido creando cuenta de Auth";
    return json({ error: `No se pudo crear la cuenta: ${msg}` }, 500);
  }

  const authId = created.user.id;

  // 6. Insertar/actualizar fila en public.users.
  // Nota: la BD puede tener un trigger sobre auth.users que crea automáticamente
  // la fila en public.users al hacer createUser. Por eso usamos upsert por auth_id.
  const now = new Date().toISOString();
  const baseFields = {
    auth_id: authId,
    email: normalizedEmail,
    first_name: body.first_name,
    last_name: body.last_name,
    mobile: body.mobile ?? null,
    city: body.city ?? null,
    document_type: body.document_type ?? null,
    document_number: body.document_number ?? null,
    referral_id: body.referral_id ?? null,
    user_type: "customer",
    // Regla de negocio: el cliente nace PENDIENTE y BLOQUEADO en la App.
    // Solo al aprobarlo desde el dashboard se desbloquea y puede ingresar.
    approved: false,
    blocked: true,
    updated_at: now,
  };

  // Si el trigger ya creó la fila por auth_id, la actualizamos con los datos del form.
  const { data: existingByAuth } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  let resultRow: any;
  let resultErr: any;

  if (existingByAuth?.id) {
    const res = await admin
      .from("users")
      .update(baseFields)
      .eq("id", existingByAuth.id)
      .select()
      .single();
    resultRow = res.data;
    resultErr = res.error;
  } else {
    const res = await admin
      .from("users")
      .insert({ ...baseFields, created_at: now })
      .select()
      .single();
    resultRow = res.data;
    resultErr = res.error;
  }

  if (resultErr) {
    // Rollback: si falla, borramos el auth user para no dejar huérfanos.
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    return json({ error: `Error al guardar usuario: ${resultErr.message}` }, 500);
  }

  return json({ user: resultRow, authCreated: true });
});
