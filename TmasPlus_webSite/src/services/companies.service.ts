import type { BookingRecord, CreateBookingInput, CustomerLite } from "./bookings.service";
import type { BookingDetailExtras } from "./bookingDetail.service";
import { CompaniesCore } from "./companies.core";
import { CompaniesMock } from "./companies.mock";

/**
 * Módulo Empresas. Usa core (database/core_web/019_empresas.sql y las Edge Functions
 * core-company-*). Con VITE_COMPANIES_DEMO=true usa datos de demostración del navegador.
 */
export const COMPANIES_BACKEND_READY = import.meta.env.VITE_COMPANIES_DEMO !== "true";

/** Valor de modo_pago para viajes facturados a la empresa (020_modo_pago_empresarial.sql). */
export const CORPORATE_PAYMENT_MODE = "empresarial";

export type CompanyType = "SAS" | "LTDA" | "SA" | "OTRA";

export const COMPANY_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: "SAS", label: "S.A.S." },
  { value: "LTDA", label: "Ltda." },
  { value: "SA", label: "S.A." },
  { value: "OTRA", label: "Otra" },
];

export function companyTypeLabel(c: Pick<Company, "tipo_empresa" | "tipo_empresa_otra">): string {
  if (c.tipo_empresa === "OTRA") return c.tipo_empresa_otra || "Otra";
  return COMPANY_TYPE_OPTIONS.find((o) => o.value === c.tipo_empresa)?.label ?? c.tipo_empresa;
}

export type CompanyDocType = "camara_comercio" | "rut";

/** Días máximos de antigüedad para considerar "actualizado" un documento. */
export const COMPANY_DOCUMENTS: { tipo: CompanyDocType; label: string; maxAgeDays: number }[] = [
  { tipo: "camara_comercio", label: "Certificado de Cámara de Comercio", maxAgeDays: 30 },
  { tipo: "rut", label: "RUT (Registro Único Tributario)", maxAgeDays: 365 },
];

export interface CompanyDocument {
  tipo: CompanyDocType;
  nombre_archivo: string;
  tamano_bytes: number;
  /** YYYY-MM-DD */
  fecha_expedicion: string;
  subido_en: string;
  /** Null mientras los archivos no se guarden en Storage. */
  url: string | null;
  /** Ruta en el bucket privado user-documents; se abre con una URL firmada. */
  storage_path?: string | null;
}

export interface CompanyDocumentInput {
  /** Archivo nuevo; null conserva el ya cargado (solo al editar). */
  file: File | null;
  fecha_expedicion: string;
}

export function documentAgeDays(fechaExpedicion: string): number {
  const issued = new Date(`${fechaExpedicion}T00:00:00`).getTime();
  return Math.floor((Date.now() - issued) / 86_400_000);
}

/** Documentos requeridos que faltan o superan su antigüedad máxima. */
export function outdatedDocuments(company: Pick<Company, "documentos">): string[] {
  return COMPANY_DOCUMENTS.filter(({ tipo, maxAgeDays }) => {
    const doc = company.documentos.find((d) => d.tipo === tipo);
    return !doc || documentAgeDays(doc.fecha_expedicion) > maxAgeDays;
  }).map((d) => d.label);
}

export interface Company {
  /** persona.id de la cuenta con rol empresa. */
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  nit: string;
  dv: string;
  tipo_empresa: CompanyType;
  tipo_empresa_otra: string | null;
  ciiu: string | null;
  logo_url: string | null;
  correo_corporativo: string;
  /** Correo al que se envían las facturas; opcional. */
  correo_facturacion: string | null;
  telefono: string;
  pais: string;
  departamento: string;
  ciudad: string;
  direccion: string;
  sitio_web: string | null;
  rep_nombre: string;
  rep_tipo_documento: string;
  rep_numero_documento: string;
  rep_email: string;
  rep_telefono: string | null;
  acceso_email: string;
  documentos: CompanyDocument[];
  activo: boolean;
  creado_en: string;
  total_colaboradores: number;
  total_viajes: number;
}

