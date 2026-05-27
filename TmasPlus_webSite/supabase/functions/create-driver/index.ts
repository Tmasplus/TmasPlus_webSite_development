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

interface CreateDriverBody {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  city?: string | null;
  document_type?: string | null;
  document_number?: string | null;
  referral_id?: string | null;
  bank_number?: string | null;
  // Vehículo
  vehicle_type?: string | null;   // → cars.service_type
  make?: string | null;           // → cars.make
  model?: string | null;          // → cars.model
  plate?: string | null;          // → cars.plate
  vehicle_year?: string | null;   // → cars.features.year (jsonb)
}

async function emailExistsInAuth(
  admin: ReturnType<typeof createClient>,
  email: string,
): Promise<boolean> {
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

  // 1. Validar JWT del admin (proyecto primario)
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data: userData, error: userErr } = await primary.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: "Token inválido o expirado" }, 401);
  }

  // 2. Parsear payload
  let body: CreateDriverBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.email || !body.password || !body.first_name || !body.last_name) {
    return json({ error: "Faltan campos requeridos (email, password, first_name, last_name)" }, 400);
  }
  if (!body.plate || !body.vehicle_type || !body.make || !body.model) {
    return json({ error: "Faltan datos de vehículo (tipo, marca, modelo, placa)" }, 400);
  }

  const normalizedEmail = body.email.trim().toLowerCase();
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 3. Validar duplicados (email/teléfono en users + email en auth)
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

  // 4. Crear auth user
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: body.password,
    email_confirm: true,
    user_metadata: {
      first_name: body.first_name,
      last_name: body.last_name,
      mobile: body.mobile ?? null,
      user_type: "driver",
      created_from_dashboard: true,
    },
  });
  if (createErr || !created?.user) {
    return json({ error: `No se pudo crear la cuenta: ${createErr?.message || "desconocido"}` }, 500);
  }
  const authId = created.user.id;

  // 5. Insertar/actualizar fila en public.users (trigger puede haberla creado)
  const now = new Date().toISOString();
  const userFields = {
    auth_id: authId,
    email: normalizedEmail,
    first_name: body.first_name,
    last_name: body.last_name,
    mobile: body.mobile ?? null,
    city: body.city ?? null,
    document_type: body.document_type ?? null,
    document_number: body.document_number ?? null,
    referral_id: body.referral_id ?? null,
    bank_number: body.bank_number ?? null,
    user_type: "driver",
    approved: true,
    blocked: false,
    updated_at: now,
  };

  const { data: existingByAuth } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", authId)
    .maybeSingle();

  let userRow: any;
  let userUpsertErr: any;
  if (existingByAuth?.id) {
    const res = await admin
      .from("users")
      .update(userFields)
      .eq("id", existingByAuth.id)
      .select()
      .single();
    userRow = res.data;
    userUpsertErr = res.error;
  } else {
    const res = await admin
      .from("users")
      .insert({ ...userFields, created_at: now })
      .select()
      .single();
    userRow = res.data;
    userUpsertErr = res.error;
  }

  if (userUpsertErr) {
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    return json({ error: `Error al guardar usuario: ${userUpsertErr.message}` }, 500);
  }

  // 6. Insertar fila en cars
  const carPayload: Record<string, unknown> = {
    driver_id: userRow.id,
    make: body.make!.trim(),
    model: body.model!.trim(),
    plate: body.plate!.trim().toUpperCase(),
    service_type: body.vehicle_type ?? "particular",
    is_active: true,
    created_at: now,
    updated_at: now,
  };
  if (body.vehicle_year && body.vehicle_year.trim() !== "") {
    carPayload.features = { year: body.vehicle_year.trim() };
  }

  const { data: carRow, error: carErr } = await admin
    .from("cars")
    .insert(carPayload)
    .select()
    .single();

  if (carErr) {
    // Rollback: borramos el auth user (cascadea a public.users)
    await admin.auth.admin.deleteUser(authId).catch(() => {});
    return json({ error: `Error al guardar vehículo: ${carErr.message}` }, 500);
  }

  return json({ user: userRow, car: carRow, authCreated: true });
});
