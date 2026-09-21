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

const sb = supabase as any;
const bookingV2 = supabase.schema('booking_v2') as any;

function normalizeV2Booking(
  booking: Record<string, any>,
  customer?: Record<string, any>,
  category?: Record<string, any>,
  assignment?: Record<string, any>,
  fare?: Record<string, any>,
  details?: Record<string, any>
): BookingRecord {
  return {
    ...booking,
    customer_name: customer
      ? [customer.first_name, customer.last_name].filter(Boolean).join(' ')
      : null,
    customer_email: customer?.email ?? null,
    customer_contact: customer?.mobile ?? null,
    driver_id: assignment?.driver_id ?? null,
    driver_name: assignment?.driver_name_snapshot ?? null,
    driver_contact: assignment?.driver_contact_snapshot ?? null,
    car_id: assignment?.vehicle_id ?? null,
    car_type_id: booking.requested_car_type_id ?? null,
    car_type: category?.name ?? assignment?.car_type_name_snapshot ?? null,
    car_model: assignment
      ? [assignment.vehicle_make_snapshot, assignment.vehicle_model_snapshot].filter(Boolean).join(' ')
      : null,
    plate_number: assignment?.vehicle_plate_snapshot ?? null,
    pickup_location: {
      address: booking.pickup_address,
      lat: booking.pickup_lat,
      lng: booking.pickup_lng,
    },
    destination_location: {
      address: booking.dropoff_address,
      lat: booking.dropoff_lat,
      lng: booking.dropoff_lng,
    },
    drop_address: booking.dropoff_address,
    distance: fare?.estimated_distance_m != null ? Number(fare.estimated_distance_m) / 1000 : null,
    duration: fare?.estimated_duration_s != null ? Math.round(Number(fare.estimated_duration_s) / 60) : null,
    price: fare?.estimated_fare ?? null,
    estimate: fare?.estimated_fare ?? null,
    total_cost: fare?.final_fare ?? fare?.estimated_fare ?? null,
    driver_share: fare?.driver_earnings ?? null,
    convenience_fees: fare?.convenience_fee ?? null,
    discount: fare?.discount_amount ?? null,
    booking_date: booking.scheduled_at ?? booking.created_at,
    cancellation_time: booking.cancelled_at ?? null,
    cancelled_by: booking.cancelled_by_user_id ?? null,
    reason: booking.cancellation_reason ?? null,
    service_data_snapshots: [],
    otp: details?.otp ?? null,
    rating: details?.rating ?? null,
    review: details?.review ?? null,
    driver_rating: details?.driver_rating ?? null,
    customer_rating: details?.customer_rating ?? null,
    customer_review: details?.customer_review ?? null,
  } as BookingRecord;
}

async function loadV2Bookings(query?: string, limit = 1000): Promise<BookingRecord[]> {
  let request = bookingV2
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (query) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query);
    request = isUuid ? request.or(`id.eq.${query},reference.eq.${query}`) : request.eq('reference', query);
  }

  const { data: rows, error } = await request;
  if (error) throw new Error(error.message || 'Error al obtener reservas');
  if (!rows?.length) return [];

  const bookingIds = rows.map((row: any) => row.id);
  const customerIds = [...new Set(rows.map((row: any) => row.customer_id).filter(Boolean))] as string[];
  const categoryIds = [...new Set(rows.map((row: any) => row.requested_car_type_id).filter(Boolean))] as string[];

  const [customersResult, categoriesResult, assignmentsResult, faresResult, detailsResult] = await Promise.all([
    bookingV2.from('core_users').select('id, first_name, last_name, email, mobile').in('id', customerIds),
    bookingV2.from('core_car_types').select('id, name').in('id', categoryIds),
    bookingV2.from('booking_assignments').select('*').in('booking_id', bookingIds).order('assigned_at', { ascending: false }),
    bookingV2.from('booking_fares').select('*').in('booking_id', bookingIds),
    sb.from('bookings_v2_mobile').select('id, otp, rating, review, driver_rating, customer_rating, customer_review').in('id', bookingIds),
  ]);

  for (const result of [customersResult, categoriesResult, assignmentsResult, faresResult, detailsResult]) {
    if (result.error) throw new Error(result.error.message);
  }

  const customers = new Map((customersResult.data ?? []).map((row: any) => [row.id, row]));
  const categories = new Map((categoriesResult.data ?? []).map((row: any) => [row.id, row]));
  const assignments = new Map<string, any>();
  for (const row of assignmentsResult.data ?? []) {
    if (!assignments.has(row.booking_id)) assignments.set(row.booking_id, row);
  }
  const fares = new Map((faresResult.data ?? []).map((row: any) => [row.booking_id, row]));
  const details = new Map<string, any>((detailsResult.data ?? []).map((row: any) => [row.id, row]));

  return rows.map((row: any) => normalizeV2Booking(
    row,
    customers.get(row.customer_id),
    categories.get(row.requested_car_type_id),
    assignments.get(row.id),
    fares.get(row.id),
    details.get(row.id)
  ));
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

