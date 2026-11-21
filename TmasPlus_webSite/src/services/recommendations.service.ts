import { supabase } from "@/config/supabase";
import { normalizeBooking } from "@/services/coreBookings.service";
import type { BookingRecord } from "@/services/bookings.service";

/**
 * Reservas recomendadas (admin): viajes que un conductor pide a nombre de un cliente de su cartera y otro conductor
 * realiza. Vistas de 020_reservas_recomendadas.sql (solo devuelven filas al admin) y la RPC de resolución de soporte.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type SettlementStatus = "pendiente" | "pago_reportado" | "confirmado" | "en_disputa" | "resuelto";
export type SettlementResolution = "pagado" | "no_pagado" | "anulado";

export interface RecommendedTrip {
  id: string;
  reference: string | null;
  status: string;
  bookingType: string;
  bookingDate: string;
  createdAt: string;
  requesterId: string;
  requesterName: string;
  requesterContact: string | null;
  customerId: string;
  customerName: string;
  customerContact: string | null;
  driverId: string | null;
  driverName: string | null;
  driverContact: string | null;
  plateNumber: string | null;
  carType: string | null;
  pickupAddress: string;
  dropAddress: string;
  distanceKm: number;
  fareSource: "recomendada" | "manual";
  fareMin: number;
  fareMax: number;
  finalPrice: number | null;
  agreedValue: number | null;
  requesterMargin: number | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  settlementStatus: SettlementStatus | null;
  settlementAmount: number | null;
  completedAt: string | null;
  settlementDueAt: string | null;
  settlementOverdue: boolean;
  needsSupport: boolean;
  paidReportedAt: string | null;
  received: boolean | null;
  receivedReportedAt: string | null;
  resolution: SettlementResolution | null;
  resolutionNote: string | null;
  resolvedAt: string | null;
  /** Reporte a soporte de alguno de los dos conductores (null si no hay). */
  supportRequestedAt: string | null;
  supportRequestedBy: string | null;
  supportNote: string | null;
  supportAttendedAt: string | null;
  supportResponse: string | null;
  /** Solo el admin cierra el hilo; mientras sea null el chat sigue abierto. */
  supportClosedAt: string | null;
  /** Métodos del conductor que hizo el viaje (para liquidar sin efectivo). */
  driverPayCash: boolean;
  driverPayDaviplata: boolean;
  driverDaviplataNumero: string | null;
  driverPayNequi: boolean;
  driverNequiNumero: string | null;
  driverNequiBreb: string | null;
}

export interface RecommenderStats {
  driverId: string;
  driverName: string;
  driverContact: string | null;
  driverEmail: string | null;
  profileImage: string | null;
  customersRegistered: number;
  customersInPortfolio: number;
  tripsRequested: number;
  tripsCompleted: number;
  settlementsOpen: number;
  amountOpen: number;
  settlementsWithIssues: number;
  lastRequestAt: string | null;
}

export interface PortfolioCustomer {
  customerId: string;
  customerName: string;
  customerContact: string | null;
  customerEmail: string | null;
  origin: "registrado" | "agregado";
  active: boolean;
  addedAt: string;
  trips: number;
}