export type CompanyInput = Omit<
  Company,
  "id" | "activo" | "creado_en" | "total_colaboradores" | "total_viajes" | "logo_url" | "documentos"
> & {
  /** Solo al crear: contraseña de la cuenta de acceso. */
  password?: string;
  /** Nuevo logo; null lo elimina, undefined lo conserva. */
  logo_file?: File | null;
  documentos: Record<CompanyDocType, CompanyDocumentInput>;
};

export interface Collaborator {
  /** persona.id del Usuario App vinculado. */
  id: string;
  id_empresa: string;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  document_type: string;
  document_number: string;
  city: string;
  cargo: string | null;
  area: string | null;
  activo: boolean;
  creado_en: string;
  /** Foto de perfil del Usuario App (la misma que se ve en /users). */
  profile_image?: string | null;
}

export type AppUserMatch = "documento" | "correo" | "telefono" | "nombre";

/** Usuario App que ya existe con la cédula, el correo o el teléfono escritos en el formulario. */
export interface ExistingAppUser {
  id: string;
  first_name: string;
  last_name: string;
  document_type: string | null;
  document_number: string | null;
  city: string | null;
  /** Para la empresa llegan parcialmente ocultos; el admin los ve completos. */
  email: string | null;
  mobile: string | null;
  isAppUser: boolean;
  alreadyLinked: boolean;
  matches: AppUserMatch[];
}

/** Vínculo de un Usuario App con una empresa (vista del administrador en /users). */
export interface CompanyLink {
  personId: string;
  companyId: string;
  companyName: string;
  companyActive: boolean;
  active: boolean;
  cargo: string | null;
  area: string | null;
}

export interface CompanyOption {
  id: string;
  name: string;
  active: boolean;
}

export interface CollaboratorInput {
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  document_type: string;
  document_number: string;
  city: string;
  cargo?: string | null;
  area?: string | null;
  password: string;
}

export type CompanyBookingStatus =
  | "PENDING"
  | "ACCEPTED"
  | "ARRIVED_PICKUP"
  | "STARTED"
  | "ARRIVED_DESTINATION"
  | "COMPLETED"
  | "PAID"
  | "CANCELLED";

export const BOOKING_STATUS_LABELS: Record<CompanyBookingStatus, string> = {
  PENDING: "Pendiente",
  ACCEPTED: "Conductor asignado",
  ARRIVED_PICKUP: "Conductor en origen",
  STARTED: "En curso",
  ARRIVED_DESTINATION: "Llegó a destino",
  COMPLETED: "Completado",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
};

export const ACTIVE_BOOKING_STATUSES: CompanyBookingStatus[] = [
  "PENDING",
  "ACCEPTED",
  "ARRIVED_PICKUP",
  "STARTED",
  "ARRIVED_DESTINATION",
];

const FINAL_BOOKING_STATUSES: CompanyBookingStatus[] = ["COMPLETED", "PAID", "CANCELLED"];

export type InvoiceStatus = "sin_facturar" | "facturado";
export type DriverPaymentStatus = "sin_pagar" | "pagado";
export type BillingField = "facturacion" | "pago_conductor";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  sin_facturar: "Sin facturar",
  facturado: "Facturado",
};

export const DRIVER_PAYMENT_STATUS_LABELS: Record<DriverPaymentStatus, string> = {
  sin_pagar: "Sin pagar",
  pagado: "Pagado",
};

export interface BillingEvent {
  campo: BillingField;
  valor_anterior: string;
  valor_nuevo: string;
  /** N.° de factura o comprobante de pago. */
  referencia: string | null;
  nota: string | null;
  cambiado_en: string;
  cambiado_por: string;
}

export type ChargeCategory = "ingreso_terceros" | "ingreso_propio" | "impuesto";

