import { supabase } from '@/config/supabase';
import type { BookingRecord, ServiceSnapshot, CustomerLite, AssignableDriver, CreateBookingInput } from './bookings.service';
const db = supabase as any;

function normalize(row: any): BookingRecord {
  const statuses: Record<string,string> = {NEW:'PENDING',COMPLETE:'COMPLETED',ARRIVED:'ARRIVED_PICKUP',REACHED:'ARRIVED_DESTINATION'};
  return { ...row, status: statuses[row.status] ?? row.status,
    booking_type: row.booking_type === 'scheduled' ? 'SCHEDULED' : 'IMMEDIATE',
    duration: row.duration == null ? null : Math.round(Number(row.duration) / 60),
    pickup_location: { address: row.pickup_address, lat: row.pickup_lat, lng: row.pickup_lng },
    destination_location: { address: row.drop_address, lat: row.drop_lat, lng: row.drop_lng },
    service_data_snapshots: [],
  };
}
export type BookingListFilters = {
  search?: string;
  /** Estado normalizado de la UI (PENDING, COMPLETED…). */
  status?: string | null;
  /** Varios estados a la vez (se combinan con OR). */
  statuses?: string[] | null;
  driverId?: string | null;
  /** Valores de car_type que corresponden a la categoría elegida. */
  carTypes?: string[] | null;
  /** YYYY-MM-DD (hora local), sobre la fecha del servicio. */
  dateFrom?: string | null;
  dateTo?: string | null;
};

// Estados crudos de la vista que `normalize` traduce al nombre de la UI.
const RAW_STATUSES: Record<string, string[]> = {
  PENDING: ['PENDING', 'NEW'],
  COMPLETED: ['COMPLETED', 'COMPLETE'],
  ARRIVED_PICKUP: ['ARRIVED_PICKUP', 'ARRIVED'],
  ARRIVED_DESTINATION: ['ARRIVED_DESTINATION', 'REACHED'],
};

const SEARCH_COLUMNS = ['reference', 'customer_name', 'customer_email', 'customer_contact', 'driver_name',
  'driver_contact', 'plate_number', 'pickup_address', 'drop_address', 'car_type'];

