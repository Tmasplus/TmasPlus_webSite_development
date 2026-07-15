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

const sb = supabaseSecondary as any;

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

async function currentPrimaryAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa');
  return session.access_token;
}

async function invokeBookingFunction<T>(
  name: string,
  body: Record<string, unknown>
): Promise<T> {
  if (!sb) throw new Error('Cliente secundario no configurado');

  const token = await currentPrimaryAccessToken();
  const { data, error } = await sb.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${token}` },
  });

  if (error) {
    let message = error.message || `Error al ejecutar ${name}`;
    const ctx: any = (error as any).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const errBody = await ctx.json();
        if (errBody?.error) message = errBody.error;
      } catch { /* noop */ }
    }
    throw new Error(message);
  }

  return data as T;
}

export class BookingsService {
  static async list(): Promise<BookingRecord[]> {
    const data = await invokeBookingFunction<{
      success?: boolean;
      bookings?: BookingRecord[];
      error?: string;
    }>('list-bookings', {});

    if (!data?.success) {
      throw new Error(data?.error || 'Error al obtener reservas');
    }
    return data.bookings || [];
  }

  static async findByReferenceOrId(query: string): Promise<BookingRecord | null> {
    const q = query.trim();
    if (!q) return null;

    const data = await invokeBookingFunction<{
      success?: boolean;
      bookings?: BookingRecord[];
      error?: string;
    }>('list-bookings', { query: q, limit: 1 });

    if (!data?.success) {
      throw new Error(data?.error || 'Error al buscar la reserva');
    }
    return data.bookings?.[0] || null;
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
    if (!sb) throw new Error('Cliente secundario no configurado');
    // El dashboard se autentica contra el proyecto PRIMARIO; su token no es
    // válido para escribir en el secundario (se trata como anon y RLS lo
    // rechaza). Por eso la inserción se hace vía Edge Function `create-booking`
    // con service role, igual que update-user / set-user-blocked / delete-user.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

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
      // trip_cost = subtotal sin fee. Trigger calculate_total_cost suma fees al guardar:
      //   NEW.total_cost = trip_cost + convenience_fees - discount
      // Sin esta línea, trip_cost queda NULL→0 y el trigger pisa total_cost=fees solamente.
      trip_cost: Math.max(0, (input.total_cost ?? 0) - (input.convenience_fees ?? 0) + (input.discount ?? 0)),
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

    const { data, error } = await sb.functions.invoke('create-booking', {
      body: { booking: payload },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al crear reserva';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const errBody = await ctx.json();
          if (errBody?.error) message = errBody.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }
    if (!data?.success || !data?.booking) {
      throw new Error('No se pudo crear la reserva');
    }
    return data.booking as BookingRecord;
  }

  static async listAssignableDrivers(query = ''): Promise<AssignableDriver[]> {
    const data = await invokeBookingFunction<{
      success?: boolean;
      drivers?: AssignableDriver[];
      error?: string;
    }>('assign-booking-driver', { action: 'list-drivers', query });

    if (!data?.success) {
      throw new Error(data?.error || 'Error al obtener conductores');
    }
    return data.drivers || [];
  }

  static async assignDriver(
    bookingId: string,
    driverId: string
  ): Promise<BookingRecord> {
    const data = await invokeBookingFunction<{
      success?: boolean;
      booking?: BookingRecord;
      error?: string;
    }>('assign-booking-driver', {
      action: 'assign',
      bookingId,
      driverId,
    });

    if (!data?.success || !data?.booking) {
      throw new Error(data?.error || 'No se pudo asignar el conductor');
    }
    return data.booking;
  }

  static async cancel(id: string, reason?: string): Promise<BookingRecord> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    // El token del dashboard (proyecto primario) no es válido para escribir en
    // el secundario, así que la cancelación va por Edge Function con service role.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('cancel-booking', {
      body: { id, reason },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al cancelar reserva';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const errBody = await ctx.json();
          if (errBody?.error) message = errBody.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }
    if (!data?.success || !data?.booking) {
      throw new Error('No se pudo cancelar la reserva');
    }
    return data.booking as BookingRecord;
  }

  static async delete(id: string): Promise<void> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    // El token del dashboard (proyecto primario) no es válido para escribir en
    // el secundario, así que la eliminación va por Edge Function con service role.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('delete-booking', {
      body: { id },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al eliminar reserva';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const errBody = await ctx.json();
          if (errBody?.error) message = errBody.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }
    if (!data?.success) {
      throw new Error('No se pudo eliminar la reserva');
    }
  }
}