/**
 * Conceptos que se cobran a la empresa (tabla concepto_cobro). La base de datos calcula los montos
 * (_reserva_empresa_liquidar): procesamiento = conductor × % T+Plus × 8 %; IVA = procesamiento × 19 %;
 * hosting = conductor × % T+Plus − procesamiento + PayU; pólizas = valor fijo. Total = suma de las líneas.
 */
export const CHARGE_CONCEPTS: {
  codigo: string;
  nombre: string;
  categoria: ChargeCategory;
  /** Agrupación en la factura (p. ej. hosting + pólizas = Hosting tecnológico total). */
  grupo_factura: string;
}[] = [
  { codigo: "costo_viaje", nombre: "Costo del viaje", categoria: "ingreso_terceros", grupo_factura: "Ingresos recibidos para terceros (conductor)" },
  { codigo: "hosting_tecnologico", nombre: "Hosting tecnológico", categoria: "ingreso_propio", grupo_factura: "Hosting tecnológico total" },
  { codigo: "paquete_polizas", nombre: "Paquete de pólizas", categoria: "ingreso_propio", grupo_factura: "Hosting tecnológico total" },
  { codigo: "procesamiento_datos", nombre: "Procesamiento de datos", categoria: "ingreso_propio", grupo_factura: "Procesamiento de datos" },
  { codigo: "iva_procesamiento_datos", nombre: "IVA", categoria: "impuesto", grupo_factura: "IVA sobre procesamiento de datos" },
];

export interface ChargeLine {
  concepto: string;
  /** null: concepto aún sin calcular. */
  monto: number | null;
  /** Nombre del tercero para ingresos recibidos para terceros. */
  tercero: string | null;
}

export interface CompanyBooking {
  id: string;
  reference: string;
  status: CompanyBookingStatus;
  booking_type: "IMMEDIATE" | "SCHEDULED";
  booking_date: string;
  created_at: string;
  company_id: string;
  company_name: string;
  collaborator_id: string;
  collaborator_name: string;
  collaborator_contact: string | null;
  collaborator_email: string | null;
  /** colaborador: lo pidió el propio colaborador desde la app con pago empresarial. */
  requested_by: "empresa" | "admin" | "colaborador";
  /** Centro de costo o motivo (lo escribe el colaborador en la app o la empresa en el portal). */
  cost_center: string | null;
  pickup_address: string;
  drop_address: string;
  distance_km: number;
  duration_min: number;
  car_type: string;
  trip_type: string;
  total_cost: number;
  estimate: number;
  payment_mode: string;
  observations: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  plate_number: string | null;
  /** Rol que canceló (empresa, admin, cliente, conductor). */
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  estado_facturacion: InvoiceStatus;
  factura_referencia: string | null;
  /** Solo lo recibe el administrador; la empresa no ve el pago al conductor. */
  estado_pago_conductor: DriverPaymentStatus | null;
  /** Valor a pagar al conductor; solo administrador. */
  driver_share: number | null;
  /** Total que se le cobra a la empresa (suma de la liquidación); null si aún no se ha liquidado. */
  company_charge: number | null;
  cobros: ChargeLine[];
  /** Solo administrador. */
  historial_cobro: BillingEvent[];
}

/** Lo que paga la empresa por el viaje: la liquidación completa; si no existe, el precio del viaje. */
export function companyCharge(b: Pick<CompanyBooking, "company_charge" | "total_cost">): number {
  return b.company_charge ?? b.total_cost;
}

/** Parámetros del cobro de un viaje (solo admin). Los porcentajes van de 0 a 100. */
export interface CompanyTripTariff {
  porcentaje_tplus: number;
  payu_comision: number;
  paquete_polizas: number;
  factor_procesamiento: number;
  iva_procesamiento: number;
  actualizado_en: string | null;
  actualizado_por: string | null;
}

