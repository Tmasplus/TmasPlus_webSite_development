// Edge Function (desplegar en el proyecto SECUNDARIO).
//
// Reconcilia el contador `referral_codes.total_referrals` en AMBOS proyectos
// (primario y secundario) a partir de la fuente de verdad: `users.referral_id`.
//
// Regla de negocio (confirmada por el cliente): "Referidos" = número de usuarios
// que se registraron con ese código, aprobados o no. Es decir, para cada código:
//   total_referrals = COUNT(users WHERE referral_id = referral_code)
//
// El contador es un dato denormalizado que se desincroniza (solo lo sube el
// trigger al aprobar), por eso hay que recalcularlo desde `users.referral_id`.
//
// Requiere estos secrets en el proyecto secundario (los mismos que usa
// sync-driver-to-primary):
//   PRIMARY_SUPABASE_URL, PRIMARY_SUPABASE_SERVICE_ROLE_KEY, PRIMARY_SUPABASE_ANON_KEY
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase (= secundario).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SECONDARY_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SECONDARY_SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PRIMARY_URL = Deno.env.get("PRIMARY_SUPABASE_URL") ?? "";
const PRIMARY_ANON_KEY = Deno.env.get("PRIMARY_SUPABASE_ANON_KEY") ?? "";
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

/**
 * Verifica que el JWT del proyecto primario pertenezca a un admin aprobado y no
 * bloqueado, usando el RPC `get_auth_profile` (security definer).
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

/** Lee todas las filas de una tabla paginando en bloques (evita el tope de 1000). */
async function fetchAll<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  filter?: (q: any) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = client.from(table).select(columns).range(from, from + pageSize - 1);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`Error leyendo ${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

interface DbResult {
  codes: number;
  usersWithReferral: number;
  updated: number;
  changes: Array<{ code: string; from: number; to: number }>;
  errors: string[];
}

/**
 * Recalcula total_referrals en un proyecto: para cada código, cuenta cuántos
 * usuarios tienen ese código en users.referral_id y actualiza solo las filas que
 * difieren. Devuelve un resumen de lo cambiado.
 */
async function reconcileDb(client: SupabaseClient): Promise<DbResult> {
  const codes = await fetchAll<{ id: string; referral_code: string; total_referrals: number | null }>(
    client,
    "referral_codes",
    "id, referral_code, total_referrals",
  );
  const users = await fetchAll<{ referral_id: string | null }>(
    client,
    "users",
    "referral_id",
    (q) => q.not("referral_id", "is", null),
  );

  // Cuenta de usos reales por código (normalizando espacios).
  const usedCount: Record<string, number> = {};
  for (const u of users) {
    const c = (u.referral_id ?? "").trim();
    if (c) usedCount[c] = (usedCount[c] ?? 0) + 1;
  }

  const result: DbResult = {
    codes: codes.length,
    usersWithReferral: users.length,
    updated: 0,
    changes: [],
    errors: [],
  };

  for (const code of codes) {
    const actual = usedCount[code.referral_code] ?? 0;
    const current = code.total_referrals ?? 0;
    if (current === actual) continue;

    const { error } = await client
      .from("referral_codes")
      .update({ total_referrals: actual })
      .eq("id", code.id);

    if (error) {
      result.errors.push(`${code.referral_code}: ${error.message}`);
    } else {
      result.updated++;
      result.changes.push({ code: code.referral_code, from: current, to: actual });
    }
  }

  return result;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_SERVICE_ROLE) {
    return json({ error: "Función mal configurada: faltan credenciales del proyecto secundario" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY || !PRIMARY_SERVICE_ROLE) {
    return json(
      {
        error:
          "Función mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY / PRIMARY_SUPABASE_SERVICE_ROLE_KEY",
      },
      500,
    );
  }

  // 1. Validar que el llamante sea un admin del proyecto primario.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return json({ error: "Falta token de autorización" }, 401);
  if (!(await isPrimaryAdmin(token))) {
    return json({ error: "Acceso denegado: se requiere rol de administrador" }, 403);
  }

  // 2. Reconciliar ambos proyectos con sus service_role respectivos.
  const primaryAdmin = createClient(PRIMARY_URL, PRIMARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const secondaryAdmin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const [primary, secondary] = await Promise.all([
      reconcileDb(primaryAdmin),
      reconcileDb(secondaryAdmin),
    ]);
    const totalUpdated = primary.updated + secondary.updated;
    return json({ ok: true, totalUpdated, primary, secondary });
  } catch (e) {
    return json({ error: `Error reconciliando referidos: ${(e as Error)?.message ?? "desconocido"}` }, 500);
  }
});
