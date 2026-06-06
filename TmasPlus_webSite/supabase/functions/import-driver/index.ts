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
 * bloqueado. Usa el RPC `get_auth_profile` (security definer) que devuelve el
 * perfil del usuario autenticado saltando RLS.
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

interface ImportVehicle {
  make?: string | null;
  model?: string | null;
  plate?: string | null;
  color?: string | null;
  fuel_type?: string | null;
  transmission?: string | null;
  capacity?: number | null;
  service_type?: string | null;
}

interface ImportDriverBody {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  city?: string | null;
  profile_image?: string | null;
  // Documento de identidad (cédula) del conductor en el proyecto primario
  document_type?: string | null;
  document_number?: string | null;
  // Código de referido con el que se registró el conductor (users.referral_id
  // del proyecto primario). Se replica a la App.
  referral_id?: string | null;
  // Estado del conductor en la pestaña Conductores (proyecto primario)
  approved?: boolean | null;
  blocked?: boolean | null;
  // Datos del vehículo a replicar en la tabla cars del proyecto secundario
  vehicle?: ImportVehicle | null;
}

/**
 * Replica los datos del vehículo del conductor en la tabla `cars` del proyecto
 * secundario. Si ya existe un vehículo para ese conductor lo actualiza; si no,
 * lo crea. Los errores no son fatales: se devuelven como aviso para no abortar
 * la importación del usuario.
 */
async function syncCar(
  admin: ReturnType<typeof createClient>,
  driverId: string,
  vehicle: ImportVehicle | null | undefined,
  now: string,
): Promise<string | undefined> {
  if (!vehicle) return undefined;

  const carFields: Record<string, unknown> = { driver_id: driverId, updated_at: now };
  if (vehicle.make != null && String(vehicle.make).trim() !== "") carFields.make = String(vehicle.make).trim();
  if (vehicle.model != null && String(vehicle.model).trim() !== "") carFields.model = String(vehicle.model).trim();
  if (vehicle.plate != null && String(vehicle.plate).trim() !== "") carFields.plate = String(vehicle.plate).trim().toUpperCase();
  if (vehicle.color != null) carFields.color = vehicle.color;
  if (vehicle.fuel_type != null) carFields.fuel_type = vehicle.fuel_type;
  if (vehicle.transmission != null) carFields.transmission = vehicle.transmission;
  if (vehicle.capacity != null) carFields.capacity = vehicle.capacity;
  if (vehicle.service_type != null) carFields.service_type = vehicle.service_type;

  const { data: existingCar, error: findErr } = await admin
    .from("cars")
    .select("id")
    .eq("driver_id", driverId)
    .maybeSingle();
  if (findErr && (findErr as { code?: string }).code !== "PGRST116") {
    return `No se pudo verificar el vehículo: ${findErr.message}`;
  }

  if (existingCar?.id) {
    const { error } = await admin.from("cars").update(carFields).eq("id", existingCar.id);
    if (error) return `No se pudo actualizar el vehículo: ${error.message}`;
    return undefined;
  }

  // Crear vehículo nuevo: make/model/plate son NOT NULL en el esquema.
  if (!carFields.make || !carFields.model || !carFields.plate) {
    return "No se replicó el vehículo: faltan marca, modelo o placa.";
  }
  const { error } = await admin
    .from("cars")
    .insert({ ...carFields, is_active: true, created_at: now });
  if (error) return `No se pudo crear el vehículo: ${error.message}`;
  return undefined;
}