/** Tarifa con que se liquidan los viajes nuevos de una empresa (solo admin). */
export interface CompanyTariff {
  porcentaje_tplus: number;
  payu_comision: number;
  /** false = la empresa usa el valor por defecto. */
  porcentaje_personalizado: boolean;
  payu_personalizado: boolean;
  porcentaje_defecto: number;
  payu_defecto: number;
  actualizado_en: string | null;
  actualizado_por: string | null;
}

export type ChargeParamKey =
  | "porcentaje_tplus"
  | "payu_comision"
  | "paquete_polizas"
  | "factor_procesamiento"
  | "iva_procesamiento";

/** Valor por defecto del cobro a empresas (tabla empresa_cobro_parametro). */
export interface ChargeParam {
  clave: ChargeParamKey;
  valor: number;
  descripcion: string;
  actualizado_en: string | null;
}

export interface CompanyBookingFilters {
  /** Sin companyId devuelve los viajes de todas las empresas (solo admin). */
  companyId?: string | null;
  collaboratorId?: string | null;
  status?: CompanyBookingStatus | null;
  invoiceStatus?: InvoiceStatus | null;
  /** Solo administrador. */
  paymentStatus?: DriverPaymentStatus | null;
  search?: string;
  /** YYYY-MM-DD sobre la fecha del servicio. */
  dateFrom?: string | null;
  dateTo?: string | null;
}

export type CompanyViewer = "admin" | "empresa";

/** Solo lo completado se factura a la empresa (y se paga al conductor); cancelado o en curso: nada. */
export function isBillableTrip(b: Pick<CompanyBooking, "status">): boolean {
  return b.status === "COMPLETED" || b.status === "PAID";
}

/** Detalle completo de un viaje empresarial, con la misma forma que usa el detalle del admin. */
export type CorporateTripDetail = { booking: BookingRecord; extras: BookingDetailExtras };

/** La empresa solo cancela mientras el viaje no tenga conductor asignado. */
export function canCancelBooking(b: CompanyBooking, viewer: CompanyViewer): boolean {
  if (viewer === "admin") return !FINAL_BOOKING_STATUSES.includes(b.status);
  return b.status === "PENDING" && !b.driver_id;
}

/** Quita lo que la empresa no debe ver (pago al conductor e historial interno). */
export function forViewer(b: CompanyBooking, viewer: CompanyViewer): CompanyBooking {
  if (viewer === "admin") return b;
  return { ...b, estado_pago_conductor: null, driver_share: null, historial_cobro: [] };
}

export function collaboratorFullName(c: Pick<Collaborator, "first_name" | "last_name">): string {
  return [c.first_name, c.last_name].filter(Boolean).join(" ");
}

/** Implementación activa; se resuelve al llamar para no depender del orden de carga de los módulos. */
const impl = () => (COMPANIES_BACKEND_READY ? CompaniesCore : CompaniesMock);

