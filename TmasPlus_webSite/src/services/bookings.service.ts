import { supabase, supabaseSecondary } from '@/config/supabase';

export type BookingStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'STARTED'
  | 'ARRIVED'
  | 'PICKED_UP'
  | 'COMPLETED'
  | 'CANCELLED'
  | string;

export interface BookingRecord {
  id: string;
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
  cancellation_time: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  reason: string | null;
  booking_date: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

const sb = supabaseSecondary as any;

async function syncSession() {
  if (!sb) throw new Error('Cliente secundario no configurado');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa');
  sb.rest.headers['Authorization'] = `Bearer ${session.access_token}`;
}

export interface CustomerLite {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
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

function buildReference(): string {
  const now = new Date();
  const stamp =
    now.getFullYear().toString().slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    '-' +
    Math.floor(Math.random() * 9000 + 1000);
  return `TMP-${stamp}`;
}

export class BookingsService {
  static async list(): Promise<BookingRecord[]> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    const { data, error } = await sb
      .from('bookings')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'Error al obtener reservas');
    return (data || []) as BookingRecord[];
  }

  static async searchCustomers(
    query: string,
    limit = 10
  ): Promise<CustomerLite[]> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    const q = query.trim();
    if (!q) return [];
    const term = `%${q}%`;
    const { data, error } = await sb
      .from('users')
      .select('id, first_name, last_name, email, mobile')
      .or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},mobile.ilike.${term}`
      )
      .limit(limit);

    if (error) throw new Error(error.message || 'Error al buscar clientes');
    return (data || []) as CustomerLite[];
  }

  static async create(input: CreateBookingInput): Promise<BookingRecord> {
    await syncSession();

    const pickupLoc = {
      lat: input.pickup.lat,
      lng: input.pickup.lng,
      address: input.pickup.address,
    };
    const dropLoc = {
      lat: input.destination.lat,
      lng: input.destination.lng,
      address: input.destination.address,
    };

    const payload: any = {
      customer_id: input.customer_id,
      customer: input.customer_id,
      customer_name: input.customer_name || null,
      customer_email: input.customer_email || null,
      customer_contact: input.customer_contact || '',
      status: 'PENDING',
      customer_status: 'SEARCHING',
      pickup_location: pickupLoc,
      destination_location: dropLoc,
      drop_location: dropLoc,
      pickup_address: input.pickup.address,
      pickup_lat: input.pickup.lat,
      pickup_lng: input.pickup.lng,
      drop_address: input.destination.address,
      drop_lat: input.destination.lat,
      drop_lng: input.destination.lng,
      distance: input.distance_km,
      duration: input.duration_min,
      car_type: input.car_type,
      car_type_id: input.car_type_id || null,
      trip_type: input.trip_type,
      booking_type: input.booking_type,
      booking_date: input.booking_date,
      payment_mode: input.payment_mode,
      price: input.total_cost,
      estimate: input.estimate,
      total_cost: input.total_cost,
      driver_share: input.driver_share ?? 0,
      convenience_fees: input.convenience_fees ?? 0,
      discount: input.discount ?? 0,
      observations: input.observations || null,
      reference: input.reference || buildReference(),
      prepaid: false,
      promo_applied: false,
      customer_token: '',
      requested_drivers: {},
      driver_estimates: {},
      waypoints: [],
      otp_verified: false,
      otp_timer_duration: 180,
    };

    const { data, error } = await sb
      .from('bookings')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear reserva');
    return data as BookingRecord;
  }

  static async cancel(id: string, reason?: string): Promise<BookingRecord> {
    await syncSession();
    const now = new Date().toISOString();
    const { data, error } = await sb
      .from('bookings')
      .update({
        status: 'CANCELLED',
        cancelled_at: now,
        cancellation_time: now,
        reason: reason || 'Cancelada por administrador',
        cancelled_by: 'admin',
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al cancelar reserva');
    return data as BookingRecord;
  }

  static async delete(id: string): Promise<void> {
    await syncSession();
    const { error } = await sb.from('bookings').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Error al eliminar reserva');
  }
}
