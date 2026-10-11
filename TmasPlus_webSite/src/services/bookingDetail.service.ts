import { supabase } from "@/config/supabase";
import { BookingsService, type BookingRecord, type ServiceSnapshot } from "./bookings.service";

const db = supabase as any;

/** Fila cruda de `reserva` en core (columnas en español). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ReservaRow = Record<string, any>;

export type TrackingPoint = {
  lat: number;
  lng: number;
  ts: number;
  speed: number | null;
  accuracy: number | null;
};

export type PersonInfo = {
  id: string;
  name: string | null;
  email: string | null;
  mobile: string | null;
  photo: string | null;
  rating: number | null;
};

export type VehicleInfo = {
  id: string | null;
  make: string | null;
  model: string | null;
  color: string | null;
  plate: string | null;
  year: string | number | null;
};

export type BookingDetailExtras = {
  reserva: ReservaRow | null;
  snapshots: ServiceSnapshot[];
  tracking: TrackingPoint[];
  driver: PersonInfo | null;
  customer: PersonInfo | null;
  vehicle: VehicleInfo | null;
  errors: string[];
};

const TRACKING_PAGE = 1000;
const TRACKING_MAX = 20000;

function text(value: unknown): string | null {
  const s = value == null ? "" : String(value).trim();
  return s ? s : null;
}

async function fetchReserva(id: string) {
  const { data, error } = await db.from("reserva").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`reserva: ${error.message}`);
  return (data as ReservaRow) ?? null;
}

export async function fetchTracking(bookingId: string): Promise<TrackingPoint[]> {
  const points: TrackingPoint[] = [];
  for (let from = 0; from < TRACKING_MAX; from += TRACKING_PAGE) {
    const { data, error } = await db
      .from("reserva_tracking")
      .select("lat,lng,registrado_en,velocidad,precision_m")
      .eq("id_reserva", bookingId)
      .order("registrado_en", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + TRACKING_PAGE - 1);
    if (error) throw new Error(`reserva_tracking: ${error.message}`);
    for (const row of data ?? []) {
      const lat = Number(row.lat);
      const lng = Number(row.lng);
      const ts = new Date(row.registrado_en).getTime();
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(ts)) continue;
      points.push({
        lat,
        lng,
        ts,
        speed: row.velocidad == null ? null : Number(row.velocidad),
        accuracy: row.precision_m == null ? null : Number(row.precision_m),
      });
    }
    if (!data || data.length < TRACKING_PAGE) break;
  }
  return points;
}

async function fetchPerson(id: string | null): Promise<PersonInfo | null> {
  if (!id) return null;
  const { data, error } = await db
    .from("web_users")
    .select("*")
    .or(`id.eq.${id},auth_id.eq.${id}`)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`web_users: ${error.message}`);
  if (!data) return null;
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  return {
    id: data.id,
    name: name || null,
    email: text(data.email),
    mobile: text(data.mobile),
    photo: text(data.profile_image),
    rating: data.rating == null ? null : Number(data.rating),
  };
}

function toVehicle(row: ReservaRow | null): VehicleInfo | null {
  if (!row) return null;
  return {
    id: row.id ?? null,
    make: text(row.make ?? row.marca),
    model: text(row.model ?? row.modelo),
    color: text(row.color),
    plate: text(row.plate ?? row.vehicle_number ?? row.placa),
    year: row.vehicle_year ?? row.year ?? null,
  };
}

/** Mismo orden que la app: vehículo de la reserva, si no el activo/más reciente del conductor. */
async function fetchVehicle(vehicleId: string | null, driverId: string | null): Promise<VehicleInfo | null> {
  if (vehicleId) {
    const { data, error } = await db.from("web_cars").select("*").eq("id", vehicleId).maybeSingle();
    if (error) throw new Error(`web_cars: ${error.message}`);
    if (data) return toVehicle(data);
  }
  if (!driverId) return null;
  const { data, error } = await db
    .from("web_cars")
    .select("*")
    .eq("driver_id", driverId)
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(`web_cars: ${error.message}`);
  return toVehicle(data?.[0] ?? null);
}

export type ChatMessage = {
  id: string;
  senderId: string | null;
  senderRole: "driver" | "customer" | "admin";
  senderName: string | null;
  message: string;
  createdAt: string;
};

/** Mensajes del chat cliente ↔ conductor (misma tabla que chatService de la app). */
export async function fetchChatMessages(bookingId: string): Promise<ChatMessage[]> {
  const { data, error } = await db
    .from("mensaje_chat")
    .select("id,id_remitente,rol_remitente,remitente_nombre,mensaje,creado_en")
    .eq("id_reserva", bookingId)
    .order("creado_en", { ascending: true });
  if (error) throw new Error(`mensaje_chat: ${error.message}`);
  return (data ?? []).map((row: ReservaRow) => {
    const rol = String(row.rol_remitente || "").toLowerCase();
    return {
      id: String(row.id),
      senderId: row.id_remitente ?? null,
      senderRole: rol === "conductor" ? "driver" : rol === "cliente" ? "customer" : "admin",
      senderName: text(row.remitente_nombre),
      message: String(row.mensaje ?? ""),
      createdAt: String(row.creado_en ?? ""),
    };
  });
}

function settle<T>(promise: Promise<T>, fallback: T, errors: string[]): Promise<T> {
  return promise.catch((e: unknown) => {
    errors.push(e instanceof Error ? e.message : String(e));
    return fallback;
  });
}

export async function fetchBookingDetailExtras(booking: BookingRecord): Promise<BookingDetailExtras> {
  const errors: string[] = [];
  const [reserva, snapshots, tracking] = await Promise.all([
    settle(fetchReserva(booking.id), null, errors),
    settle(BookingsService.getServiceSnapshots(booking.id), [] as ServiceSnapshot[], errors),
    settle(fetchTracking(booking.id), [] as TrackingPoint[], errors),
  ]);

  const driverId = reserva?.id_conductor ?? booking.driver_id ?? booking.driver ?? null;
  const customerId = reserva?.id_cliente ?? booking.customer_id ?? booking.customer ?? null;
  const vehicleId = reserva?.id_vehiculo ?? booking.car_id ?? booking.vehicle_id ?? null;

  const [driver, customer, vehicle] = await Promise.all([
    settle(fetchPerson(driverId), null, errors),
    settle(fetchPerson(customerId), null, errors),
    settle(fetchVehicle(vehicleId, driverId), null, errors),
  ]);

  return { reserva, snapshots, tracking, driver, customer, vehicle, errors };
}