export class BookingsService {
  static async getServiceSnapshots(bookingIds: string | string[]): Promise<ServiceSnapshot[]> {
    const ids = [...new Set((Array.isArray(bookingIds) ? bookingIds : [bookingIds]).filter(Boolean))];
    if (!ids.length) return [];
    const [eventsResult, milestonesResult] = await Promise.all([
      bookingV2.from('booking_status_events').select('*').in('booking_id', ids).order('occurred_at'),
      bookingV2.from('booking_milestones').select('*').in('booking_id', ids).order('occurred_at'),
    ]);
    if (eventsResult.error) throw new Error(eventsResult.error.message);
    if (milestonesResult.error) throw new Error(milestonesResult.error.message);

    const timeline: ServiceSnapshot[] = [
      ...(eventsResult.data ?? []).map((row: any) => ({
        id: row.id,
        booking_id: row.booking_id,
        stage: row.to_status,
        status: row.to_status,
        captured_at: row.occurred_at,
        latitude: null,
        longitude: null,
        address: null,
        calculated_price: null,
        distance: null,
        duration: null,
        data: { ...(row.metadata ?? {}), reason: row.reason, source: row.source },
        raw: row,
      })),
      ...(milestonesResult.data ?? []).map((row: any) => ({
        id: row.id,
        booking_id: row.booking_id,
        stage: row.milestone_type,
        status: row.milestone_type,
        captured_at: row.occurred_at,
        latitude: snapshotNumber(row.location_lat),
        longitude: snapshotNumber(row.location_lng),
        address: null,
        calculated_price: null,
        distance: null,
        duration: null,
        data: row.metadata ?? {},
        raw: row,
      })),
    ];
    return timeline.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  }

  static async list(): Promise<BookingRecord[]> {
    return loadV2Bookings();
  }

  static async findByReferenceOrId(query: string): Promise<BookingRecord | null> {
    const q = query.trim();
    if (!q) return null;

    return (await loadV2Bookings(q, 1))[0] ?? null;
  }

  static async searchCustomers(
    query: string,
    limit = 10
  ): Promise<CustomerLite[]> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    const q = query.trim();
    if (!q) return [];
    const term = `%${q}%`;
    const { data, error } = await bookingV2
      .from('core_users')
      .select('id, first_name, last_name, email, mobile')
      .or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},mobile.ilike.${term}`
      )
      .limit(limit);

    if (error) throw new Error(error.message || 'Error al buscar clientes');
    return (data || []) as CustomerLite[];
  }

  static async create(input: CreateBookingInput): Promise<BookingRecord> {
    if (!input.car_type_id) throw new Error('Selecciona una categoría válida');
    const scheduled = input.booking_type === 'reservation';
    const idempotencyKey = input.reference || `web-${crypto.randomUUID()}`;
    const { data: bookingId, error } = await bookingV2.rpc('create_booking', {
      p_idempotency_key: idempotencyKey,
      p_customer_id: input.customer_id,
      p_requested_car_type_id: input.car_type_id,
      p_booking_type: scheduled ? 'SCHEDULED' : 'IMMEDIATE',
      p_scheduled_at: scheduled ? input.booking_date : null,
      p_request_expires_at: null,
      p_pickup_address: input.pickup.address,
      p_pickup_lat: input.pickup.lat,
      p_pickup_lng: input.pickup.lng,
      p_dropoff_address: input.destination.address,
      p_dropoff_lat: input.destination.lat,
      p_dropoff_lng: input.destination.lng,
      p_waypoints: [],
      p_observations: input.observations || null,
      p_payment_mode: input.payment_mode,
      p_estimated_distance_m: Math.round(input.distance_km * 1000),
      p_estimated_duration_s: Math.round(input.duration_min * 60),
      p_estimated_fare: input.total_cost,
      p_tariff_snapshot: {
        category_id: input.car_type_id,
        category_name: input.car_type,
        trip_type: input.trip_type,
        estimate: input.estimate,
        convenience_fee: input.convenience_fees ?? 0,
        discount: input.discount ?? 0,
        driver_share: input.driver_share ?? 0,
      },
    });
    if (error) throw new Error(error.message || 'Error al crear reserva');
    const created = await loadV2Bookings(String(bookingId), 1);
    if (!created[0]) throw new Error('La reserva se creó, pero no se pudo recuperar');
    return created[0];
  }

  static async listAssignableDrivers(query = ''): Promise<AssignableDriver[]> {
    const { data, error } = await bookingV2.rpc('list_assignable_drivers', { p_query: query });
    if (error) throw new Error(error.message || 'Error al obtener conductores');
    return (data ?? []) as AssignableDriver[];
  }

  static async assignDriver(
    bookingId: string,
    driverId: string
  ): Promise<BookingRecord> {
    const drivers = await this.listAssignableDrivers();
    const selected = drivers.find((driver) => driver.id === driverId);
    if (!selected?.vehicle?.id) throw new Error('El conductor no tiene un vehículo activo elegible');
    const { error } = await bookingV2.rpc('assign_booking', {
      p_booking_id: bookingId,
      p_driver_id: driverId,
      p_vehicle_id: selected.vehicle.id,
      p_assigned_by_user_id: null,
    });
    if (error) throw new Error(error.message || 'No se pudo asignar el conductor');
    const booking = await this.findByReferenceOrId(bookingId);
    if (!booking) throw new Error('La reserva asignada no se pudo recuperar');
    return booking;
  }

  static async cancel(id: string, reason?: string): Promise<BookingRecord> {
    const current = await this.findByReferenceOrId(id);
    if (!current) throw new Error('Reserva no encontrada');
    const { error } = await bookingV2.rpc('transition_booking_status', {
      p_booking_id: id,
      p_expected_status: current.status,
      p_new_status: 'CANCELLED',
      p_changed_by_user_id: null,
      p_source: 'ADMIN',
      p_reason: reason || 'Cancelada por administrador',
      p_metadata: null,
      p_location_lat: null,
      p_location_lng: null,
      p_accuracy_m: null,
      p_cancellation_category: 'ADMIN_CANCELLED',
    });
    if (error) throw new Error(error.message || 'No se pudo cancelar la reserva');
    const cancelled = await this.findByReferenceOrId(id);
    if (!cancelled) throw new Error('La reserva cancelada no se pudo recuperar');
    return cancelled;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await bookingV2.rpc('delete_booking', { p_booking_id: id });
    if (error) throw new Error(error.message || 'No se pudo eliminar la reserva');
  }
}
