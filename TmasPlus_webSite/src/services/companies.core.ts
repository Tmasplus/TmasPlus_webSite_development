import { supabase } from "@/config/supabase";
import type { CreateBookingInput, CustomerLite } from "./bookings.service";
import type { PersonInfo } from "./bookingDetail.service";
import { normalizeBooking, toServiceSnapshot } from "./coreBookings.service";
import {
  CHARGE_CONCEPTS,
  COMPANY_DOCUMENTS,
  forViewer,
  type BillingEvent,
  type BillingField,
  type ChargeLine,
  type ChargeParam,
  type ChargeParamKey,
  type Collaborator,
  type CollaboratorInput,
  type Company,
  type CompanyBooking,
  type CompanyBookingFilters,
  type CompanyBookingStatus,
  type CompanyDocument,
  type CompanyInput,
  type CompanyLink,
  type CompanyOption,
  type CompanyTariff,
  type CompanyTripTariff,
  type CompanyViewer,
  type CorporateTripDetail,
  type DriverPaymentStatus,
  type ExistingAppUser,
  type InvoiceStatus,
} from "./companies.service";

// Tablas y vistas de 019_empresas.sql aún no están en los tipos generados.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const LOGO_BUCKET = "user-profiles";
const DOCS_BUCKET = "user-documents";

/** Estados de la UI -> valores de reserva.estado en core. */
const RAW_STATUSES: Record<CompanyBookingStatus, string[]> = {
  PENDING: ["NEW", "PENDING"],
  ACCEPTED: ["ACCEPTED"],
  ARRIVED_PICKUP: ["ARRIVED"],
  STARTED: ["STARTED"],
  ARRIVED_DESTINATION: ["REACHED"],
  COMPLETED: ["COMPLETE"],
  PAID: ["PAID"],
  CANCELLED: ["CANCELLED"],
};
const UI_STATUS: Record<string, CompanyBookingStatus> = Object.fromEntries(
  (Object.keys(RAW_STATUSES) as CompanyBookingStatus[]).flatMap((ui) => RAW_STATUSES[ui].map((raw) => [raw, ui]))
);

function fail(error: { message?: string } | null, fallback: string): never {
  throw new Error(error?.message || fallback);
}

