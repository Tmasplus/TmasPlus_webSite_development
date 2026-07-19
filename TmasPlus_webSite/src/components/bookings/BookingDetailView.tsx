import {
  CalendarDays,
  CarFront,
  CircleDollarSign,
  Clock3,
  History,
  MessageSquareText,
  Navigation,
  Route,
  Star,
  UserRound,
} from "lucide-react";
import {
  serviceTotal,
  type BookingRecord,
  type ServiceDataSnapshot,
} from "@/services/bookings.service";

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

        <ServiceSnapshotsSection snapshots={booking.service_data_snapshots} />
      </div>
    </main>
  );
}

const SNAPSHOT_STAGE_ORDER: Record<string, number> = {
  created: 0,
  arrival_pickup: 1,
  started: 2,
  arrival_destination: 3,
  completed: 4,
  paid: 5,
  cancelled: 6,
};

const SNAPSHOT_STAGE_LABELS: Record<string, string> = {
  created: "Creado",
  arrival_pickup: "Llegada al origen",
  started: "Viaje iniciado",
  arrival_destination: "Llegada al destino",
  completed: "Completado",
  paid: "Pagado",
  cancelled: "Cancelado",
};

const SNAPSHOT_STAGE_DOT: Record<string, string> = {
  created: "bg-sky-500",
  arrival_pickup: "bg-indigo-500",
  started: "bg-blue-600",
  arrival_destination: "bg-violet-500",
  completed: "bg-emerald-500",
  paid: "bg-emerald-600",
  cancelled: "bg-rose-500",
};

// Etiquetas legibles para las claves conocidas de raw_data (segun el stage).
const SNAPSHOT_RAW_LABELS: Record<string, string> = {
  category: "Categoría",
  estimated_price: "Precio estimado",
  final_price: "Precio final",
  driver_arrived_time: "Hora de llegada del conductor",
  trip_end_time: "Hora de fin del viaje",
  otp_verified: "OTP verificado",
  payment_mode: "Forma de pago",
  cancelled_by: "Cancelado por",
  reason: "Motivo",
  status_from: "Estado anterior",
  status_to: "Estado nuevo",
};

function humanizeKey(key: string) {
  return SNAPSHOT_RAW_LABELS[key] || key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function looksLikeMoneyKey(key: string) {
  return /price|amount|fare|cost|total|fee/i.test(key);
}

function looksLikeDateKey(key: string) {
  return /time|date|_at$/i.test(key);
}

// Un valor de raw_data se considera "vacío" (y se oculta) cuando es null,
// undefined o cadena vacía. false y 0 son valores válidos que sí se muestran.
function isEmptyRawValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

function formatRawValue(key: string, value: unknown): React.ReactNode {
  if (isEmptyRawValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") {
    return (
      <span className="font-mono text-xs">{JSON.stringify(value)}</span>
    );
  }
  // status_from / status_to traen estados crudos (ACCEPTED, ARRIVED…); se
  // muestran con la misma etiqueta en español que el badge de la reserva.
  if (key === "status_from" || key === "status_to") {
    return statusLabel(String(value).toUpperCase());
  }
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value))) {
    if (looksLikeMoneyKey(key)) return formatMoney(value as number);
    if (looksLikeDateKey(key)) return formatDate(value as number);
  }
  if (looksLikeDateKey(key) && typeof value === "string") return formatDate(value);
  return String(value);
}

function ServiceSnapshotsSection({ snapshots }: { snapshots?: ServiceDataSnapshot[] }) {
  const list = [...(snapshots || [])].sort((a, b) => {
    const oa = SNAPSHOT_STAGE_ORDER[a.stage] ?? 99;
    const ob = SNAPSHOT_STAGE_ORDER[b.stage] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(a.captured_at || "").localeCompare(String(b.captured_at || ""));
  });

  return (
    <SectionCard title="Historial del servicio" icon={<History size={19} />}>
      {list.length === 0 ? (
        <p className="text-sm text-slate-400">Sin registros de snapshots para este viaje.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-slate-200 pl-6">
          {list.map((snap) => (
            <SnapshotItem key={snap.id} snap={snap} />
          ))}
        </ol>
      )}
    </SectionCard>
  );
}

function SnapshotItem({ snap }: { snap: ServiceDataSnapshot }) {
  const dot = SNAPSHOT_STAGE_DOT[snap.stage] || "bg-slate-400";
  const label = SNAPSHOT_STAGE_LABELS[snap.stage] || snap.stage;

  const metrics: Array<{ label: string; value: React.ReactNode }> = [];
  if (snap.distance_km != null && Number(snap.distance_km) > 0)
    metrics.push({ label: "Distancia", value: `${snap.distance_km} km` });
  if (snap.duration_seconds != null && snap.duration_seconds > 0)
    metrics.push({ label: "Duración", value: `${Math.round(snap.duration_seconds / 60)} min` });
  if (snap.price_calculated != null && Number(snap.price_calculated) > 0)
    metrics.push({ label: "Precio calculado", value: formatMoney(snap.price_calculated) });
  if (snap.location_lat != null && snap.location_lng != null)
    metrics.push({ label: "Ubicación", value: `${snap.location_lat}, ${snap.location_lng}` });

  // raw_data es acumulativo entre etapas, así que se ocultan las claves sin
  // valor para no llenar cada evento de campos "—" que no aplican al stage.
  const rawEntries = snap.raw_data
    ? Object.entries(snap.raw_data).filter(([, v]) => !isEmptyRawValue(v))
    : [];

  return (
    <li className="relative">
      <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${dot}`} />
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-black uppercase tracking-wide text-[#082f49]">{label}</p>
          <span className="text-xs font-medium text-slate-500">{formatDate(snap.captured_at)}</span>
        </div>

        {metrics.length > 0 && (
          <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
            {metrics.map((m) => (
              <InfoRow key={m.label} label={m.label} value={m.value} />
            ))}
          </div>
        )}

        {rawEntries.length > 0 && (
          <div className="mt-3 border-t border-slate-200/70 pt-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-400">Datos del evento</p>
            <div className="grid gap-x-6 sm:grid-cols-2">
              {rawEntries.map(([k, v]) => (
                <InfoRow key={k} label={humanizeKey(k)} value={formatRawValue(k, v)} />
              ))}
            </div>
          </div>
        )}
      </div>
    </li>
  );
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
