import type { CreateBookingInput, CustomerLite } from "./bookings.service";
import {
  canCancelBooking,
  CHARGE_CONCEPTS,
  collaboratorFullName,
  COMPANY_DOCUMENTS,
  CORPORATE_PAYMENT_MODE,
  forViewer,
  isBillableTrip,
  type AppUserMatch,
  type BillingField,
  type Collaborator,
  type ExistingAppUser,
  type CorporateTripDetail,
  type DriverPaymentStatus,
  type InvoiceStatus,
  type CollaboratorInput,
  type Company,
  type CompanyBooking,
  type CompanyBookingFilters,
  type CompanyDocument,
  type CompanyInput,
  type CompanyLink,
  type CompanyOption,
  type CompanyViewer,
} from "./companies.service";

// Almacén de demostración en localStorage: se reemplaza por las RPC de core
// cuando exista el backend. No toca Supabase.
const STORAGE_KEY = "tplus_demo_empresas_v1";

type StoredCompany = Omit<Company, "total_colaboradores" | "total_viajes">;

type Store = {
  companies: StoredCompany[];
  collaborators: Collaborator[];
  bookings: CompanyBooking[];
};

function load(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Store>;
      return {
        companies: (parsed.companies ?? []).map((c) => ({ ...c, documentos: c.documentos ?? [] })),
        collaborators: parsed.collaborators ?? [],
        bookings: (parsed.bookings ?? []).map((b) => ({
          ...b,
          estado_facturacion: b.estado_facturacion ?? "sin_facturar",
          factura_referencia: b.factura_referencia ?? null,
          estado_pago_conductor: b.estado_pago_conductor ?? "sin_pagar",
          driver_share: b.driver_share ?? null,
          cobros: b.cobros ?? initialCharges(b.total_cost, b.driver_name),
          historial_cobro: b.historial_cobro ?? [],
        })),
      };
    }
  } catch {
    /* datos corruptos: se empieza vacío */
  }
  return { companies: [], collaborators: [], bookings: [] };
}

function save(store: Store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    throw new Error("No hay espacio para guardar los datos de demostración. Usa un logo más liviano.");
  }
}

// Mientras no exista la lógica de cobro empresarial, solo se conoce el costo del viaje.
function initialCharges(totalCost: number, driverName: string | null) {
  return CHARGE_CONCEPTS.map((c) => ({
    concepto: c.codigo,
    monto: c.codigo === "costo_viaje" ? totalCost : null,
    tercero: c.codigo === "costo_viaje" ? driverName : null,
  }));
}

const latency = () => new Promise((r) => setTimeout(r, 200));
const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const sameEmail = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No se pudo leer el logo"));
    reader.readAsDataURL(file);
  });
}

function randomReference() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `EMP-${s}`;
}

function withStats(store: Store, c: StoredCompany): Company {
  return {
    ...c,
    total_colaboradores: store.collaborators.filter((x) => x.id_empresa === c.id && x.activo).length,
    total_viajes: store.bookings.filter((b) => b.company_id === c.id).length,
  };
}

// Solo se guardan los datos del archivo: el contenido no cabe en localStorage.
function mergeDocuments(input: CompanyInput, current: CompanyDocument[]): CompanyDocument[] {
  return COMPANY_DOCUMENTS.map(({ tipo, label }) => {
    const doc = input.documentos[tipo];
    const existing = current.find((d) => d.tipo === tipo);
    if (doc?.file) {
      return {
        tipo,
        nombre_archivo: doc.file.name,
        tamano_bytes: doc.file.size,
        fecha_expedicion: doc.fecha_expedicion,
        subido_en: new Date().toISOString(),
        url: null,
      };
    }
    if (!existing) throw new Error(`Falta el documento: ${label}.`);
    return { ...existing, fecha_expedicion: doc?.fecha_expedicion || existing.fecha_expedicion };
  });
}

function cleanCompanyInput(
  input: CompanyInput
): Omit<StoredCompany, "id" | "logo_url" | "activo" | "creado_en" | "documentos"> {
  return {
    razon_social: input.razon_social.trim(),
    nombre_comercial: input.nombre_comercial,
    nit: input.nit.replace(/\D/g, ""),
    dv: input.dv,
    tipo_empresa: input.tipo_empresa,
    tipo_empresa_otra: input.tipo_empresa_otra,
    ciiu: input.ciiu,
    correo_corporativo: input.correo_corporativo.trim().toLowerCase(),
    telefono: input.telefono.trim(),
    pais: input.pais,
    departamento: input.departamento,
    ciudad: input.ciudad,
    direccion: input.direccion.trim(),
    sitio_web: input.sitio_web,
    rep_nombre: input.rep_nombre.trim(),
    rep_tipo_documento: input.rep_tipo_documento,
    rep_numero_documento: input.rep_numero_documento.trim(),
    rep_email: input.rep_email.trim().toLowerCase(),
    rep_telefono: input.rep_telefono,
    acceso_email: input.acceso_email.trim().toLowerCase(),
  };
}