// Contraseña genérica temporal mientras el SMTP no esté configurado.
// El conductor debe cambiarla al iniciar sesión por primera vez.
const DEFAULT_IMPORT_PASSWORD = "TmasPlus2026!";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_SERVICE_ROLE) {
    return json({ error: "Función mal configurada: faltan credenciales del proyecto secundario" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY) {
    return json({ error: "Función mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY" }, 500);
  }

  // 1. Validar el JWT del proyecto primario
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
  let body: ImportDriverBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  if (!body.id || !body.email || !body.first_name || !body.last_name) {
    return json({ error: "Faltan campos requeridos (id, email, first_name, last_name)" }, 400);
  }

  // 3. Cliente admin del proyecto secundario
  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 4. Si el row ya existe, resetear contraseña a la genérica y terminar.
  // Mientras el SMTP no esté configurado este es el "recupero" manual.
  const { data: existing, error: existingErr } = await admin
    .from("users")
    .select("*")
    .eq("id", body.id)
    .maybeSingle();
  if (existingErr) return json({ error: `Error verificando usuario: ${existingErr.message}` }, 500);
  if (existing) {
    let resetWarning: string | undefined;
    let resetAuthId: string | null = existing.auth_id ?? null;

    if (!resetAuthId) {
      try {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = list?.users?.find(
          (u: { email?: string | null }) => u.email?.toLowerCase() === body.email.toLowerCase(),
        );
        if (match) resetAuthId = match.id;
      } catch (e) {
        resetWarning = `Error buscando cuenta de Auth: ${(e as Error)?.message || "desconocido"}.`;
      }
    }

    if (resetAuthId) {
      const { error: updateErr } = await admin.auth.admin.updateUserById(resetAuthId, {
        password: DEFAULT_IMPORT_PASSWORD,
      });
      if (updateErr) {
        resetWarning = `No se pudo resetear la contraseña: ${updateErr.message}`;
      } else {
        resetWarning = `Contraseña reseteada a la contraseña genérica para ${body.email}.`;
      }
    } else if (!resetWarning) {
      resetWarning = "El conductor ya estaba importado pero no se encontró su cuenta de Auth para resetear.";
    }

    // Sincronizar estado del conductor (aprobado/bloqueado) y datos del vehículo
    const nowExisting = new Date().toISOString();
    const stateFields: Record<string, unknown> = { updated_at: nowExisting };
    // Regla de negocio: el usuario queda bloqueado en la App hasta ser aprobado.
    // Aprobar = desbloquear. Un bloqueo explícito del dashboard también se respeta.
    if (typeof body.approved === "boolean") {
      stateFields.approved = body.approved;
      stateFields.blocked = !body.approved || body.blocked === true;
    } else if (typeof body.blocked === "boolean") {
      stateFields.blocked = body.blocked;
    }
    if (body.referral_id != null) stateFields.referral_id = body.referral_id;
    if (body.document_type != null) stateFields.document_type = body.document_type;
    if (body.document_number != null) stateFields.document_number = body.document_number;
    let refreshed = existing;
    if (Object.keys(stateFields).length > 1) {
      const { data: updatedRow, error: stateErr } = await admin
        .from("users")
        .update(stateFields)
        .eq("id", existing.id)
        .select()
        .single();
      if (stateErr) {
        resetWarning = resetWarning
          ? `${resetWarning} No se pudo actualizar el estado: ${stateErr.message}`
          : `No se pudo actualizar el estado: ${stateErr.message}`;
      } else if (updatedRow) {
        refreshed = updatedRow;
      }
    }

    const carWarning = await syncCar(admin, existing.id, body.vehicle, nowExisting);
    if (carWarning) resetWarning = resetWarning ? `${resetWarning} ${carWarning}` : carWarning;

    return json({ user: refreshed, authCreated: false, authWarning: resetWarning });
  }

  // 5. Crear cuenta de Auth (sin rate-limit público, sin email de confirmación)
  let authId: string | null = null;
  let authCreated = false;
  let authWarning: string | undefined;

  const password = DEFAULT_IMPORT_PASSWORD;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: body.email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: body.first_name,
      last_name: body.last_name,
      mobile: body.mobile ?? null,
      user_type: "driver",
      imported_from_dashboard: true,
    },
  });

  if (createErr) {
    const msg = createErr.message || "";
    if (/already (been )?registered|already exists|duplicate/i.test(msg)) {
      // Buscar el usuario existente por email para enlazar auth_id
      try {
        const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
        const match = list?.users?.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());
        if (match) {
          authId = match.id;
          authCreated = false;
          authWarning = "El email ya tenía cuenta en la App; se reutilizó la cuenta existente.";
        } else {
          authWarning = "El email ya tenía cuenta en la App pero no se pudo recuperar el auth_id.";
        }
      } catch (e: any) {
        authWarning = `El email ya tenía cuenta pero falló la búsqueda: ${e?.message || "error"}.`;
      }
    } else {
      authWarning = `No se pudo crear la cuenta en App: ${msg}. Se insertó la fila igualmente.`;
    }
  } else {
    authId = created?.user?.id ?? null;
    authCreated = !!authId;
  }

  // 6. Buscar fila previa por email (case-insensitive; puede pertenecer a otro id histórico)
  const normalizedEmail = body.email.trim();
  const { data: byEmailList, error: byEmailErr } = await admin
    .from("users")
    .select("id, email")
    .ilike("email", normalizedEmail)
    .limit(2);
  if (byEmailErr) {
    return json({ error: `Error verificando email: ${byEmailErr.message}` }, 500);
  }
  if (byEmailList && byEmailList.length > 1) {
    return json({
      error: `Hay ${byEmailList.length} usuarios con el email ${normalizedEmail} en la BD; resolver manualmente antes de importar.`,
    }, 409);
  }
  const byEmail = byEmailList && byEmailList[0] ? byEmailList[0] : null;

  const now = new Date().toISOString();
  // Regla de negocio: el usuario llega bloqueado a la App hasta ser aprobado.
  // Si el dashboard no envía 'approved', se asume NO aprobado (pendiente).
  // Aprobar = desbloquear; un bloqueo explícito del dashboard también bloquea.
  const isApproved = typeof body.approved === "boolean" ? body.approved : false;
  const isBlocked = !isApproved || body.blocked === true;
  const baseFields = {
    auth_id: authId ?? body.id,
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    mobile: body.mobile ?? null,
    city: body.city ?? null,
    profile_image: body.profile_image ?? null,
    document_type: body.document_type ?? null,
    document_number: body.document_number ?? null,
    referral_id: body.referral_id ?? null,
    user_type: "driver",
    approved: isApproved,
    blocked: isBlocked,
    updated_at: now,
  };

  let upserted: any;
  let upsertErr: any;

  if (byEmail && byEmail.id !== body.id) {
    // Reutilizar fila existente: alinear su id con el del proyecto primario
    const reuseNotice = `Ya existía un usuario con ese email (id previo ${byEmail.id}); se reutilizó la fila y se actualizó su id.`;
    authWarning = authWarning ? `${authWarning} ${reuseNotice}` : reuseNotice;

    const updatePayload = { ...baseFields, id: body.id };
    const res = await admin
      .from("users")
      .update(updatePayload)
      .eq("id", byEmail.id)
      .select()
      .single();
    upserted = res.data;
    upsertErr = res.error;
  } else {
    const payload = { ...baseFields, id: body.id, created_at: now };
    const res = await admin
      .from("users")
      .upsert(payload, { onConflict: "id" })
      .select()
      .single();
    upserted = res.data;
    upsertErr = res.error;
  }

  if (upsertErr) {
    return json({ error: `Error al insertar usuario: ${upsertErr.message}` }, 500);
  }

  // Replicar los datos del vehículo en la tabla cars del proyecto secundario
  const carWarning = await syncCar(admin, upserted.id, body.vehicle, now);
  if (carWarning) authWarning = authWarning ? `${authWarning} ${carWarning}` : carWarning;

  return json({ user: upserted, authCreated, authWarning });
});
