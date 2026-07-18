import {
  CalendarDays,
  CarFront,
  CircleDollarSign,
  Clock3,
  MessageSquareText,
  Navigation,
  Route,
  Star,
  UserRound,
  ChevronDown,
  MapPin,
} from "lucide-react";
import { useEffect, useState } from "react";
import { BookingsService, serviceTotal, type BookingRecord, type ServiceSnapshot } from "@/services/bookings.service";

const styles = {
  header: "flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5",
  headerIcon:
    "hidden h-14 w-14 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600 sm:grid",
  statusBadge:
    "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide",
  body: "bg-slate-50/70 p-4 sm:p-6",
  content: "mx-auto space-y-5",
  summary:
    "rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-sky-50 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
  section:
    "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)]",
  sectionIcon: "grid h-9 w-9 place-items-center rounded-full bg-blue-50 text-blue-600",
  valueText: "min-w-0 break-words [overflow-wrap:anywhere] font-medium",
  mapShell:
    "overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-[0_10px_30px_rgba(15,23,42,0.07)]",
  routeIcon: "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600",
};

export function isBookingCancelled(booking: BookingRecord) {
  return (booking.status || "").toUpperCase() === "CANCELLED";
}

function formatDate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return "—";
  let d: Date;
  if (typeof value === "number") {
    d = new Date(value < 1e12 ? value * 1000 : value);
  } else if (/^\d+$/.test(value)) {
    const n = Number(value);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    d = new Date(value);
  }
  return isNaN(+d) ? String(value) : d.toLocaleString("es-CO");
}

function formatMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const num = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(num)) return String(v);
  if (num === 0) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(num);
}

function display(value?: React.ReactNode | null) {
  return value === null || value === undefined || value === "" ? "—" : value;
}

// La tarifa se estima como un rango de ±10% sobre el valor calculado (misma
// regla que /addbooking, ver AddBookingPage "Rango estimado (±10%)"). En la BD
// estimate = price = total_cost, así que el rango se deriva de ese valor base.
function estimateBase(b: BookingRecord): number | null {
  const est = getNumberValue(b.estimate);
  if (est != null && est > 0) return est;
  return serviceTotal(b);
}

function formatEstimateRange(b: BookingRecord) {
  const base = estimateBase(b);
  if (base == null || base <= 0) return "—";
  const low = Math.round(base * 0.9);
  const high = Math.round(base * 1.1);
  return `${formatMoney(low)} – ${formatMoney(high)}`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CANCELLED: "CANCELADA",
    COMPLETED: "COMPLETADA",
    COMPLETE: "COMPLETADA",
    PENDING: "PENDIENTE",
    ACCEPTED: "ACEPTADA",
    STARTED: "INICIADA",
    ARRIVED: "EN PUNTO",
    PICKED_UP: "EN VIAJE",
    CONFIRMED: "CONFIRMADA",
  };
  return labels[status] || status || "—";
}