function assertUniqueCompany(store: Store, data: { nit: string; acceso_email: string }, ignoreId?: string) {
  const others = store.companies.filter((c) => c.id !== ignoreId);
  if (others.some((c) => c.nit === data.nit)) throw new Error("Ya existe una empresa con ese NIT.");
  if (
    others.some((c) => sameEmail(c.acceso_email, data.acceso_email)) ||
    store.collaborators.some((c) => sameEmail(c.email, data.acceso_email))
  ) {
    throw new Error("El correo de acceso ya está en uso por otra cuenta.");
  }
}

function findCompany(store: Store, id: string): StoredCompany {
  const c = store.companies.find((x) => x.id === id);
  if (!c) throw new Error("Empresa no encontrada.");
  return c;
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function seedDemoCompany(store: Store, email: string): StoredCompany {
  const company: StoredCompany = {
    id: crypto.randomUUID(),
    razon_social: "Empresa Demo T+Plus S.A.S.",
    nombre_comercial: "Empresa Demo",
    nit: "900123456",
    dv: "8",
    tipo_empresa: "SAS",
    tipo_empresa_otra: null,
    ciiu: "4923",
    logo_url: null,
    correo_corporativo: "contacto@empresademo.test",
    telefono: "6010000000",
    pais: "Colombia",
    departamento: "Bogotá D. C.",
    ciudad: "Bogotá",
    direccion: "Calle 100 # 10-20",
    sitio_web: null,
    rep_nombre: "Laura Gómez",
    rep_tipo_documento: "CC",
    rep_numero_documento: "1020304050",
    rep_email: "representante@empresademo.test",
    rep_telefono: null,
    acceso_email: email,
    documentos: [
      { tipo: "camara_comercio", nombre_archivo: "camara_comercio_demo.pdf", tamano_bytes: 245_000, fecha_expedicion: daysAgo(5), subido_en: new Date().toISOString(), url: null },
      { tipo: "rut", nombre_archivo: "rut_demo.pdf", tamano_bytes: 180_000, fecha_expedicion: daysAgo(40), subido_en: new Date().toISOString(), url: null },
    ],
    activo: true,
    creado_en: new Date().toISOString(),
  };
  const base = { id_empresa: company.id, document_type: "CC", city: "Bogotá", activo: true, creado_en: new Date().toISOString() };
  store.companies.unshift(company);
  store.collaborators.unshift(
    { ...base, id: crypto.randomUUID(), first_name: "Andrés", last_name: "Pérez", email: "andres.perez@empresademo.test", mobile: "3001234567", document_number: "80123456", cargo: "Gerente comercial", area: "Comercial" },
    { ...base, id: crypto.randomUUID(), first_name: "María", last_name: "Rodríguez", email: "maria.rodriguez@empresademo.test", mobile: "3109876543", document_number: "52987654", cargo: "Analista", area: "Operaciones" }
  );
  return company;
}

export const CompaniesMock = {
  /** Empresa asociada al acceso de prueba; se crea con datos de ejemplo si no existe. */
  async ensureDemoCompany(email: string): Promise<Company> {
    const store = load();
    let company = store.companies.find((c) => sameEmail(c.acceso_email, email));
    if (!company) {
      company = seedDemoCompany(store, email.trim().toLowerCase());
      save(store);
    }
    return withStats(store, company);
  },

  async findByAccessEmail(email: string): Promise<Company | null> {
    const store = load();
    const company = store.companies.find((c) => sameEmail(c.acceso_email, email));
    return company ? withStats(store, company) : null;
  },

  async list(): Promise<Company[]> {
    await latency();
    const store = load();
    return store.companies.map((c) => withStats(store, c));
  },

  async get(id: string): Promise<Company | null> {
    await latency();
    const store = load();
    const c = store.companies.find((x) => x.id === id);
    return c ? withStats(store, c) : null;
  },

  async create(input: CompanyInput): Promise<Company> {
    await latency();
    const store = load();
    const data = cleanCompanyInput(input);
    assertUniqueCompany(store, data);
    const company: StoredCompany = {
      ...data,
      id: crypto.randomUUID(),
      documentos: mergeDocuments(input, []),
      logo_url: input.logo_file ? await fileToDataUrl(input.logo_file) : null,
      activo: true,
      creado_en: new Date().toISOString(),
    };
    store.companies.unshift(company);
    save(store);
    return withStats(store, company);
  },

  async update(id: string, input: CompanyInput): Promise<Company> {
    await latency();
    const store = load();
    const current = findCompany(store, id);
    const data = cleanCompanyInput(input);
    assertUniqueCompany(store, data, id);
    let logo_url = current.logo_url;
    if (input.logo_file === null) logo_url = null;
    else if (input.logo_file) logo_url = await fileToDataUrl(input.logo_file);
    const updated: StoredCompany = {
      ...current,
      ...data,
      acceso_email: current.acceso_email,
      documentos: mergeDocuments(input, current.documentos),
      logo_url,
    };
    store.companies = store.companies.map((c) => (c.id === id ? updated : c));
    store.bookings = store.bookings.map((b) =>
      b.company_id === id ? { ...b, company_name: updated.nombre_comercial || updated.razon_social } : b
    );
    save(store);
    return withStats(store, updated);
  },

  async documentUrl(): Promise<string | null> {
    return null;
  },

  async getTripDetail(): Promise<CorporateTripDetail> {
    throw new Error("El detalle con ruta y GPS no está disponible con datos de demostración.");
  },

  async listCompanyOptions(): Promise<CompanyOption[]> {
    return load()
      .companies.map((c) => ({ id: c.id, name: c.nombre_comercial || c.razon_social, active: c.activo }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  },

  async listAllCompanyLinks(): Promise<CompanyLink[]> {
    const store = load();
    return store.collaborators.map((c) => {
      const company = store.companies.find((x) => x.id === c.id_empresa);
      return {
        personId: c.id,
        companyId: c.id_empresa,
        companyName: company ? company.nombre_comercial || company.razon_social : "Empresa",
        companyActive: company?.activo ?? false,
        active: c.activo,
        cargo: c.cargo,
        area: c.area,
      };
    });
  },

  async getBooking(bookingId: string, viewer: CompanyViewer): Promise<CompanyBooking | null> {
    const b = load().bookings.find((x) => x.id === bookingId);
    return b ? forViewer(b, viewer) : null;
  },

  async setActive(id: string, active: boolean): Promise<void> {
    await latency();
    const store = load();
    findCompany(store, id);
    store.companies = store.companies.map((c) => (c.id === id ? { ...c, activo: active } : c));
    save(store);
  },

  async listCollaborators(companyId: string): Promise<Collaborator[]> {
    await latency();
    return load().collaborators.filter((c) => c.id_empresa === companyId);
  },

  async searchCollaborators(companyId: string, query: string, limit: number): Promise<CustomerLite[]> {
    await latency();
    const q = norm(query);
    return load()
      .collaborators.filter((c) => c.id_empresa === companyId && c.activo)
      .filter((c) =>
        !q ||
        [collaboratorFullName(c), c.email, c.mobile, c.document_number, c.cargo, c.area].some((v) =>
          norm(v).includes(q)
        )
      )
      .slice(0, limit)
      .map((c) => ({ id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, mobile: c.mobile }));
  },

  async createCollaborator(
    companyId: string,
    input: CollaboratorInput
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> {
    await latency();
    const store = load();
    const company = findCompany(store, companyId);
    if (!company.activo) throw new Error("La empresa está inactiva.");
    const email = input.email.trim().toLowerCase();
    if (store.companies.some((c) => sameEmail(c.acceso_email, email))) {
      throw new Error("Ese correo pertenece a la cuenta de una empresa.");
    }
    if (store.collaborators.some((c) => c.id_empresa === companyId && sameEmail(c.email, email))) {
      throw new Error("Esa persona ya es colaboradora de la empresa.");
    }
    // El mismo Usuario App puede pertenecer a varias empresas: se vincula sin crear otra cuenta.
    const existing = store.collaborators.find((c) => sameEmail(c.email, email));
    const collaborator: Collaborator = {
      id: existing?.id ?? crypto.randomUUID(),
      id_empresa: companyId,
      first_name: existing?.first_name ?? input.first_name.trim(),
      last_name: existing?.last_name ?? input.last_name.trim(),
      email,
      mobile: existing?.mobile ?? input.mobile.trim(),
      document_type: existing?.document_type ?? input.document_type,
      document_number: existing?.document_number ?? input.document_number.trim(),
      city: existing?.city ?? input.city,
      cargo: input.cargo?.trim() || null,
      area: input.area?.trim() || null,
      activo: true,
      creado_en: new Date().toISOString(),
    };
    store.collaborators.unshift(collaborator);
    save(store);
    return { collaborator, linkedExisting: !!existing };
  },

  async findExistingAppUsers(companyId: string, input: Partial<CollaboratorInput>): Promise<ExistingAppUser[]> {
    await latency();
    const digits = (v?: string | null) => (v ?? "").replace(/\D/g, "").slice(-10);
    const doc = (v?: string | null) => (v ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
    const email = input.email?.trim().toLowerCase() || null;
    const mobile = digits(input.mobile) || null;
    const document = doc(input.document_number) || null;
    if (!email && !mobile && !document) return [];
    const store = load();
    const people = new Map<string, Collaborator>();
    store.collaborators.forEach((c) => people.set(c.id, c));
    return [...people.values()]
      .map((c) => {
        const matches: AppUserMatch[] = [];
        if (document && doc(c.document_number) === document) matches.push("documento");
        if (email && sameEmail(c.email, email)) matches.push("correo");
        if (mobile && digits(c.mobile) === mobile) matches.push("telefono");
        if (matches.length && norm(input.first_name) === norm(c.first_name) && norm(input.last_name) === norm(c.last_name)) {
          matches.push("nombre");
        }
        return { c, matches };
      })
      .filter((x) => x.matches.length > 0)
      .slice(0, 5)
      .map(({ c, matches }) => ({
        id: c.id,
        first_name: c.first_name,
        last_name: c.last_name,
        document_type: c.document_type,
        document_number: c.document_number,
        city: c.city,
        email: c.email,
        mobile: c.mobile,
        isAppUser: true,
        alreadyLinked: store.collaborators.some((x) => x.id === c.id && x.id_empresa === companyId),
        matches,
      }));
  },

  async linkExistingAppUser(
    companyId: string,
    personId: string,
    input: Partial<CollaboratorInput>
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> {
    await latency();
    const store = load();
    const source = store.collaborators.find((c) => c.id === personId);
    if (!source) throw new Error("Usuario no encontrado.");
    if (store.collaborators.some((c) => c.id === personId && c.id_empresa === companyId)) {
      throw new Error("Esa persona ya es colaboradora de la empresa.");
    }
    const collaborator: Collaborator = {
      ...source,
      id_empresa: companyId,
      cargo: input.cargo?.trim() || null,
      area: input.area?.trim() || null,
      activo: true,
      creado_en: new Date().toISOString(),
    };
    store.collaborators.unshift(collaborator);
    save(store);
    return { collaborator, linkedExisting: true };
  },

  async setCollaboratorActive(companyId: string, collaboratorId: string, active: boolean): Promise<void> {
    await latency();
    const store = load();
    store.collaborators = store.collaborators.map((c) =>
      c.id_empresa === companyId && c.id === collaboratorId ? { ...c, activo: active } : c
    );
    save(store);
  },

  async listBookings(f: CompanyBookingFilters, viewer: CompanyViewer): Promise<CompanyBooking[]> {
    await latency();
    const q = norm(f.search);
    const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : null;
    const to = f.dateTo ? new Date(`${f.dateTo}T23:59:59.999`).getTime() : null;
    const paymentStatus = viewer === "admin" ? f.paymentStatus : null;
    return load()
      .bookings.filter((b) => !f.companyId || b.company_id === f.companyId)
      .filter((b) => !f.collaboratorId || b.collaborator_id === f.collaboratorId)
      .filter((b) => !f.status || b.status === f.status)
      .filter((b) => !f.invoiceStatus || b.estado_facturacion === f.invoiceStatus)
      .filter((b) => !paymentStatus || b.estado_pago_conductor === paymentStatus)
      .filter((b) => {
        const t = new Date(b.booking_date).getTime();
        return (from === null || t >= from) && (to === null || t <= to);
      })
      .filter((b) =>
        !q ||
        [b.reference, b.collaborator_name, b.company_name, b.pickup_address, b.drop_address, b.driver_name, b.plate_number]
          .some((v) => norm(v).includes(q))
      )
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((b) => forViewer(b, viewer));
  },

  async setBillingStatus(
    bookingIds: string[],
    field: BillingField,
    value: InvoiceStatus | DriverPaymentStatus,
    referencia: string | null,
    nota: string | null
  ): Promise<void> {
    await latency();
    const store = load();
    const ids = new Set(bookingIds);
    const now = new Date().toISOString();
    store.bookings = store.bookings.map((b) => {
      if (!ids.has(b.id)) return b;
      if (b.status === "CANCELLED") throw new Error(`El viaje ${b.reference} está cancelado.`);
      if ((value === "facturado" || value === "pagado") && !isBillableTrip(b)) {
        throw new Error("Solo se facturan o pagan servicios completados.");
      }
      const previous = field === "facturacion" ? b.estado_facturacion : b.estado_pago_conductor ?? "sin_pagar";
      if (previous === value) return b;
      const event = {
        campo: field,
        valor_anterior: previous,
        valor_nuevo: value,
        referencia: referencia?.trim() || null,
        nota: nota?.trim() || null,
        cambiado_en: now,
        cambiado_por: "Administrador T+Plus",
      };
      return field === "facturacion"
        ? {
            ...b,
            estado_facturacion: value as InvoiceStatus,
            factura_referencia: value === "facturado" ? event.referencia : null,
            historial_cobro: [event, ...b.historial_cobro],
          }
        : {
            ...b,
            estado_pago_conductor: value as DriverPaymentStatus,
            historial_cobro: [event, ...b.historial_cobro],
          };
    });
    save(store);
  },

  async createBooking(companyId: string, input: CreateBookingInput, requestedBy: CompanyViewer): Promise<CompanyBooking> {
    await latency();
    const store = load();
    const company = findCompany(store, companyId);
    if (!company.activo) throw new Error("La empresa está inactiva y no puede solicitar viajes.");
    const collaborator = store.collaborators.find(
      (c) => c.id_empresa === companyId && c.id === input.customer_id
    );
    if (!collaborator) throw new Error("El colaborador no pertenece a la empresa.");
    if (!collaborator.activo) throw new Error("El colaborador está inactivo.");
    const now = new Date().toISOString();
    const booking: CompanyBooking = {
      id: crypto.randomUUID(),
      reference: randomReference(),
      status: "PENDING",
      booking_type: input.booking_type === "reservation" ? "SCHEDULED" : "IMMEDIATE",
      booking_date: input.booking_date,
      created_at: now,
      company_id: companyId,
      company_name: company.nombre_comercial || company.razon_social,
      collaborator_id: collaborator.id,
      collaborator_name: collaboratorFullName(collaborator),
      collaborator_contact: collaborator.mobile,
      collaborator_email: collaborator.email,
      requested_by: requestedBy,
      cost_center: null,
      pickup_address: input.pickup.address,
      drop_address: input.destination.address,
      distance_km: input.distance_km,
      duration_min: input.duration_min,
      car_type: input.car_type,
      trip_type: input.trip_type,
      total_cost: input.total_cost,
      estimate: input.estimate,
      payment_mode: CORPORATE_PAYMENT_MODE,
      observations: input.observations ?? null,
      driver_id: null,
      driver_name: null,
      driver_contact: null,
      plate_number: null,
      cancelled_by: null,
      cancel_reason: null,
      cancelled_at: null,
      estado_facturacion: "sin_facturar",
      factura_referencia: null,
      estado_pago_conductor: "sin_pagar",
      driver_share: input.driver_share ?? null,
      cobros: initialCharges(input.total_cost, null),
      historial_cobro: [],
    };
    store.bookings.unshift(booking);
    save(store);
    return booking;
  },

  async cancelBooking(bookingId: string, reason: string, viewer: CompanyViewer): Promise<CompanyBooking> {
    await latency();
    const store = load();
    const booking = store.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new Error("Viaje no encontrado.");
    if (!canCancelBooking(booking, viewer)) {
      throw new Error(
        viewer === "empresa"
          ? "Solo puedes cancelar viajes que aún no tienen conductor asignado."
          : "El viaje ya finalizó."
      );
    }
    const updated: CompanyBooking = {
      ...booking,
      status: "CANCELLED",
      cancelled_by: viewer,
      cancel_reason: reason.trim() || (viewer === "empresa" ? "Cancelado por la empresa" : "Cancelado por administrador"),
      cancelled_at: new Date().toISOString(),
    };
    store.bookings = store.bookings.map((b) => (b.id === bookingId ? updated : b));
    save(store);
    return updated;
  },
};
