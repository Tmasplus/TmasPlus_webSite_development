/**
 * Misma lógica de tarifa que la app (App/constants/fare.ts y
 * addActualsToBooking en App/common/other/sharedFunctions.ts):
 *
 * - Al cotizar: min = trip_cost = driver_share (lo que gana el conductor) y
 *   max = estimate = price = ROUNDUP(min × 1.25, centena) (lo que ve el cliente).
 * - Al finalizar: costo_viaje / ganancia_conductor / precio / costo_total
 *   quedan con UN solo valor final, que nunca baja del mínimo cotizado (piso).
 *
 * En core `precio_estimado` (= estimate) conserva el máximo cotizado tras el
 * cierre, y el snapshot `created` lo guarda en `precio_calculado` al insertar.
 * El mínimo no se persiste aparte: se recupera invirtiendo la fórmula.
 */
import type { BookingRecord, ServiceSnapshot } from "@/services/bookings.service";
import type { ReservaRow } from "@/services/bookingDetail.service";

export const MARGEN_CLIENTE = 0.25;

export const roundUpToHundred = (n: number) => Math.ceil(Number(n) / 100) * 100;

export const maxFromMinConductor = (min: number) => roundUpToHundred(min * (1 + MARGEN_CLIENTE));

export function positiveNumber(value: unknown): number | null {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function firstPositive(...values: unknown[]): number | null {
  for (const v of values) {
    const n = positiveNumber(v);
    if (n != null) return n;
  }
  return null;
}

export function isBookingCancelled(booking: BookingRecord) {
  return (booking.status || "").toUpperCase() === "CANCELLED";
}

export function isCompletedStatus(status?: string | null) {
  const s = String(status || "").toUpperCase();
  return s === "COMPLETE" || s === "COMPLETED" || s === "PAID";
}

/** Columnas de precio de la reserva, con respaldo en la tabla `reserva` de core. */
export function fareColumns(booking: BookingRecord, reserva?: ReservaRow | null) {
  return {
    trip_cost: booking.trip_cost ?? reserva?.costo_viaje,
    driver_share: booking.driver_share ?? reserva?.ganancia_conductor,
    price: booking.price ?? reserva?.precio,
    estimate: booking.estimate ?? reserva?.precio_estimado,
  };
}

/**
 * Inverso de maxFromMinConductor: como max = ROUNDUP(min × 1.25, centena) y
 * el mínimo siempre es múltiplo de 100, min = ROUNDDOWN(max / 1.25, centena).
 */
export const minFromMaxCliente = (max: number) => Math.floor(max / (1 + MARGEN_CLIENTE) / 100) * 100;

export type FareQuote = {
  min: number | null;
  max: number | null;
  /** min se calculó a partir del máximo (no se guarda en BD tras el cierre). */
  minDerived: boolean;
  source: "reserva" | "snapshot" | "precio_estimado" | null;
};

export function resolveQuote(
  booking: BookingRecord,
  reserva: ReservaRow | null,
  snapshots: ServiceSnapshot[]
): FareQuote {
  const cols = fareColumns(booking, reserva);

  if (!isCompletedStatus(booking.status)) {
    const min = firstPositive(cols.trip_cost, cols.driver_share, cols.price, cols.estimate);
    const max = firstPositive(cols.estimate, cols.price) ?? min;
    return { min, max: max != null && min != null && max < min ? min : max, minDerived: false, source: "reserva" };
  }

  // precio_calculado del snapshot `created` no se actualiza en conflictos: es
  // el precio_estimado original al insertar la reserva.
  const created = snapshots.find((s) => s.stage === "created");
  const fromSnapshot = firstPositive(created?.calculated_price, created?.data?.estimated_price);
  const max = fromSnapshot ?? positiveNumber(cols.estimate);
  if (!max) return { min: null, max: null, minDerived: false, source: null };

  return {
    min: minFromMaxCliente(max),
    max,
    minDerived: true,
    source: fromSnapshot ? "snapshot" : "precio_estimado",
  };
}

/** Valor final cobrado (mismo para cliente y conductor). Solo existe al completar. */
export function resolveFinalFare(booking: BookingRecord, reserva: ReservaRow | null) {
  if (!isCompletedStatus(booking.status)) return null;
  const cols = fareColumns(booking, reserva);
  return firstPositive(cols.trip_cost, cols.driver_share, cols.price, cols.estimate);
}