function statusClassName(status: string) {
  const statusStyles: Record<string, string> = {
    CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
    COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
    COMPLETE: "bg-emerald-50 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    ACCEPTED: "bg-sky-50 text-sky-700 border-sky-200",
    CONFIRMED: "bg-sky-50 text-sky-700 border-sky-200",
    STARTED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    ARRIVED: "bg-indigo-50 text-indigo-700 border-indigo-200",
    PICKED_UP: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  return statusStyles[status] || "bg-slate-50 text-slate-700 border-slate-200";
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`${styles.statusBadge} ${statusClassName(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

export function BookingDetailHeader({
  booking,
  actions,
}: {
  booking: BookingRecord;
  actions?: React.ReactNode;
}) {
  const status = (booking.status || "").toUpperCase();

  return (
    <header className={styles.header}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={styles.headerIcon}>
          <CalendarDays size={26} />
        </span>
        <div className="min-w-0">
          <h2 className="text-2xl font-black tracking-tight text-slate-900">Detalle de Reserva</h2>
          <p className="mt-1 break-words text-sm font-medium text-slate-500 [overflow-wrap:anywhere]">
            Ref: {booking.reference || booking.id}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3">
        <StatusBadge status={status} />
        {actions}
      </div>
    </header>
  );
}

export function BookingDetailBody({ booking, className = "" }: { booking: BookingRecord; className?: string }) {
  const cancelled = isBookingCancelled(booking);

  return (
    <main className={`${styles.body} ${className}`}>
      <div className={styles.content}>
        <section className={styles.summary}>
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border border-blue-100 bg-blue-100/70 text-blue-600">
                <Route size={30} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-black uppercase tracking-wide text-[#082f49]">Resumen del viaje</p>
                <p className="mt-3 text-sm text-slate-500">Total cobrado</p>
                <p className="break-words text-3xl font-black tracking-tight text-slate-900 [overflow-wrap:anywhere]">
                  {formatMoney(serviceTotal(booking))}
                </p>
              </div>
            </div>
            <div className="hidden h-16 w-px bg-slate-200 md:block" />
            <div className="min-w-[200px] rounded-2xl bg-white/70 p-4 md:bg-transparent md:p-0">
              <p className="text-sm text-slate-500">Distancia</p>
              <p className="break-words text-3xl font-black tracking-tight text-blue-600 [overflow-wrap:anywhere]">
                {booking.distance ? `${booking.distance} km` : "—"}
              </p>
            </div>
          </div>
        </section>

        <MapPreview booking={booking} />

        <ServiceTimeline booking={booking} />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard title="Cliente" icon={<UserRound size={19} />}>
            <InfoRow label="Nombre" value={booking.customer_name} />
            <InfoRow label="Email" value={booking.customer_email} />
            <InfoRow label="Contacto" value={booking.customer_contact} />
          </SectionCard>

          <SectionCard title="Conductor / Vehículo" icon={<CarFront size={19} />}>
            <InfoRow label="Conductor" value={booking.driver_name} />
            <InfoRow label="Contacto" value={booking.driver_contact} />
            <InfoRow label="Tipo" value={booking.car_type} />
            <InfoRow label="Modelo" value={booking.car_model} />
            <InfoRow label="Placa" value={booking.plate_number} uppercase={!!booking.plate_number} />
          </SectionCard>

          <SectionCard title="Pago" icon={<CircleDollarSign size={19} />}>
            <InfoRow label="Estimado" value={formatEstimateRange(booking)} />
            <InfoRow label="Precio" value={formatMoney(booking.price)} />
            <InfoRow label="Costo total" value={formatMoney(serviceTotal(booking))} />
            {/* La comisión del conductor es 0 (no existe columna de comisión;
                driver_share es la ganancia del conductor, no una comisión). */}
            <InfoRow label="Comisión del conductor" value={null} />
            <InfoRow label="Cargo por conveniencia" value={formatMoney(booking.convenience_fees)} />
            <InfoRow label="Descuento" value={formatMoney(booking.discount)} />
            <InfoRow label="Forma de pago" value={booking.payment_mode} />
            <InfoRow label="OTP" value={booking.otp} mono />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <SectionCard title="Recorrido" icon={<Route size={19} />}>
            <InfoRow label="Origen" value={booking.pickup_address} />
            <InfoRow label="Destino" value={booking.drop_address} />
            <InfoRow label="Distancia" value={booking.distance ? `${booking.distance} km` : null} />
            <InfoRow label="Duración" value={booking.duration ? `${booking.duration} min` : null} />
            <InfoRow label="Tipo de viaje" value={booking.trip_type} />
            <InfoRow label="Tipo de reserva" value={booking.booking_type} />
          </SectionCard>

          <SectionCard title="Fechas" icon={<Clock3 size={19} />} className="lg:col-span-2">
            <div className="grid gap-x-6 sm:grid-cols-2">
              <InfoRow label="Fecha de creación" value={formatDate(booking.created_at)} />
              <InfoRow label="Fecha de reserva" value={formatDate(booking.booking_date)} />
              <InfoRow label="Última actualización" value={formatDate(booking.updated_at)} />
              {cancelled && <InfoRow label="Cancelada el" value={formatDate(booking.cancelled_at)} />}
              {cancelled && <InfoRow label="Cancelada por" value={booking.cancelled_by} />}
              {cancelled && <InfoRow label="Motivo" value={booking.reason} />}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Calificaciones" icon={<Star size={19} />}>
          <div className="grid gap-4 sm:grid-cols-2">
            <RatingBlock
              title="Conductor"
              rating={getNumberValue(booking.driver_rating) ?? getNumberValue(booking.rating)}
              comment={booking.review}
            />
            <RatingBlock
              title="Cliente"
              rating={getNumberValue(booking.customer_rating)}
              comment={booking.customer_review}
            />
          </div>
        </SectionCard>

        <SectionCard title="Observaciones" icon={<MessageSquareText size={19} />}>
          <p
            className={`min-h-8 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere] ${
              booking.observations ? "text-slate-800" : "text-slate-400"
            }`}
          >
            {booking.observations || "—"}
          </p>
        </SectionCard>
      </div>
    </main>
  );
}

const stageNames: Record<string, string> = {
  created: "Servicio creado",
  arrival_pickup: "Conductor en punto de recogida",
  started: "Viaje iniciado",
  arrival_destination: "Llegada al destino",
  completed: "Servicio completado",
  paid: "Pago registrado",
  cancelled: "Servicio cancelado",
};

function ServiceTimeline({ booking }: { booking: BookingRecord }) {
  const [snapshots, setSnapshots] = useState<ServiceSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    BookingsService.getServiceSnapshots(booking.id)
      .then((items) => { if (active) setSnapshots(items); })
      .catch((e) => { if (active) setError(e?.message || "No fue posible cargar la línea de tiempo"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [booking.id, booking.updated_at]);

  return (
    <SectionCard title="Línea de tiempo del servicio" icon={<Clock3 size={19} />}>
      {loading ? <p className="py-5 text-center text-sm text-slate-500">Cargando etapas...</p> :
       error ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{error}</p> :
       snapshots.length === 0 ? <p className="py-5 text-center text-sm text-slate-400">Este servicio todavía no tiene snapshots registrados.</p> :
       <ol className="relative ml-3 border-l-2 border-blue-100">
         {snapshots.map((snapshot, index) => <SnapshotItem key={snapshot.id} snapshot={snapshot} last={index === snapshots.length - 1} />)}
       </ol>}
    </SectionCard>
  );
}

const snapshotFieldNames: Record<string, string> = {
  address: "Dirección",
  category: "Categoría del servicio",
  backfilled: "Registro histórico recuperado",
  estimated_price: "Precio estimado",
  final_price: "Precio final",
  reason: "Motivo de cancelación",
  status_from: "Estado anterior",
  status_to: "Estado nuevo",
  cancelled_by: "Cancelado por",
  otp_verified: "OTP verificado",
  payment_mode: "Método de pago",
  trip_start_time: "Inicio del viaje",
  trip_end_time: "Fin del viaje",
  driver_arrived_time: "Llegada del conductor",
};

const snapshotMoneyFields = new Set(["estimated_price", "final_price", "price"]);
const snapshotDateFields = new Set(["trip_start_time", "trip_end_time", "driver_arrived_time"]);

function snapshotFieldName(key: string) {
  if (snapshotFieldNames[key]) return snapshotFieldNames[key];
  const text = key.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatSnapshotValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (snapshotMoneyFields.has(key)) return formatMoney(value as string | number);
  if (snapshotDateFields.has(key) && (typeof value === "string" || typeof value === "number")) {
    return formatDate(value);
  }
  if (key === "status_from" || key === "status_to") return statusLabel(String(value).toUpperCase());
  if (key === "payment_mode") {
    const modes: Record<string, string> = { cash: "Efectivo", card: "Tarjeta" };
    return modes[String(value).toLowerCase()] || String(value);
  }
  if (Array.isArray(value)) return value.map((item) => formatSnapshotValue(key, item)).join(", ");
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([nestedKey, nestedValue]) => `${snapshotFieldName(nestedKey)}: ${formatSnapshotValue(nestedKey, nestedValue)}`)
      .join(" · ");
  }
  return String(value);
}

function SnapshotItem({ snapshot, last }: { snapshot: ServiceSnapshot; last: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const stage = String(snapshot.stage || "unknown");
  const location = snapshot.address || (snapshot.latitude != null && snapshot.longitude != null
    ? `${snapshot.latitude.toFixed(6)}, ${snapshot.longitude.toFixed(6)}` : "—");
  const details = Object.entries(snapshot.data || {});
  return <li className={`relative ml-7 ${last ? "pb-1" : "pb-6"}`}>
    <span className="absolute -left-[37px] top-1 grid h-5 w-5 place-items-center rounded-full border-4 border-white bg-blue-600 shadow" />
    <button type="button" onClick={() => setExpanded(!expanded)} className="w-full rounded-xl border border-slate-100 bg-slate-50/70 p-4 text-left hover:border-blue-200" aria-expanded={expanded}>
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-bold text-slate-800">{stageNames[stage] || stage}</p><p className="mt-1 text-xs text-slate-500">{formatDate(snapshot.captured_at)}</p></div>
        <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <span className="flex items-center gap-1 text-slate-600"><MapPin size={14} />{location}</span>
        <span><b>Precio:</b> {formatMoney(snapshot.calculated_price)}</span>
        <span><b>Distancia:</b> {snapshot.distance != null ? `${snapshot.distance} km` : "—"}</span>
      </div>
    </button>
    {expanded && (
      <div className="mt-2 rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Detalles registrados</p>
        {details.length > 0 ? (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {details.map(([key, value]) => (
              <div key={key} className="min-w-0 border-b border-slate-100 pb-3 last:border-0">
                <dt className="text-xs font-medium text-slate-500">{snapshotFieldName(key)}</dt>
                <dd className="mt-1 break-words text-sm font-semibold text-slate-800">
                  {formatSnapshotValue(key, value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate-500">No hay detalles adicionales para esta etapa.</p>
        )}
      </div>
    )}
  </li>;
}

function SectionCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`${styles.section} ${className}`}>
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
        <span className={styles.sectionIcon}>{icon}</span>
        <h3 className="text-base font-bold text-[#082f49]">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function InfoRow({
  label,
  value,
  mono,
  uppercase,
}: {
  label: string;
  value?: React.ReactNode | null;
  mono?: boolean;
  uppercase?: boolean;
}) {
  const empty = value === null || value === undefined || value === "" || value === "—";

  return (
    <div className="grid grid-cols-[minmax(110px,42%)_1fr] gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}:</span>
      <span
        className={`${styles.valueText} ${empty ? "text-slate-400" : "text-slate-800"} ${
          mono ? "font-mono text-xs" : ""
        } ${uppercase ? "font-bold uppercase tracking-wide" : ""}`}
      >
        {empty ? "—" : value}
      </span>
    </div>
  );
}

function StarRating({ value }: { value: number }) {
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            size={16}
            className={
              i <= rounded
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200"
            }
          />
        ))}
      </div>
      <span className="ml-1 text-sm font-bold text-slate-700">{value.toFixed(1)}</span>
    </div>
  );
}

function RatingBlock({
  title,
  rating,
  comment,
}: {
  title: string;
  rating: number | null;
  comment?: string | null;
}) {
  const hasRating = rating !== null && rating > 0;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{title}</p>
        {hasRating ? (
          <StarRating value={rating} />
        ) : (
          <span className="text-xs font-medium text-slate-400">Sin calificación</span>
        )}
      </div>
      <p
        className={`mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere] ${
          comment ? "text-slate-700" : "text-slate-400"
        }`}
      >
        {comment || "Sin comentarios"}
      </p>
    </div>
  );
}

function getNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getBookingPoint(booking: BookingRecord, kind: "pickup" | "drop") {
  const latCandidates =
    kind === "pickup"
      ? [booking.pickup_lat, booking.pickupLocation?.lat, booking.pickup_location?.lat, booking.origin_lat]
      : [
          booking.drop_lat,
          booking.dropLocation?.lat,
          booking.drop_location?.lat,
          booking.destination_location?.lat,
          booking.destination_lat,
        ];
  const lngCandidates =
    kind === "pickup"
      ? [booking.pickup_lng, booking.pickupLocation?.lng, booking.pickup_location?.lng, booking.origin_lng]
      : [
          booking.drop_lng,
          booking.dropLocation?.lng,
          booking.drop_location?.lng,
          booking.destination_location?.lng,
          booking.destination_lng,
        ];

  for (const latCandidate of latCandidates) {
    const lat = getNumberValue(latCandidate);
    if (lat === null) continue;
    for (const lngCandidate of lngCandidates) {
      const lng = getNumberValue(lngCandidate);
      if (lng !== null) return { lat, lng };
    }
  }
  return null;
}

function MapPreview({ booking }: { booking: BookingRecord }) {
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const pickup = getBookingPoint(booking, "pickup");
  const drop = getBookingPoint(booking, "drop");
  const origin = pickup ? `${pickup.lat},${pickup.lng}` : booking.pickup_address || "";
  const destination = drop ? `${drop.lat},${drop.lng}` : booking.drop_address || "";
  const canRenderGoogleMap = Boolean(mapsKey && origin && destination);

  const mapSrc = canRenderGoogleMap
    ? `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
        mapsKey || ""
      )}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(
        destination
      )}&mode=driving&language=es&region=CO`
    : "";

  return (
    <section className={styles.mapShell}>
      <div className="relative h-64 bg-slate-100 md:h-72">
        {canRenderGoogleMap ? (
          <iframe
            title="Mapa del recorrido"
            src={mapSrc}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-full w-full border-0"
          />
        ) : (
          <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(135deg,#eff6ff_0%,#f8fafc_45%,#ecfeff_100%)]">
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(90deg,rgba(148,163,184,.25)_1px,transparent_1px),linear-gradient(rgba(148,163,184,.25)_1px,transparent_1px)] [background-size:42px_42px]" />
            <div className="absolute left-[12%] top-[42%] h-4 w-4 rounded-full bg-blue-600 shadow-[0_0_0_8px_rgba(37,99,235,.16)]" />
            <div className="absolute right-[14%] top-[50%] h-4 w-4 rounded-full bg-blue-600 shadow-[0_0_0_8px_rgba(37,99,235,.16)]" />
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1000 320" preserveAspectRatio="none">
              <path
                d="M120 145 C210 120 220 195 330 170 S450 105 540 155 670 205 790 160 860 165 900 190"
                fill="none"
                stroke="#2563eb"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="8"
              />
            </svg>
            <div className="absolute left-6 top-5 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-blue-700 shadow-sm">
              Vista previa del recorrido
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 bg-white p-4 md:grid-cols-[1fr_auto_1fr_auto] md:items-center">
        <RoutePoint label="Origen" value={booking.pickup_address} />
        <span className="hidden text-2xl text-slate-400 md:block">→</span>
        <RoutePoint label="Destino" value={booking.drop_address} />
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
          <MapMetric label="Distancia" value={booking.distance ? `${booking.distance} km` : "—"} />
          <MapMetric label="Duración" value={booking.duration ? `${booking.duration} min` : "—"} />
        </div>
      </div>
    </section>
  );
}

function RoutePoint({ label, value }: { label: string; value?: React.ReactNode | null }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className={styles.routeIcon}>
        <Navigation size={18} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase tracking-wide text-blue-700">{label}</p>
        <p className="mt-1 break-words text-sm font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
          {display(value)}
        </p>
      </div>
    </div>
  );
}

function MapMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-base font-black text-slate-900 [overflow-wrap:anywhere]">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}