export const CompaniesService = {
  list: (): Promise<Company[]> => impl().list(),
  get: (id: string): Promise<Company | null> => impl().get(id),
  create: (input: CompanyInput): Promise<Company> => impl().create(input),
  update: (id: string, input: CompanyInput): Promise<Company> => impl().update(id, input),
  setActive: (id: string, active: boolean): Promise<void> => impl().setActive(id, active),
  /** URL temporal para abrir un documento privado de la empresa. */
  documentUrl: (doc: CompanyDocument): Promise<string | null> => impl().documentUrl(doc),
  /** Empresas para selectores (id, nombre, activa). */
  listCompanyOptions: (): Promise<CompanyOption[]> => impl().listCompanyOptions(),
  /** Solo administrador: todos los vínculos colaborador-empresa. */
  listAllCompanyLinks: (): Promise<CompanyLink[]> => impl().listAllCompanyLinks(),

  listCollaborators: (companyId: string): Promise<Collaborator[]> => impl().listCollaborators(companyId),
  /** Colaboradores activos con la forma que espera el buscador de clientes de la reserva. */
  searchCollaborators: (companyId: string, query: string, limit = 8): Promise<CustomerLite[]> =>
    impl().searchCollaborators(companyId, query, limit),
  createCollaborator: (
    companyId: string,
    input: CollaboratorInput
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> =>
    impl().createCollaborator(companyId, input),
  setCollaboratorActive: (companyId: string, collaboratorId: string, active: boolean): Promise<void> =>
    impl().setCollaboratorActive(companyId, collaboratorId, active),
  /** Busca Usuarios App existentes por cédula, correo o teléfono (coincidencia exacta). */
  findExistingAppUsers: (companyId: string, input: Partial<CollaboratorInput>): Promise<ExistingAppUser[]> =>
    impl().findExistingAppUsers(companyId, input),
  /** Vincula un Usuario App existente tras la confirmación; los datos deben coincidir con esa persona. */
  linkExistingAppUser: (
    companyId: string,
    personId: string,
    input: Partial<CollaboratorInput>
  ): Promise<{ collaborator: Collaborator; linkedExisting: boolean }> =>
    impl().linkExistingAppUser(companyId, personId, input),

  listBookings: (filters: CompanyBookingFilters, viewer: CompanyViewer): Promise<CompanyBooking[]> =>
    impl().listBookings(filters, viewer),
  getBooking: (bookingId: string, viewer: CompanyViewer): Promise<CompanyBooking | null> =>
    impl().getBooking(bookingId, viewer),
  /** Ruta, GPS, etapas, conductor y vehículo del viaje (sin el pago al conductor). */
  getTripDetail: (bookingId: string): Promise<CorporateTripDetail> => impl().getTripDetail(bookingId),
  /** Solo administrador: cambia el estado de factura o de pago al conductor de varios servicios. */
  setBillingStatus: (
    bookingIds: string[],
    field: BillingField,
    value: InvoiceStatus | DriverPaymentStatus,
    referencia: string | null,
    nota: string | null
  ): Promise<void> => impl().setBillingStatus(bookingIds, field, value, referencia, nota),
  /** Solo administrador: % T+Plus, PayU y demás parámetros con que se liquidó el viaje. */
  getTripTariff: (bookingId: string): Promise<CompanyTripTariff | null> => impl().getTripTariff(bookingId),
  /** Solo administrador: cambia el % T+Plus y el PayU de ese viaje (no los valores por defecto) y lo reliquida. */
  setTripTariff: (bookingId: string, porcentaje: number, payu: number): Promise<void> =>
    impl().setTripTariff(bookingId, porcentaje, payu),
  /** Solo administrador: valores por defecto del cobro a empresas. */
  listChargeParams: (): Promise<ChargeParam[]> => impl().listChargeParams(),
  setChargeParam: (key: ChargeParamKey, value: number): Promise<void> => impl().setChargeParam(key, value),
  /** Solo administrador: tarifa propia de la empresa (o la de por defecto si no tiene). */
  getCompanyTariff: (companyId: string): Promise<CompanyTariff> => impl().getCompanyTariff(companyId),
  /**
   * Solo administrador: null en un valor = usa el de por defecto. Con applyToUninvoiced también reliquida los viajes
   * de la empresa que aún no están facturados. Devuelve cuántos viajes se reliquidaron.
   */
  setCompanyTariff: (
    companyId: string,
    porcentaje: number | null,
    payu: number | null,
    applyToUninvoiced: boolean
  ): Promise<number> => impl().setCompanyTariff(companyId, porcentaje, payu, applyToUninvoiced),
  createBooking: (
    companyId: string,
    input: CreateBookingInput,
    requestedBy: CompanyViewer
  ): Promise<CompanyBooking> =>
    impl().createBooking(companyId, input, requestedBy).then((b) => forViewer(b, requestedBy)),
  cancelBooking: (bookingId: string, reason: string, viewer: CompanyViewer): Promise<CompanyBooking> =>
    impl().cancelBooking(bookingId, reason, viewer).then((b) => forViewer(b, viewer)),
};
