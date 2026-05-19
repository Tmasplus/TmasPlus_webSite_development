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

interface ImportDriverBody {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile?: string | null;
  city?: string | null;
  profile_image?: string | null;
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
  // Nota: aquí podrías agregar un chequeo extra de rol admin si lo necesitas.

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

    return json({ user: existing, authCreated: false, authWarning: resetWarning });
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
  const baseFields = {
    auth_id: authId ?? body.id,
    first_name: body.first_name,
    last_name: body.last_name,
    email: body.email,
    mobile: body.mobile ?? null,
    city: body.city ?? null,
    profile_image: body.profile_image ?? null,
    user_type: "driver",
    approved: true,
    blocked: false,
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

  return json({ user: upserted, authCreated, authWarning });
});
