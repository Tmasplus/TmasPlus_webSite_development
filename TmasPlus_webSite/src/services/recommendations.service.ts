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
  monto_actualizado: "Monto ajustado al precio final",
  pago_reportado: "El solicitante reportó el pago",
  pago_recibido: "El conductor confirmó que recibió",
  pago_no_recibido: "El conductor reportó que no recibió",
  resuelta: "Resuelta por soporte",
};

export function settlementLabel(t: Pick<RecommendedTrip, "settlementStatus" | "settlementOverdue">): string {
  if (!t.settlementStatus) return "Sin liquidación";
  return t.settlementOverdue ? "Vencida sin confirmar" : SETTLEMENT_LABELS[t.settlementStatus];
}

export type SettlementFilter = "todas" | "abiertas" | "soporte" | "confirmadas" | "resueltas" | "sin_liquidacion";

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

  async resolve(bookingId: string, resolution: SettlementResolution, note: string): Promise<void> {
    const { error } = await db.rpc("web_admin_resolver_recomendacion", {
      p_reserva: bookingId,
      p_resultado: resolution,
      p_nota: note,
    });
    if (error) throw new Error(error.message);
  },
};