export interface RecommendationEvent {
  id: number;
  type: string;
  actorName: string | null;
  note: string | null;
  createdAt: string;
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toTrip(r: Row): RecommendedTrip {
  return {
    id: r.id,
    reference: r.reference ?? null,
    status: r.status,
    bookingType: r.booking_type,
    bookingDate: r.booking_date,
    createdAt: r.created_at,
    requesterId: r.requester_id,
    requesterName: r.requester_name || "Conductor",
    requesterContact: r.requester_contact ?? null,
    customerId: r.customer_id,
    customerName: r.customer_name || "Cliente",
    customerContact: r.customer_contact ?? null,
    driverId: r.driver_id ?? null,
    driverName: r.driver_name ?? null,
    driverContact: r.driver_contact ?? null,
    plateNumber: r.plate_number ?? null,
    carType: r.car_type ?? null,
    pickupAddress: r.pickup_address ?? "",
    dropAddress: r.drop_address ?? "",
    distanceKm: Number(r.distance_km) || 0,
    fareSource: r.fare_source,
    fareMin: Number(r.fare_min) || 0,
    fareMax: Number(r.fare_max) || 0,
    finalPrice: num(r.final_price),
    agreedValue: num(r.agreed_value),
    requesterMargin: num(r.requester_margin),
    cancelledBy: r.cancelled_by ?? null,
    cancelReason: r.cancel_reason ?? null,
    settlementStatus: r.settlement_status ?? null,
    settlementAmount: num(r.settlement_amount),
    completedAt: r.completed_at ?? null,
    settlementDueAt: r.settlement_due_at ?? null,
    settlementOverdue: r.settlement_overdue === true,
    needsSupport: r.needs_support === true,
    paidReportedAt: r.paid_reported_at ?? null,
    received: r.received ?? null,
    receivedReportedAt: r.received_reported_at ?? null,
    resolution: r.resolution ?? null,
    resolutionNote: r.resolution_note ?? null,
    resolvedAt: r.resolved_at ?? null,
    supportRequestedAt: r.support_requested_at ?? null,
    supportRequestedBy: r.support_requested_by ?? null,
    supportNote: r.support_note ?? null,
    supportAttendedAt: r.support_attended_at ?? null,
    supportResponse: r.support_response ?? null,
    supportClosedAt: r.support_closed_at ?? null,
    driverPayCash: r.driver_pay_cash === true,
    driverPayDaviplata: r.driver_pay_daviplata === true,
    driverDaviplataNumero: r.driver_daviplata_numero ?? null,
    driverPayNequi: r.driver_pay_nequi === true,
    driverNequiNumero: r.driver_nequi_numero ?? null,
    driverNequiBreb: r.driver_nequi_breb ?? null,
  };
}

export const SETTLEMENT_LABELS: Record<SettlementStatus, string> = {
  pendiente: "Pendiente de pago",
  pago_reportado: "Pago reportado",
  confirmado: "Pago confirmado",
  en_disputa: "En disputa",
  resuelto: "Resuelto por soporte",
};

export const RESOLUTION_LABELS: Record<SettlementResolution, string> = {
  pagado: "Pagado",
  no_pagado: "No pagado",
  anulado: "Anulado",
};

export const EVENT_LABELS: Record<string, string> = {
  creada: "Viaje solicitado",
  cancelada: "Viaje cancelado",
  liquidacion_abierta: "Liquidación abierta (24 h)",
  monto_actualizado: "Monto ajustado (tarifa fija)",
  pago_reportado: "El solicitante reportó el pago",
  pago_recibido: "El conductor confirmó que recibió",
  pago_no_recibido: "El conductor reportó que no recibió",
  resuelta: "Resuelta por soporte",
  soporte_reportado: "Un conductor escribió a soporte",
  soporte_atendido: "Soporte respondió o cerró el caso",
};

export function settlementLabel(t: Pick<RecommendedTrip, "settlementStatus" | "settlementOverdue">): string {
  if (!t.settlementStatus) return "Sin liquidación";
  return t.settlementOverdue ? "Vencida sin confirmar" : SETTLEMENT_LABELS[t.settlementStatus];
}

export type SettlementFilter = "todas" | "abiertas" | "soporte" | "confirmadas" | "resueltas" | "sin_liquidacion";

/** Liquidaciones entre conductores para el inicio y el contador del menú (solo admin). */
export interface RecommendationSummary {
  /** Pendientes de pago, aún dentro de las 24 h. */
  unpaid: number;
  unpaidOverdue: number;
  /** El solicitante reportó el pago; falta que el otro conductor lo confirme. */
  paidUnconfirmed: number;
  paidUnconfirmedOverdue: number;
  /** Confirmadas por ambos conductores. */
  confirmed: number;
  disputed: number;
  resolved: number;
  /** Viajes en disputa, vencidos o con chat de soporte abierto. */
  needsAttention: number;
  amountToPay: number;
  amountPaid: number;
  activeTrips: number;
  totalTrips: number;
  /** Chats de soporte aún abiertos (sin cerrar por admin). */
  supportPending: number;
}

export const RecommendationsService = {
  async listTrips(): Promise<RecommendedTrip[]> {
    const { data, error } = await db
      .from("web_reservas_recomendadas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []).map(toTrip);
  },

  async getTrip(bookingId: string): Promise<RecommendedTrip | null> {
    const { data, error } = await db.from("web_reservas_recomendadas").select("*").eq("id", bookingId).maybeSingle();
    if (error) throw new Error(error.message);
    return data ? toTrip(data) : null;
  },

  async getSummary(): Promise<RecommendationSummary | null> {
    const { data, error } = await db.from("web_recomendaciones_resumen").select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const n = (v: unknown) => Number(v) || 0;
    return {
      unpaid: n(data.sin_pagar),
      unpaidOverdue: n(data.sin_pagar_vencidas),
      paidUnconfirmed: n(data.pagadas_sin_confirmar),
      paidUnconfirmedOverdue: n(data.pagadas_sin_confirmar_vencidas),
      confirmed: n(data.confirmadas),
      disputed: n(data.en_disputa),
      resolved: n(data.resueltas),
      needsAttention: n(data.requieren_atencion),
      amountToPay: n(data.monto_por_pagar),
      amountPaid: n(data.monto_pagado),
      activeTrips: n(data.viajes_activos),
      supportPending: n(data.soporte_pendiente),
      totalTrips: n(data.viajes_total),
    };
  },

  async listRecommenders(): Promise<RecommenderStats[]> {
    const { data, error } = await db
      .from("web_conductores_recomendaciones")
      .select("*")
      .order("last_request_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Row) => ({
      driverId: r.driver_id,
      driverName: r.driver_name || "Conductor",
      driverContact: r.driver_contact ?? null,
      driverEmail: r.driver_email ?? null,
      profileImage: r.profile_image ?? null,
      customersRegistered: Number(r.customers_registered) || 0,
      customersInPortfolio: Number(r.customers_in_portfolio) || 0,
      tripsRequested: Number(r.trips_requested) || 0,
      tripsCompleted: Number(r.trips_completed) || 0,
      settlementsOpen: Number(r.settlements_open) || 0,
      amountOpen: Number(r.amount_open) || 0,
      settlementsWithIssues: Number(r.settlements_with_issues) || 0,
      lastRequestAt: r.last_request_at ?? null,
    }));
  },

