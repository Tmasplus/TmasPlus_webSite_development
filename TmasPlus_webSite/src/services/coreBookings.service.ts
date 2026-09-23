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
export class BookingsService {
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
