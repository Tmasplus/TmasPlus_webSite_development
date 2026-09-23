import { supabase } from '@/config/supabase';

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'STARTED'
  | 'ARRIVED'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | string;

export type ServiceStage =
  | 'created'
  | 'arrival_pickup'
  | 'started'
  | 'arrival_destination'
  | 'completed'
  | 'paid'
  | 'cancelled'
  | string;

/**
 * Snapshot del ciclo de vida de un servicio. Cada reserva tiene como maximo un
 * snapshot por `stage` (constraint unique booking_id+stage en la BD secundaria).
 * `raw_data` es un jsonb cuya forma depende del stage.
 */
export interface ServiceDataSnapshot {
  id: string;
  booking_id: string;
  stage: ServiceStage;
  captured_at: string | null;
  driver_id: string | null;
  customer_id: string | null;
  location_lat: number | null;
  location_lng: number | null;
  distance_km: string | number | null;
  duration_seconds: number | null;
  price_calculated: string | number | null;
  raw_data: Record<string, any> | null;
  created_at: string | null;
}

export interface BookingRecord {
  id: string;
  service_data_snapshots?: ServiceDataSnapshot[];
  reference: string | null;
  status: BookingStatus;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_contact: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_contact: string | null;
  car_type: string | null;
  car_model: string | null;
  plate_number: string | null;
  pickup_address: string | null;
  drop_address: string | null;
  distance: string | number | null;
  duration: number | null;
  price: string | number | null;
  estimate: string | number | null;
  total_cost: string | number | null;
  driver_share: string | number | null;
  convenience_fees: string | number | null;
  discount: string | number | null;
  payment_mode: string | null;
  trip_type: string | null;
  booking_type: string | null;
  otp: string | null;
  rating: number | null;
  review: string | null;
  driver_rating: number | null;
  customer_rating: number | null;
  customer_review: string | null;
  cancellation_time: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  reason: string | null;
  booking_date: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface ServiceSnapshot {
  id: string;
  booking_id: string;
  stage: string;
  status: string;
  captured_at: string;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  calculated_price: number | null;
  distance: number | null;
  duration: number | null;
  data: Record<string, unknown>;
  raw: Record<string, unknown>;
}

function snapshotNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSnapshot(row: Record<string, unknown>, bookingId: string, index: number): ServiceSnapshot {
  const rawData = row.raw_data && typeof row.raw_data === 'object' && !Array.isArray(row.raw_data)
    ? row.raw_data as Record<string, unknown>
    : {};
  return {
    id: String(row.id ?? `${bookingId}-${index}`),
    booking_id: String(row.booking_id ?? bookingId),
    stage: String(row.stage ?? 'unknown'),
    status: String(row.stage ?? 'unknown'),
    captured_at: String(row.captured_at ?? ''),
    latitude: snapshotNumber(row.location_lat),
    longitude: snapshotNumber(row.location_lng),
    address: (rawData.address as string) ?? null,
    calculated_price: snapshotNumber(row.price_calculated),
    distance: snapshotNumber(row.distance_km),
    duration: snapshotNumber(row.duration_seconds),
    data: rawData,
    raw: row,
  };
}

/**
 * Total real del servicio. En la base de datos `total_cost` suele venir en 0,
 * mientras que el valor cobrado está en `price` (o `estimate`). Devolvemos el
 * primer candidato mayor que 0 para no mostrar nunca "0" en el historial.
 */
export function serviceTotal(
  b: Pick<BookingRecord, 'total_cost' | 'price' | 'estimate'>
): number | null {
  for (const candidate of [b.total_cost, b.price, b.estimate]) {
    const n = typeof candidate === 'string' ? Number(candidate) : candidate;
    if (n != null && !Number.isNaN(n) && n > 0) return n;
  }
  return null;
}

export interface CustomerLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
}

export interface AssignableDriver {
  id: string;
  auth_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  approved: boolean | null;
  blocked: boolean | null;
  driver_active_status: boolean | null;
  vehicle?: {
    id: string;
    make: string | null;
    model: string | null;
    plate: string | null;
    service_type: string | null;
  } | null;
}

export interface CreateBookingInput {
  customer_id: string;
  customer_name?: string | null;
  customer_email?: string | null;
  customer_contact?: string | null;
  pickup: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  distance_km: number;
  duration_min: number;
  car_type: string;
  car_type_id?: string | null;
  trip_type: string;
  booking_type: 'reservation' | 'immediate';
  booking_date: string;
  payment_mode: string;
  estimate: number;
  total_cost: number;
  driver_share?: number;
  convenience_fees?: number;
  discount?: number;
  observations?: string | null;
  reference?: string | null;
}

export { BookingsService } from './coreBookings.service';