/** Mensaje de error del cuerpo de una Edge Function (functions.invoke lo esconde en error.context). */
async function invoke<T>(name: string, body: Record<string, unknown>, fallback: string): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("No hay sesión activa");
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) {
    let message = error.message || fallback;
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        /* se conserva el mensaje genérico */
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

const ext = (file: File) => (file.name.split(".").pop() || "bin").toLowerCase();
const sanitize = (q: string) => q.replace(/[,()*%\\]/g, " ").replace(/\s+/g, " ").trim();

/** Datos para las RPC: sin contraseña ni archivos. La contraseña solo viaja a la Edge Function de alta. */
function companyPayload(input: CompanyInput, logoUrl?: string | null, withPassword = false): Row {
  const payload: Row = { ...input };
  delete payload.logo_file;
  delete payload.documentos;
  if (!withPassword) delete payload.password;
  if (logoUrl !== undefined) payload.logo_url = logoUrl;
  return payload;
}

async function uploadLogo(companyId: string, file: File): Promise<string> {
  const path = `${companyId}/logo_${Date.now()}.${ext(file)}`;
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { upsert: true, cacheControl: "3600" });
  if (error) fail(error, "No se pudo subir el logo");
  return supabase.storage.from(LOGO_BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadDocuments(companyId: string, input: CompanyInput) {
  for (const { tipo } of COMPANY_DOCUMENTS) {
    const doc = input.documentos[tipo];
    if (!doc?.file) continue;
    const path = `${companyId}/empresa/${tipo}/${crypto.randomUUID()}.${ext(doc.file)}`;
    const { error: upError } = await supabase.storage.from(DOCS_BUCKET).upload(path, doc.file, { upsert: false });
    if (upError) fail(upError, "No se pudo subir el documento");
    const { error } = await db.rpc("web_admin_registrar_documento_empresa", {
      p_empresa: companyId,
      p_tipo: tipo,
      p_input: {
        storage_path: path,
        nombre_archivo: doc.file.name,
        mime_type: doc.file.type,
        tamano_bytes: doc.file.size,
        fecha_expedicion: doc.fecha_expedicion,
      },
    });
    if (error) fail(error, "No se pudo registrar el documento");
  }
}

function toCompany(row: Row, docs: Row[]): Company {
  return {
    id: row.id,
    razon_social: row.razon_social,
    nombre_comercial: row.nombre_comercial,
    nit: row.nit ?? "",
    dv: row.dv ?? "",
    tipo_empresa: row.tipo_sociedad ?? "OTRA",
    tipo_empresa_otra: row.tipo_sociedad_otra,
    ciiu: row.ciiu,
    logo_url: row.logo_url,
    correo_corporativo: row.correo_corporativo ?? "",
    correo_facturacion: row.correo_facturacion ?? null,
    telefono: row.telefono ?? "",
    pais: row.pais ?? "Colombia",
    departamento: row.departamento ?? "",
    ciudad: row.ciudad ?? "",
    direccion: row.direccion ?? "",
    sitio_web: row.sitio_web,
    rep_nombre: row.rep_nombre ?? "",
    rep_tipo_documento: row.rep_tipo_documento ?? "CC",
    rep_numero_documento: row.rep_numero_documento ?? "",
    rep_email: row.rep_email ?? "",
    rep_telefono: row.rep_telefono,
    acceso_email: row.acceso_email ?? "",
    documentos: docs
      .filter((d: Row) => d.id_empresa === row.id)
      .map((d: Row) => ({
        tipo: d.tipo,
        nombre_archivo: d.nombre_archivo,
        tamano_bytes: d.tamano_bytes,
        fecha_expedicion: d.fecha_expedicion,
        subido_en: d.subido_en,
        url: null,
        storage_path: d.storage_path,
      })),
    activo: row.activo,
    creado_en: row.creado_en,
    total_colaboradores: Number(row.total_colaboradores) || 0,
    total_viajes: Number(row.total_viajes) || 0,
  };
}

async function loadCompanies(id?: string): Promise<Company[]> {
  let q = db.from("web_empresas").select("*").order("creado_en", { ascending: false });
  if (id) q = q.eq("id", id);
  const { data, error } = await q;
  if (error) fail(error, "No se pudieron cargar las empresas");
  if (!data?.length) return [];
  let dq = db.from("web_empresa_documentos").select("*");
  if (id) dq = dq.eq("id_empresa", id);
  const { data: docs, error: docsError } = await dq;
  if (docsError) fail(docsError, "No se pudieron cargar los documentos");
  return data.map((row: Row) => toCompany(row, docs ?? []));
}

async function getCompany(id: string): Promise<Company> {
  const [company] = await loadCompanies(id);
  if (!company) throw new Error("Empresa no encontrada");
  return company;
}

function toCollaborator(row: Row): Collaborator {
  return {
    id: row.id,
    id_empresa: row.id_empresa,
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    email: row.email ?? "",
    mobile: row.mobile ?? "",
    document_type: row.document_type ?? "",
    document_number: row.document_number ?? "",
    city: row.city ?? "",
    cargo: row.cargo,
    area: row.area,
    activo: row.activo,
    creado_en: row.creado_en,
    profile_image: row.profile_image ?? null,
  };
}

function toBooking(row: Row, charges: ChargeLine[], history: BillingEvent[]): CompanyBooking {
  return {
    id: row.id,
    reference: row.reference ?? row.id.slice(0, 8),
    status: UI_STATUS[row.status] ?? "PENDING",
    booking_type: row.booking_type === "scheduled" ? "SCHEDULED" : "IMMEDIATE",
    booking_date: row.booking_date,
    created_at: row.created_at,
    company_id: row.company_id,
    company_name: row.company_name,
    collaborator_id: row.collaborator_id,
    collaborator_name: row.collaborator_name,
    collaborator_contact: row.collaborator_contact,
    collaborator_email: row.collaborator_email,
    requested_by: row.requested_by,
    cost_center: row.centro_costo ?? null,
    pickup_address: row.pickup_address ?? "",
    drop_address: row.drop_address ?? "",
    distance_km: Number(row.distance_km) || 0,
    duration_min: Number(row.duration_min) || 0,
    car_type: row.car_type ?? "",
    trip_type: "",
    total_cost: Number(row.total_cost) || 0,
    estimate: Number(row.estimate) || 0,
    payment_mode: row.payment_mode,
    observations: row.observations,
    driver_id: row.driver_id,
    driver_name: row.driver_name,
    driver_contact: row.driver_contact,
    plate_number: row.plate_number,
    cancelled_by: row.cancelled_by,
    cancel_reason: row.cancel_reason,
    cancelled_at: row.cancelled_at,
    estado_facturacion: row.estado_facturacion,
    factura_referencia: row.factura_referencia,
    estado_pago_conductor: row.estado_pago_conductor,
    driver_share: row.driver_share === null || row.driver_share === undefined ? null : Number(row.driver_share),
    company_charge: row.company_charge === null || row.company_charge === undefined ? null : Number(row.company_charge),
    cobros: charges,
    historial_cobro: history,
  };
}

/** Cobros por concepto de cada servicio; los conceptos sin calcular quedan en null. */
async function loadCharges(ids: string[]): Promise<Map<string, ChargeLine[]>> {
  const out = new Map<string, ChargeLine[]>();
  if (!ids.length) return out;
  const { data, error } = await db.from("web_reserva_empresa_cobros").select("*").in("id_reserva", ids);
  if (error) fail(error, "No se pudo cargar la liquidación");
  for (const id of ids) {
    const rows = (data ?? []).filter((r: Row) => r.id_reserva === id);
    out.set(
      id,
      CHARGE_CONCEPTS.map((c) => {
        const row = rows.find((r: Row) => r.concepto === c.codigo);
        return { concepto: c.codigo, monto: row ? Number(row.monto) : null, tercero: row?.tercero_nombre ?? null };
      })
    );
  }
  return out;
}

async function loadHistory(ids: string[]): Promise<Map<string, BillingEvent[]>> {
  const out = new Map<string, BillingEvent[]>();
  if (!ids.length) return out;
  const { data, error } = await db
    .from("reserva_empresa_estado_historial")
    .select("*")
    .in("id_reserva", ids)
    .order("cambiado_en", { ascending: false });
  if (error) fail(error, "No se pudo cargar el historial");
  const people = [...new Set((data ?? []).map((r: Row) => r.cambiado_por).filter(Boolean))];
  const names = new Map<string, string>();
  if (people.length) {
    const { data: users } = await db.from("web_users").select("id,first_name,last_name").in("id", people);
    (users ?? []).forEach((u: Row) => names.set(u.id, [u.first_name, u.last_name].filter(Boolean).join(" ")));
  }
  for (const r of data ?? []) {
    const list = out.get(r.id_reserva) ?? [];
    list.push({
      campo: r.tipo,
      valor_anterior: r.estado_anterior ?? "",
      valor_nuevo: r.estado_nuevo,
      referencia: r.referencia,
      nota: r.nota,
      cambiado_en: r.cambiado_en,
      cambiado_por: names.get(r.cambiado_por) || "Sistema",
    });
    out.set(r.id_reserva, list);
  }
  return out;
}

async function loadBookings(rows: Row[], viewer: CompanyViewer): Promise<CompanyBooking[]> {
  const ids = rows.map((r) => r.id);
  const [charges, history] = await Promise.all([
    loadCharges(ids),
    viewer === "admin" ? loadHistory(ids) : Promise.resolve(new Map<string, BillingEvent[]>()),
  ]);
  return rows.map((r) => forViewer(toBooking(r, charges.get(r.id) ?? [], history.get(r.id) ?? []), viewer));
}

async function fetchBooking(id: string, viewer: CompanyViewer): Promise<CompanyBooking | null> {
  const { data, error } = await db.from("web_reservas_empresa").select("*").eq("id", id).maybeSingle();
  if (error) fail(error, "No se pudo cargar el viaje");
  if (!data) return null;
  const [booking] = await loadBookings([data], viewer);
  return booking;
}

async function requireBooking(id: string, viewer: CompanyViewer): Promise<CompanyBooking> {
  const booking = await fetchBooking(id, viewer);
  if (!booking) throw new Error("Operación realizada; actualiza la lista para ver el viaje.");
  return booking;
}

export const CompaniesCore = {
  list: (): Promise<Company[]> => loadCompanies(),

  async get(id: string): Promise<Company | null> {
    const [company] = await loadCompanies(id);
    return company ?? null;
  },

  async create(input: CompanyInput): Promise<Company> {
    const { id } = await invoke<{ id: string }>(
      "core-company-create",
      companyPayload(input, undefined, true),
      "No se pudo crear la empresa"
    );
    // La cuenta ya existe: si falla el logo o un documento, se avisa y se completa editando.
    if (input.logo_file) {
      const logoUrl = await uploadLogo(id, input.logo_file);
      const { error } = await db.rpc("web_admin_actualizar_empresa", { p_id: id, p_input: companyPayload(input, logoUrl) });
      if (error) fail(error, "Empresa creada, pero no se pudo guardar el logo");
    }
    await uploadDocuments(id, input);
    return getCompany(id);
  },

  async update(id: string, input: CompanyInput): Promise<Company> {
    let logoUrl: string | null | undefined;
    if (input.logo_file === null) logoUrl = null;
    else if (input.logo_file) logoUrl = await uploadLogo(id, input.logo_file);
    const { error } = await db.rpc("web_admin_actualizar_empresa", { p_id: id, p_input: companyPayload(input, logoUrl) });
    if (error) fail(error, "No se pudo actualizar la empresa");
    await uploadDocuments(id, input);
    return getCompany(id);
  },

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await db.rpc("web_admin_set_empresa_activa", { p_id: id, p_activa: active });
    if (error) fail(error, "No se pudo actualizar la empresa");
  },

  async documentUrl(doc: CompanyDocument): Promise<string | null> {
    if (doc.url) return doc.url;
    if (!doc.storage_path) return null;
    const { data, error } = await supabase.storage.from(DOCS_BUCKET).createSignedUrl(doc.storage_path, 300);
    if (error) fail(error, "No se pudo abrir el documento");
    return data?.signedUrl ?? null;
  },

  async listCompanyOptions(): Promise<CompanyOption[]> {
    const { data, error } = await db.from("web_empresas").select("id,razon_social,nombre_comercial,activo");
    if (error) fail(error, "No se pudieron cargar las empresas");
    return (data ?? [])
      .map((r: Row) => ({ id: r.id, name: r.nombre_comercial || r.razon_social, active: r.activo }))
      .sort((a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name, "es"));
  },

  async listAllCompanyLinks(): Promise<CompanyLink[]> {
    const companies = await CompaniesCore.listCompanyOptions();
    const byId = new Map(companies.map((c) => [c.id, c]));
    const rows: Row[] = [];
    // PostgREST devuelve como máximo 1000 filas por consulta.
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db
        .from("web_empresa_colaboradores")
        .select("id,id_empresa,activo,cargo,area")
        .order("id_vinculo")
        .range(from, from + 999);
      if (error) fail(error, "No se pudieron cargar los vínculos con empresas");
      rows.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return rows.map((r) => ({
      personId: r.id,
      companyId: r.id_empresa,
      companyName: byId.get(r.id_empresa)?.name ?? "Empresa",
      companyActive: byId.get(r.id_empresa)?.active ?? false,
      active: r.activo,
      cargo: r.cargo,
      area: r.area,
    }));
  },

  async listCollaborators(companyId: string): Promise<Collaborator[]> {
    const { data, error } = await db
      .from("web_empresa_colaboradores")
      .select("*")
      .eq("id_empresa", companyId)
      .order("creado_en", { ascending: false });
    if (error) fail(error, "No se pudieron cargar los colaboradores");
    return (data ?? []).map(toCollaborator);
  },

  async searchCollaborators(companyId: string, query: string, limit: number): Promise<CustomerLite[]> {
    let q = db
      .from("web_empresa_colaboradores")
      .select("id,first_name,last_name,email,mobile")
      .eq("id_empresa", companyId)
      .eq("activo", true);
    const term = sanitize(query);
    if (term) {
      q = q.or(
        ["first_name", "last_name", "email", "mobile", "document_number", "cargo", "area"]
          .map((c) => `${c}.ilike.*${term}*`)
          .join(",")
      );
    }
    const { data, error } = await q.order("first_name").limit(limit);
    if (error) fail(error, "No se pudieron buscar colaboradores");
    return data ?? [];
  },

  async createCollaborator(
    companyId: string,
    input: CollaboratorInput
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> {
    const result = await invoke<{ id_persona: string; vinculado_existente: boolean }>(
      "core-company-collaborator",
      { ...input, company_id: companyId },
      "No se pudo crear el colaborador"
    );
    const { data, error } = await db
      .from("web_empresa_colaboradores")
      .select("*")
      .eq("id_empresa", companyId)
      .eq("id", result.id_persona)
      .maybeSingle();
    if (error || !data) fail(error, "Colaborador creado; actualiza la lista para verlo");
    return { collaborator: toCollaborator(data), linkedExisting: result.vinculado_existente };
  },

  async findExistingAppUsers(companyId: string, input: Partial<CollaboratorInput>): Promise<ExistingAppUser[]> {
    const { data, error } = await db.rpc("web_empresa_buscar_usuario_app", {
      p_empresa: companyId,
      p_input: input,
    });
    if (error) fail(error, "No se pudo verificar si el usuario ya existe");
    return (data ?? []).map((r: Row) => ({
      id: r.persona_id,
      first_name: r.nombres ?? "",
      last_name: r.apellidos ?? "",
      document_type: r.tipo_doc,
      document_number: r.documento,
      city: r.ciudad_nombre,
      email: r.correo_visible,
      mobile: r.telefono_visible,
      isAppUser: r.es_usuario_app,
      alreadyLinked: r.ya_vinculado,
      matches: r.coincidencias ?? [],
    }));
  },

  async linkExistingAppUser(
    companyId: string,
    personId: string,
    input: Partial<CollaboratorInput>
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> {
    const { error } = await db.rpc("web_empresa_vincular_usuario_app", {
      p_empresa: companyId,
      p_persona: personId,
      p_input: input,
    });
    if (error) fail(error, "No se pudo vincular el usuario");
    const { data, error: readError } = await db
      .from("web_empresa_colaboradores")
      .select("*")
      .eq("id_empresa", companyId)
      .eq("id", personId)
      .maybeSingle();
    if (readError || !data) fail(readError, "Colaborador vinculado; actualiza la lista para verlo");
    return { collaborator: toCollaborator(data), linkedExisting: true };
  },

  async setCollaboratorActive(companyId: string, collaboratorId: string, active: boolean): Promise<void> {
    const { error } = await db.rpc("web_empresa_set_colaborador_activo", {
      p_empresa: companyId,
      p_persona: collaboratorId,
      p_activo: active,
    });
    if (error) fail(error, "No se pudo actualizar el colaborador");
  },

  async listBookings(f: CompanyBookingFilters, viewer: CompanyViewer): Promise<CompanyBooking[]> {
    let q = db.from("web_reservas_empresa").select("*");
    if (f.companyId) q = q.eq("company_id", f.companyId);
    if (f.collaboratorId) q = q.eq("collaborator_id", f.collaboratorId);
    if (f.status) q = q.in("status", RAW_STATUSES[f.status]);
    if (f.invoiceStatus) q = q.eq("estado_facturacion", f.invoiceStatus);
    if (viewer === "admin" && f.paymentStatus) q = q.eq("estado_pago_conductor", f.paymentStatus);
    if (f.dateFrom) q = q.gte("booking_date", new Date(`${f.dateFrom}T00:00:00`).toISOString());
    if (f.dateTo) q = q.lte("booking_date", new Date(`${f.dateTo}T23:59:59.999`).toISOString());
    const term = sanitize(f.search ?? "");
    if (term) {
      q = q.or(
        ["reference", "collaborator_name", "company_name", "pickup_address", "drop_address", "driver_name", "plate_number"]
          .map((c) => `${c}.ilike.*${term}*`)
          .join(",")
      );
    }
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
    if (error) fail(error, "No se pudieron cargar los viajes");
    return loadBookings(data ?? [], viewer);
  },

  getBooking: (bookingId: string, viewer: CompanyViewer): Promise<CompanyBooking | null> =>
    fetchBooking(bookingId, viewer),

  async getTripDetail(bookingId: string): Promise<CorporateTripDetail> {
    const { data, error } = await db.rpc("web_empresa_reserva_detalle", { p_reserva: bookingId });
    if (error || !data?.booking) fail(error, "No se pudo cargar el detalle del viaje");
    const person = (p: Row | null): PersonInfo | null =>
      p
        ? {
            id: p.id,
            name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
            email: p.email ?? null,
            mobile: p.mobile ?? null,
            photo: p.profile_image ?? null,
            rating: p.rating == null ? null : Number(p.rating),
          }
        : null;
    const v: Row | null = data.vehicle;
    return {
      booking: normalizeBooking(data.booking),
      extras: {
        reserva: data.reserva,
        snapshots: (data.snapshots ?? []).map(toServiceSnapshot),
        tracking: (data.tracking ?? [])
          .map((t: Row) => ({
            lat: Number(t.lat),
            lng: Number(t.lng),
            ts: new Date(t.registrado_en).getTime(),
            speed: t.velocidad == null ? null : Number(t.velocidad),
            accuracy: t.precision_m == null ? null : Number(t.precision_m),
          }))
          .filter((t: { lat: number; lng: number; ts: number }) =>
            Number.isFinite(t.lat) && Number.isFinite(t.lng) && Number.isFinite(t.ts)
          ),
        driver: person(data.driver),
        customer: person(data.customer),
        vehicle: v
          ? {
              id: v.id ?? null,
              make: v.make ?? null,
              model: v.model ?? null,
              color: v.color ?? null,
              plate: v.plate ?? v.vehicle_number ?? null,
              year: v.vehicle_year ?? null,
            }
          : null,
        errors: [],
      },
    };
  },

  async setBillingStatus(
    bookingIds: string[],
    field: BillingField,
    value: InvoiceStatus | DriverPaymentStatus,
    referencia: string | null,
    nota: string | null
  ): Promise<void> {
    const { error } = await db.rpc("web_admin_set_reserva_empresa_estado", {
      p_reservas: bookingIds,
      p_tipo: field,
      p_estado: value,
      p_referencia: referencia,
      p_nota: nota,
    });
    if (error) fail(error, "No se pudo actualizar el estado");
  },

  async getTripTariff(bookingId: string): Promise<CompanyTripTariff | null> {
    const { data, error } = await db.from("web_reserva_empresa_tarifas").select("*").eq("id_reserva", bookingId).maybeSingle();
    if (error) fail(error, "No se pudo cargar la tarifa del viaje");
    if (!data) return null;
    return {
      porcentaje_tplus: Number(data.porcentaje_tplus),
      payu_comision: Number(data.payu_comision),
      paquete_polizas: Number(data.paquete_polizas),
      factor_procesamiento: Number(data.factor_procesamiento),
      iva_procesamiento: Number(data.iva_procesamiento),
      actualizado_en: data.actualizado_en ?? null,
      actualizado_por: data.actualizado_por_nombre ?? null,
    };
  },

  async setTripTariff(bookingId: string, porcentaje: number, payu: number): Promise<void> {
    const { error } = await db.rpc("web_admin_set_tarifa_reserva_empresa", {
      p_reserva: bookingId,
      p_porcentaje: porcentaje,
      p_payu: payu,
    });
    if (error) fail(error, "No se pudo actualizar la tarifa del viaje");
  },

  async listChargeParams(): Promise<ChargeParam[]> {
    const { data, error } = await db.from("empresa_cobro_parametro").select("clave,valor,descripcion,actualizado_en");
    if (error) fail(error, "No se pudieron cargar los valores por defecto");
    return (data ?? []).map((r: Row) => ({
      clave: r.clave,
      valor: Number(r.valor),
      descripcion: r.descripcion,
      actualizado_en: r.actualizado_en ?? null,
    }));
  },

  async setChargeParam(key: ChargeParamKey, value: number): Promise<void> {
    const { error } = await db.rpc("web_admin_set_parametro_cobro_empresa", { p_clave: key, p_valor: value });
    if (error) fail(error, "No se pudo guardar el valor por defecto");
  },

  async getCompanyTariff(companyId: string): Promise<CompanyTariff> {
    const { data, error } = await db.from("web_empresa_tarifas").select("*").eq("id_empresa", companyId).maybeSingle();
    if (error) fail(error, "No se pudo cargar la tarifa de la empresa");
    if (!data) throw new Error("Empresa no encontrada");
    return {
      porcentaje_tplus: Number(data.porcentaje_tplus),
      payu_comision: Number(data.payu_comision),
      porcentaje_personalizado: !!data.porcentaje_personalizado,
      payu_personalizado: !!data.payu_personalizado,
      porcentaje_defecto: Number(data.porcentaje_defecto),
      payu_defecto: Number(data.payu_defecto),
      actualizado_en: data.actualizado_en ?? null,
      actualizado_por: data.actualizado_por_nombre ?? null,
    };
  },

  async setCompanyTariff(
    companyId: string,
    porcentaje: number | null,
    payu: number | null,
    applyToUninvoiced: boolean
  ): Promise<number> {
    const { data, error } = await db.rpc("web_admin_set_tarifa_empresa", {
      p_empresa: companyId,
      p_porcentaje: porcentaje,
      p_payu: payu,
      p_aplicar_sin_facturar: applyToUninvoiced,
    });
    if (error) fail(error, "No se pudo guardar la tarifa de la empresa");
    return Number(data) || 0;
  },

  async createBooking(companyId: string, input: CreateBookingInput, requestedBy: CompanyViewer): Promise<CompanyBooking> {
    const { data, error } = await db.rpc("web_empresa_crear_reserva", {
      p_empresa: requestedBy === "admin" ? companyId : null,
      p_input: input,
    });
    if (error) fail(error, "No se pudo solicitar el viaje");
    return requireBooking(String(data), requestedBy);
  },

  async cancelBooking(bookingId: string, reason: string, viewer: CompanyViewer): Promise<CompanyBooking> {
    const { error } =
      viewer === "admin"
        ? await db.rpc("web_cancel_booking", { p_booking_id: bookingId, p_reason: reason || "Cancelada por administrador" })
        : await db.rpc("web_empresa_cancelar_reserva", { p_reserva: bookingId, p_motivo: reason });
    if (error) fail(error, "No se pudo cancelar el viaje");
    return requireBooking(bookingId, viewer);
  },
};