  async listPortfolio(driverId: string): Promise<PortfolioCustomer[]> {
    const { data, error } = await db
      .from("web_conductor_clientes")
      .select("*")
      .eq("driver_id", driverId)
      .order("added_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Row) => ({
      customerId: r.customer_id,
      customerName: r.customer_name || "Cliente",
      customerContact: r.customer_contact ?? null,
      customerEmail: r.customer_email ?? null,
      origin: r.origin,
      active: r.active === true,
      addedAt: r.added_at,
      trips: Number(r.trips) || 0,
    }));
  },

  async listEvents(bookingId: string): Promise<RecommendationEvent[]> {
    const { data, error } = await db
      .from("web_recomendacion_eventos")
      .select("*")
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: Row) => ({
      id: Number(r.id),
      type: r.type,
      actorName: r.actor_name ?? null,
      note: r.note ?? null,
      createdAt: r.created_at,
    }));
  },

  /** Reserva completa para el detalle de siempre (BookingModal). */
  async getBookingRecord(bookingId: string): Promise<BookingRecord> {
    const { data, error } = await db.from("web_bookings").select("*").eq("id", bookingId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("No se encontró la reserva");
    return normalizeBooking(data);
  },

  /** Responde en el chat de soporte sin cerrarlo; le llega un push al conductor. */
  async attendSupport(bookingId: string, response: string): Promise<void> {
    const { error } = await db.rpc("web_admin_atender_soporte_recomendacion", { p_reserva: bookingId, p_nota: response });
    if (error) throw new Error(error.message);
  },

  /** Cierra el hilo de soporte de este viaje (la app muestra "Soporte terminado"). */
  async closeSupport(bookingId: string, note?: string): Promise<void> {
    const { error } = await db.rpc("web_admin_cerrar_soporte_recomendacion", {
      p_reserva: bookingId,
      p_nota: note?.trim() || null,
    });
    if (error) throw new Error(error.message);
  },

  async resolve(bookingId: string, resolution: SettlementResolution, note: string): Promise<void> {
    const { error } = await db.rpc("web_admin_resolver_recomendacion", {
      p_reserva: bookingId,
      p_resultado: resolution,
      p_nota: note,
    });
    if (error) throw new Error(error.message);
  },
};
