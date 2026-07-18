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
  document_number: string | null;
  approved: boolean | null;
  blocked: boolean | null;
  driver_active_status: boolean | null;
};

type MembershipRow = {
  conductor: string;
  status: string;
  fecha_inicio: string;
  fecha_terminada: string;
  created_at: string;
};

function isMembershipActive(membership: MembershipRow | undefined) {
  if (!membership || membership.status.toUpperCase() !== "ACTIVA") return false;
  const now = Date.now();
  const startsAt = new Date(membership.fecha_inicio).getTime();
  const endsAt = new Date(membership.fecha_terminada).getTime();
  return Number.isFinite(startsAt) && Number.isFinite(endsAt) && startsAt <= now && endsAt >= now;
}

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
    const today = new Date().toISOString().slice(0, 10);
    const { data: membershipData, error: membershipsError } = await admin
      .from("memberships")
      .select("conductor, status, fecha_inicio, fecha_terminada, created_at")
      .eq("status", "ACTIVA")
      .lte("fecha_inicio", today)
      .gte("fecha_terminada", today)
      .order("created_at", { ascending: false });
    if (membershipsError) {
      return json({ error: `Error al obtener membresias activas: ${membershipsError.message}` }, 500);
    }

    const memberships = (membershipData ?? []) as MembershipRow[];
    const conductorIds = Array.from(new Set(memberships.map((membership) => membership.conductor)));
    if (conductorIds.length === 0) {
      return json({ success: true, drivers: [], eligibilityDiagnostic: "No hay membresías activas y vigentes." });
    }

    const userFields = "id, auth_id, first_name, last_name, email, mobile, document_number, approved, blocked, driver_active_status";
    const [usersByIdResult, usersByAuthResult] = await Promise.all([
      admin.from("users").select(userFields).in("id", conductorIds).eq("blocked", false),
      admin.from("users").select(userFields).in("auth_id", conductorIds).eq("blocked", false),
    ]);
    if (usersByIdResult.error) {
      return json({ error: `Error al resolver conductores por id: ${usersByIdResult.error.message}` }, 500);
    }
    if (usersByAuthResult.error) {
      return json({ error: `Error al resolver conductores por auth_id: ${usersByAuthResult.error.message}` }, 500);
    }

    const uniqueUsers = new Map<string, DriverRow>();
    for (const driver of [...(usersByIdResult.data ?? []), ...(usersByAuthResult.data ?? [])] as DriverRow[]) {
      uniqueUsers.set(driver.id, driver);
    }
    const query = body.query?.trim().toLowerCase();
    const rows = [...uniqueUsers.values()].filter((driver) => {
      if (!query) return true;
      return [driver.first_name, driver.last_name, driver.email, driver.mobile]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
    const documentNumbers = Array.from(
      new Set(rows.map((driver) => driver.document_number).filter(Boolean) as string[]),
    );
    let approvedDocuments = new Set<string>();
    if (documentNumbers.length > 0) {
      const { data: approvedIdentityRows, error: approvedIdentityErr } = await admin
        .from("users")
        .select("document_number")
        .in("document_number", documentNumbers)
        .eq("approved", true)
        .eq("blocked", false);
      if (approvedIdentityErr) {
        return json({ error: `Error al validar conductores aprobados: ${approvedIdentityErr.message}` }, 500);
      }
      approvedDocuments = new Set(
        (approvedIdentityRows ?? []).map((row) => row.document_number).filter(Boolean) as string[],
      );
    }
    const driverIds = Array.from(
      new Set(rows.flatMap((d) => [d.id, d.auth_id].filter(Boolean) as string[])),
    );

    const carsByDriver: Record<string, unknown> = {};
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

    const excluded: string[] = [];
    const enriched = rows.flatMap((driver) => {
      const identityApproved = driver.approved === true ||
        (!!driver.document_number && approvedDocuments.has(driver.document_number));
      const vehicle = carsByDriver[driver.id] || (driver.auth_id ? carsByDriver[driver.auth_id] : null) || null;
      const validIds = new Set([driver.id, driver.auth_id].filter(Boolean));
      const latestMembership = memberships.find((membership) => validIds.has(membership.conductor));
      const activeMembership = isMembershipActive(latestMembership);
      if (!identityApproved || !vehicle || !activeMembership) {
        const name = [driver.first_name, driver.last_name].filter(Boolean).join(" ") || driver.email || driver.id;
        const reasons = [
          !identityApproved ? "sin aprobación" : "",
          !vehicle ? "sin vehículo" : "",
          !activeMembership
            ? latestMembership
              ? `membresía ${latestMembership.status} (${latestMembership.fecha_inicio} a ${latestMembership.fecha_terminada})`
              : "sin membresía"
            : "",
        ].filter(Boolean);
        excluded.push(`${name}: ${reasons.join(", ")}`);
        return [];
      }
      return [{ ...driver, vehicle }];
    });

    return json({
      success: true,
      drivers: enriched,
      eligibilityDiagnostic: enriched.length === 0
        ? `Se revisaron ${rows.length} registros. ${excluded.slice(0, 8).join(" | ")}`
        : undefined,
    });
  }

  if (body.action === "assign") {
    if (!body.bookingId || !body.driverId) {
      return json({ error: "Faltan bookingId y driverId" }, 400);
    }

    const { data: driver, error: driverErr } = await admin
      .from("users")
      .select("id, auth_id, first_name, last_name, email, mobile, document_number, user_type, approved, blocked")
      .eq("id", body.driverId)
      .maybeSingle();
    if (driverErr) return json({ error: `Error al buscar conductor: ${driverErr.message}` }, 500);
    if (!driver) {
      return json({ error: "El conductor seleccionado no existe" }, 404);
    }
    if (driver.blocked) {
      return json({ error: "El conductor seleccionado esta bloqueado" }, 409);
    }
    let identityApproved = driver.approved === true;
    if (!identityApproved && driver.document_number) {
      const { data: approvedIdentity, error: identityErr } = await admin
        .from("users")
        .select("id")
        .eq("document_number", driver.document_number)
        .eq("approved", true)
        .eq("blocked", false)
        .limit(1);
      if (identityErr) {
        return json({ error: `Error al validar la identidad aprobada: ${identityErr.message}` }, 500);
      }
      identityApproved = !!approvedIdentity?.length;
    }
    if (!identityApproved) {
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
    if (!car) {
      return json({ error: "El conductor no tiene un vehiculo registrado" }, 409);
    }

    const { data: membershipRows, error: membershipErr } = await admin
      .from("memberships")
      .select("conductor, status, fecha_inicio, fecha_terminada, created_at")
      .in("conductor", driverIds)
      .order("created_at", { ascending: false });
    if (membershipErr) {
      return json({ error: `Error al validar membresia: ${membershipErr.message}` }, 500);
    }
    const latestMembership = (membershipRows as MembershipRow[] | null)?.[0];
    if (!isMembershipActive(latestMembership)) {
      return json({ error: "El conductor no tiene una membresia activa y vigente" }, 409);
    }

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