function applyFilters(query: any, f: BookingListFilters) {
  let q = query;
  if (f.status) q = q.in('status', RAW_STATUSES[f.status] ?? [f.status]);
  if (f.statuses?.length) q = q.in('status', f.statuses.flatMap((s) => RAW_STATUSES[s] ?? [s]));
  if (f.driverId) q = q.eq('driver_id', f.driverId);
  if (f.carTypes?.length) q = q.in('car_type', f.carTypes);
  if (f.dateFrom) q = q.gte('booking_date', new Date(`${f.dateFrom}T00:00:00`).toISOString());
  if (f.dateTo) q = q.lte('booking_date', new Date(`${f.dateTo}T23:59:59.999`).toISOString());
  // PostgREST usa , ( ) como separadores del filtro `or`.
  const term = (f.search ?? '').replace(/[,()*%\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (term) {
    const ors = SEARCH_COLUMNS.map((c) => `${c}.ilike.*${term}*`);
    if (/^[0-9a-f-]{36}$/i.test(term)) ors.push(`id.eq.${term}`);
    q = q.or(ors.join(','));
  }
  return q;
}

export class BookingsService {
  /** Página de reservas (más recientes primero) con los filtros aplicados en la BD. */
  static async listPage(
    filters: BookingListFilters,
    page: number,
    pageSize: number
  ): Promise<{ rows: BookingRecord[]; total: number }> {
    const from = Math.max(0, page - 1) * pageSize;
    const query = applyFilters(db.from('web_bookings').select('*', { count: 'exact' }), filters);
    const { data, error, count } = await query
      .order('created_at', { ascending: false }).order('id').range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: (data ?? []).map(normalize), total: count ?? 0 };
  }

  /** Solo el número de reservas que cumplen los filtros (sin traer filas). */
  static async count(filters: BookingListFilters): Promise<number> {
    const { count, error } = await applyFilters(
      db.from('web_bookings').select('id', { count: 'exact', head: true }),
      filters
    );
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  /** Todas las reservas que cumplen los filtros (para exportar). */
  static async listAll(filters: BookingListFilters): Promise<BookingRecord[]> {
    const rows: BookingRecord[] = [];
    for (let from = 0;;) {
      const { data, error } = await applyFilters(db.from('web_bookings').select('*'), filters)
        .order('created_at', { ascending: false }).order('id').range(from, from + 499);
      if (error) throw new Error(error.message);
      if (!data?.length) return rows;
      rows.push(...data.map(normalize)); from += data.length;
    }
  }

  /** Conductores para el filtro del historial, buscados por nombre/correo. */
  static async searchDriverOptions(query: string, limit = 30): Promise<{ id: string; name: string }[]> {
    const terms = query.replace(/[,()*%\\]/g, ' ').trim().split(/\s+/).filter(Boolean);
    let q = db.from('web_users').select('id,first_name,last_name,email').eq('user_type', 'driver');
    if (terms[0]) q = q.or(['first_name', 'last_name', 'email'].map((c) => `${c}.ilike.*${terms[0]}*`).join(','));
    const { data, error } = await q.order('first_name').limit(terms.length > 1 ? 200 : limit);
    if (error) throw new Error(error.message);
    const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return (data ?? [])
      .map((u: any) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || u.id }))
      .filter((u: { name: string }) => terms.slice(1).every((t) => norm(u.name).includes(norm(t))))
      .slice(0, limit);
  }

  static async list(): Promise<BookingRecord[]> {
    const rows: BookingRecord[] = [];
    for (let from = 0;;) {
      const { data, error } = await db.from('web_bookings').select('*')
        .order('created_at', { ascending: false }).order('id').range(from, from + 499);
      if (error) throw new Error(error.message);
      if (!data?.length) return rows;
      rows.push(...data.map(normalize)); from += data.length;
    }
  }
  static async findByReferenceOrId(query: string): Promise<BookingRecord | null> {
    const q = query.trim(); if (!q) return null;
    const { data, error } = await db.from('web_bookings').select('*')
      .eq(/^[0-9a-f-]{36}$/i.test(q) ? 'id' : 'reference', q).maybeSingle();
    if (error) throw new Error(error.message); return data ? normalize(data) : null;
  }
  static async getServiceSnapshots(bookingIds: string | string[]): Promise<ServiceSnapshot[]> {
    const ids = [...new Set((Array.isArray(bookingIds) ? bookingIds : [bookingIds]).filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await db.from('reserva_snapshot').select('*').in('id_reserva', ids).order('capturado_en');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ id:r.id, booking_id:r.id_reserva, stage:r.etapa,
      status:r.etapa, captured_at:r.capturado_en, latitude:r.lat, longitude:r.lng,
      address:r.datos_crudos?.address ?? null, calculated_price:r.precio_calculado,
      distance:r.distancia_km, duration:r.duracion_seg, data:r.datos_crudos ?? {}, raw:r }));
  }
  static async searchCustomers(query: string, limit = 10): Promise<CustomerLite[]> {
    const q = query.replace(/[%(),.*]/g, '').trim(); if (!q) return [];
    const { data, error } = await db.from('web_users').select('id,first_name,last_name,email,mobile')
      .in('user_type', ['customer','company']).eq('blocked', false)
      .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,mobile.ilike.%${q}%`).limit(limit);
    if (error) throw new Error(error.message); return data ?? [];
  }
  static async create(input: CreateBookingInput): Promise<BookingRecord> {
    const { data, error } = await db.rpc('web_create_booking', { p_input: input });
    if (error) throw new Error(error.message);
    return this.recover(String(data));
  }
  static async listAssignableDrivers(query = ''): Promise<AssignableDriver[]> {
    const { data, error } = await db.rpc('web_assignable_drivers', { p_query: query });
    if (error) throw new Error(error.message); return data ?? [];
  }
  static async assignDriver(bookingId: string, driverId: string): Promise<BookingRecord> {
    const { error } = await db.rpc('web_assign_booking', { p_booking_id:bookingId, p_driver_id:driverId });
    if (error) throw new Error(error.message); return this.recover(bookingId);
  }
  static async cancel(id: string, reason?: string): Promise<BookingRecord> {
    const { error } = await db.rpc('web_cancel_booking', { p_booking_id:id, p_reason:reason || 'Cancelada por administrador' });
    if (error) throw new Error(error.message); return this.recover(id);
  }
  static async delete(_id: string): Promise<void> {
    throw new Error('Core conserva el historial. Utiliza Cancelar; el borrado no está habilitado.');
  }
  private static async recover(id: string): Promise<BookingRecord> {
    const booking = await this.findByReferenceOrId(id);
    if (!booking) throw new Error('Operación realizada; no se pudo recuperar la reserva. Actualiza antes de reintentar.');
    return booking;
  }
}
