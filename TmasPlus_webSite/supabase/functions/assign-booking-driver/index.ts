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

type Body =
  | { action: "list-drivers"; query?: string }
  | { action: "assign"; bookingId?: string; driverId?: string };

type DriverRow = {
  id: string;
  auth_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  approved: boolean | null;
  blocked: boolean | null;
  driver_active_status: boolean | null;
};

async function validatePrimaryToken(req: Request) {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return { error: json({ error: "Falta token de autorizacion" }, 401) };

  const primary = createClient(PRIMARY_URL, PRIMARY_ANON_KEY);
  const { data, error } = await primary.auth.getUser(token);
  if (error || !data?.user) {
    return { error: json({ error: "Token invalido o expirado" }, 401) };
  }
  return { user: data.user };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!SECONDARY_URL || !SECONDARY_SERVICE_ROLE) {
    return json({ error: "Funcion mal configurada: faltan credenciales del proyecto secundario" }, 500);
  }
  if (!PRIMARY_URL || !PRIMARY_ANON_KEY) {
    return json({ error: "Funcion mal configurada: faltan PRIMARY_SUPABASE_URL / PRIMARY_SUPABASE_ANON_KEY" }, 500);
  }

  const validation = await validatePrimaryToken(req);
  if (validation.error) return validation.error;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON invalido" }, 400);
  }

  const admin = createClient(SECONDARY_URL, SECONDARY_SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (body.action === "list-drivers") {
    const q = body.query?.trim();
    let request = admin
      .from("users")
      .select("id, auth_id, first_name, last_name, email, mobile, approved, blocked, driver_active_status")
      .eq("user_type", "driver")
      .eq("approved", true)
      .eq("blocked", false)
      .order("created_at", { ascending: false })
      .limit(100);

    if (q) {
      const term = `%${q}%`;
      request = request.or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},mobile.ilike.${term}`,
      );
    }

    const { data: drivers, error } = await request;
    if (error) return json({ error: `Error al obtener conductores: ${error.message}` }, 500);

    const rows = (drivers ?? []) as DriverRow[];
    const driverIds = Array.from(
      new Set(rows.flatMap((d) => [d.id, d.auth_id].filter(Boolean) as string[])),
    );

    let carsByDriver: Record<string, unknown> = {};
    if (driverIds.length > 0) {
      const { data: cars, error: carErr } = await admin
        .from("cars")
        .select("id, driver_id, make, model, plate, service_type, is_active, updated_at")
        .in("driver_id", driverIds)
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false });
      if (carErr) return json({ error: `Error al obtener vehiculos: ${carErr.message}` }, 500);

      for (const car of cars ?? []) {
        const driverId = (car as { driver_id?: string }).driver_id;
        if (driverId && !carsByDriver[driverId]) carsByDriver[driverId] = car;
      }
    }

    const enriched = rows.map((driver) => ({
      ...driver,
      vehicle: carsByDriver[driver.id] || (driver.auth_id ? carsByDriver[driver.auth_id] : null) || null,
    }));

    return json({ success: true, drivers: enriched });
  }

  if (body.action === "assign") {
    if (!body.bookingId || !body.driverId) {
      return json({ error: "Faltan bookingId y driverId" }, 400);
    }

    const { data: driver, error: driverErr } = await admin
      .from("users")
      .select("id, auth_id, first_name, last_name, email, mobile, user_type, approved, blocked")
      .eq("id", body.driverId)
      .maybeSingle();
    if (driverErr) return json({ error: `Error al buscar conductor: ${driverErr.message}` }, 500);
    if (!driver || driver.user_type !== "driver") {
      return json({ error: "El conductor seleccionado no existe" }, 404);
    }
    if (driver.blocked) {
      return json({ error: "El conductor seleccionado esta bloqueado" }, 409);
    }
    if (!driver.approved) {
      return json({ error: "El conductor seleccionado no esta aprobado" }, 409);
    }

    const driverIds = [driver.id, driver.auth_id].filter(Boolean) as string[];
    const { data: cars, error: carErr } = await admin
      .from("cars")
      .select("id, make, model, plate, service_type, is_active, updated_at")
      .in("driver_id", driverIds)
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1);
    if (carErr) return json({ error: `Error al buscar vehiculo: ${carErr.message}` }, 500);

    const car = cars?.[0] ?? null;
    const fullName = [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim();
    const now = new Date().toISOString();
    const updates = {
      driver_id: driver.id,
      driver_name: fullName || driver.email || "Conductor",
      driver_contact: driver.mobile ?? null,
      car_id: car?.id ?? null,
      car_model: car ? [car.make, car.model].filter(Boolean).join(" ") : null,
      plate_number: car?.plate ?? null,
      car_type: car?.service_type ?? null,
      updated_at: now,
    };

    const { data: booking, error: updateErr } = await admin
      .from("bookings")
      .update(updates)
      .eq("id", body.bookingId)
      .select()
      .single();

    if (updateErr) return json({ error: `Error al asignar conductor: ${updateErr.message}` }, 500);
    return json({ success: true, booking });
  }

  return json({ error: "Accion no soportada" }, 400);
});
