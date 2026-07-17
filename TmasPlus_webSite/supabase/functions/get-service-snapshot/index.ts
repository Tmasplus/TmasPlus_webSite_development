import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-platform, x-app-environment",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const numberOrNull = (value: unknown) => {
  const number = Number(value);
  return value !== null && value !== "" && Number.isFinite(number) ? number : null;
};
const first = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== "") return row[key];
  return null;
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secondaryUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const primaryUrl = Deno.env.get("PRIMARY_SUPABASE_URL") ?? "";
  const primaryAnon = Deno.env.get("PRIMARY_SUPABASE_ANON_KEY") ?? "";
  if (!secondaryUrl || !serviceKey || !primaryUrl || !primaryAnon) return json({ error: "Función mal configurada" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const primary = createClient(primaryUrl, primaryAnon);
  const { data: userData, error: userError } = await primary.auth.getUser(token);
  if (!token || userError || !userData.user) return json({ error: "Token inválido o expirado" }, 401);

  let body: { booking_id?: string; booking_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* body vacío */ }
  const bookingIds = [...new Set([...(body.booking_ids ?? []), ...(body.booking_id ? [body.booking_id] : [])])]
    .filter((id) => typeof id === "string" && id.length > 0)
    .slice(0, 1000);
  if (!bookingIds.length) return json({ error: "booking_id o booking_ids es requerido" }, 400);

  const admin = createClient(secondaryUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  // El nombre canónico es service_snapshots. La alternativa conserva compatibilidad
  // con instalaciones que crearon la tabla como booking_snapshots.
  let rows: Record<string, unknown>[] | null = null;
  let lastError = "";
  for (const table of ["service_snapshots", "booking_snapshots"]) {
    const result = await admin.from(table).select("*").in("booking_id", bookingIds).order("created_at", { ascending: true });
    if (!result.error) { rows = (result.data ?? []) as Record<string, unknown>[]; break; }
    lastError = result.error.message;
  }
  if (!rows) return json({ error: `No se pudieron leer los snapshots: ${lastError}` }, 500);

  const snapshots = rows.map((row, index) => {
    const payload = (first(row, ["data", "snapshot", "payload", "metadata"]) ?? {}) as Record<string, unknown>;
    const merged = { ...payload, ...row };
    const location = (first(merged, ["location", "position", "coordinates"]) ?? {}) as Record<string, unknown>;
    return {
      id: String(first(row, ["id"]) ?? `${first(row, ["booking_id"])}-${index}`),
      booking_id: String(first(row, ["booking_id", "service_id"]) ?? ""),
      stage: String(first(merged, ["stage", "status", "event", "state"]) ?? "UNKNOWN"),
      status: String(first(merged, ["status", "stage", "state"]) ?? "UNKNOWN"),
      captured_at: String(first(merged, ["captured_at", "occurred_at", "timestamp", "created_at", "updated_at"]) ?? ""),
      latitude: numberOrNull(first(merged, ["latitude", "lat"]) ?? first(location, ["latitude", "lat"])),
      longitude: numberOrNull(first(merged, ["longitude", "lng", "lon"]) ?? first(location, ["longitude", "lng", "lon"])),
      address: first(merged, ["address", "location_address", "current_address"]) as string | null,
      calculated_price: numberOrNull(first(merged, ["calculated_price", "price", "total_cost", "fare"])),
      distance: numberOrNull(first(merged, ["distance", "distance_km", "actual_distance"])),
      duration: numberOrNull(first(merged, ["duration", "duration_min", "actual_duration"])),
      data: payload,
      raw: row,
    };
  });
  return json({ success: true, snapshots });
});
