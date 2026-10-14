import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CarFront,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  CreditCard,
  History,
  Mail,
  MapPinned,
  MessageSquareText,
  MessagesSquare,
  Navigation,
  Phone,
  Route,
  Star,
  UserRound,
  Zap,
} from "lucide-react";
import type { BookingRecord, ServiceSnapshot } from "@/services/bookings.service";
import {
  fetchBookingDetailExtras,
  type BookingDetailExtras,
  type PersonInfo,
  type ReservaRow,
} from "@/services/bookingDetail.service";
import { useCarTypeCatalog } from "@/hooks/useCarTypeCatalog";
import { useSuggestedRoute } from "@/hooks/useSuggestedRoute";
import { categoryNameForValue } from "@/utils/carTypeCatalog";
import {
  MARGEN_CLIENTE,
  maxFromMinConductor,
  isBookingCancelled,
  isCompletedStatus,
  positiveNumber,
  resolveFinalFare,
  resolveQuote,
  type FareQuote,
} from "@/utils/bookingFare";
import { filterTripTracking, pathDistanceKm, toEpochMs, type LatLng } from "@/utils/tripTracking";
import { BookingRouteMap, type RouteMode } from "./BookingRouteMap";
import { BookingChatPanel } from "./BookingChatPanel";

const styles = {
  header: "flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-6 py-5",
  headerIcon: "hidden h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 sm:grid",
  badge: "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide",
  body: "bg-slate-50/70 p-4 sm:p-6",
  section: "rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.05)]",
  sectionIcon: "grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-600",
  label: "text-xs font-semibold uppercase tracking-wide text-slate-400",
  valueText: "min-w-0 break-words [overflow-wrap:anywhere] font-medium",
};

const ACTIVE_STATUSES = ["ACCEPTED", "ARRIVED", "ARRIVED_PICKUP", "STARTED", "ARRIVED_DESTINATION", "PICKED_UP"];
const EXTRAS_REFRESH_MS = 15000;

function formatDate(value?: string | number | null) {
  const ms = toEpochMs(value);
  if (ms == null) return "—";
  return new Date(ms).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
}

function formatTime(value?: string | number | null) {
  const ms = toEpochMs(value);
  if (ms == null) return "—";
  return new Date(ms).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function formatMoney(v: unknown) {
  const num = positiveNumber(v);
  if (num == null) return "—";
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(num);
}

function formatKm(v: unknown) {
  const n = positiveNumber(v);
  return n == null ? "—" : `${n.toFixed(n < 10 ? 2 : 1)} km`;
}

function formatMinutes(v: unknown) {
  const n = positiveNumber(v);
  if (n == null) return "—";
  const total = Math.round(n);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)} h ${total % 60} min`;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    CANCELLED: "Cancelada",
    COMPLETED: "Completada",
    COMPLETE: "Completada",
    PENDING: "Pendiente",
    ACCEPTED: "Aceptada",
    STARTED: "En curso",
    ARRIVED: "En punto",
    ARRIVED_PICKUP: "En punto de recogida",
    ARRIVED_DESTINATION: "En destino",
    PAID: "Pagada",
    PICKED_UP: "En viaje",
    CONFIRMED: "Confirmada",
  };
  return labels[status] || status || "—";
}

function statusClassName(status: string) {
  if (["COMPLETED", "COMPLETE", "PAID"].includes(status)) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "CANCELLED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (["ACCEPTED", "CONFIRMED"].includes(status)) return "bg-sky-50 text-sky-700 border-sky-200";
  if (ACTIVE_STATUSES.includes(status)) return "bg-indigo-50 text-indigo-700 border-indigo-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

function paymentLabel(mode?: string | null) {
  const labels: Record<string, string> = {
    cash: "Efectivo",
    efectivo: "Efectivo",
    wallet: "Billetera",
    card: "Tarjeta",
    tarjeta: "Tarjeta",
    corp: "Corporativo",
    corporate: "Corporativo",
    corporativo: "Corporativo",
    nequi: "Nequi",
    daviplata: "Daviplata",
    transfer: "Transferencia",
  };
  const key = String(mode || "").trim().toLowerCase();
  if (!key) return "—";
  return labels[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

function isScheduled(booking: BookingRecord) {
  return String(booking.booking_type || "").toUpperCase() === "SCHEDULED";
}

export function BookingDetailHeader({ booking, actions }: { booking: BookingRecord; actions?: React.ReactNode }) {
  const { categories: carTypes } = useCarTypeCatalog();
  const status = (booking.status || "").toUpperCase();
  const scheduled = isScheduled(booking);
  const category = categoryNameForValue(carTypes, booking.car_type);

  return (
    <header className={styles.header}>
      <div className="flex min-w-0 items-center gap-4">
        <span className={styles.headerIcon}>
          <CalendarDays size={24} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black tracking-tight text-slate-900">Detalle de Reserva</h2>
            <span className={`${styles.badge} ${statusClassName(status)}`}>{statusLabel(status)}</span>
            <span className={`${styles.badge} border-blue-200 bg-blue-50 text-blue-700`}>
              {scheduled ? <CalendarDays size={12} /> : <Zap size={12} />}
              {scheduled ? "Programada" : "Inmediata"}
            </span>
            {category && category !== "—" && (
              <span className={`${styles.badge} border-slate-200 bg-slate-50 text-slate-600`}>{category}</span>
            )}
          </div>
          <p className="mt-1 break-words text-sm text-slate-500 [overflow-wrap:anywhere]">
            Ref · <span className="font-mono font-semibold text-slate-700">{booking.reference || booking.id}</span>
            <span className="mx-2 text-slate-300">|</span>
            Creada {formatDate(booking.created_at)}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">{actions}</div>
    </header>
  );
}

function useBookingDetailExtras(booking: BookingRecord) {
  const [data, setData] = useState<BookingDetailExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const status = (booking.status || "").toUpperCase();
  const active = ACTIVE_STATUSES.includes(status);

  const load = useCallback(
    async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        setData(await fetchBookingDetailExtras(booking));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.id, booking.status, booking.updated_at]
  );

  useEffect(() => {
    let cancelled = false;
    setData((prev) => (prev && prev.reserva?.id === booking.id ? prev : null));
    load(false).catch(() => !cancelled && setLoading(false));
    if (!active) return () => void (cancelled = true);
    const timer = window.setInterval(() => void load(true).catch(() => undefined), EXTRAS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load, active, booking.id]);

  return { data, loading };
}

function getNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getBookingPoint(booking: BookingRecord, kind: "pickup" | "drop"): LatLng | null {
  const lat = getNumberValue(kind === "pickup" ? booking.pickup_lat ?? booking.pickup_location?.lat : booking.drop_lat ?? booking.destination_location?.lat);
  const lng = getNumberValue(kind === "pickup" ? booking.pickup_lng ?? booking.pickup_location?.lng : booking.drop_lng ?? booking.destination_location?.lng);
  return lat != null && lng != null ? { lat, lng } : null;
}

function snapshotAt(snapshots: ServiceSnapshot[], stage: string) {
  return snapshots.find((s) => s.stage === stage)?.captured_at || null;
}

export function BookingDetailBody({ booking, className = "" }: { booking: BookingRecord; className?: string }) {
  const { categories: carTypes } = useCarTypeCatalog();
  const { data, loading } = useBookingDetailExtras(booking);
  const [tab, setTab] = useState<RouteMode | "chat">("suggested");
  const routeMode: RouteMode = tab === "actual" ? "actual" : "suggested";

  const reserva = data?.reserva ?? null;
  const snapshots = useMemo(() => data?.snapshots ?? [], [data?.snapshots]);
  const status = (booking.status || "").toUpperCase();
  const completed = isCompletedStatus(status);
  const cancelled = isBookingCancelled(booking);

  const pickup = useMemo(() => getBookingPoint(booking, "pickup"), [booking]);
  const drop = useMemo(() => getBookingPoint(booking, "drop"), [booking]);
  const suggested = useSuggestedRoute(pickup, drop);

  const tripStartMs =
    toEpochMs(reserva?.viaje_inicio_en) ?? toEpochMs(booking.trip_start_time) ?? toEpochMs(snapshotAt(snapshots, "started"));
  const tripEndMs =
    toEpochMs(reserva?.viaje_fin_en) ??
    toEpochMs(booking.trip_end_time) ??
    toEpochMs(snapshotAt(snapshots, "completed")) ??
    toEpochMs(snapshotAt(snapshots, "arrival_destination"));

  const actualPoints = useMemo(
    () => (tripStartMs ? filterTripTracking(data?.tracking ?? [], tripStartMs, tripEndMs) : []),
    [data?.tracking, tripStartMs, tripEndMs]
  );
  const actualPath = useMemo(() => actualPoints.map(({ lat, lng }) => ({ lat, lng })), [actualPoints]);
  // Vehículo en vivo: último punto GPS guardado, solo mientras el servicio está activo.
  const liveVehicle = useMemo<LatLng | null>(() => {
    if (!ACTIVE_STATUSES.includes(status)) return null;
    const last = data?.tracking?.[data.tracking.length - 1];
    return last ? { lat: last.lat, lng: last.lng } : null;
  }, [status, data?.tracking]);
  const gpsKm = actualPath.length > 1 ? pathDistanceKm(actualPath) : null;
  const realDurationMin = tripStartMs && tripEndMs && tripEndMs > tripStartMs ? (tripEndMs - tripStartMs) / 60000 : null;

  const created = snapshots.find((s) => s.stage === "created");
  // distancia_km / duracion_seg en core no cambian al cerrar el viaje: son los
  // de la cotización. Lo real sale del GPS y de viaje_inicio_en → viaje_fin_en.
  const quotedKm = created?.distance ?? getNumberValue(booking.distance);
  const quotedMin = created?.duration ? created.duration / 60 : getNumberValue(booking.duration);

  const quote = useMemo(() => resolveQuote(booking, reserva, snapshots), [booking, reserva, snapshots]);
  const finalFare = resolveFinalFare(booking, reserva);

  return (
    <main className={`${styles.body} ${className}`}>
      <div className="space-y-5">
        {data?.errors.length ? (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>Algunos datos no se pudieron cargar: {data.errors.join(" · ")}</span>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Cotización inicial"
            value={quote.min || quote.max ? <QuoteRange quote={quote} /> : "—"}
            hint={quote.min ? `Se cobraría el mínimo: ${formatMoney(quote.min)}` : undefined}
          />
          <Kpi
            label="Valor cobrado"
            value={finalFare ? formatMoney(finalFare) : cancelled ? "Cancelada" : "Pendiente"}
            hint={
              finalFare
                ? `Mínimo del rango final ${formatRange(finalFare, maxFromMinConductor(finalFare))}`
                : "Se calcula al finalizar el viaje"
            }
            accent={!!finalFare}
          />
          <Kpi
            label="Distancia"
            value={formatKm(gpsKm ?? quotedKm)}
            hint={gpsKm ? `Real (GPS) · cotizada ${formatKm(quotedKm)}` : "Cotizada (ruta sugerida)"}
          />
          <Kpi
            label="Duración"
            value={formatMinutes(realDurationMin ?? quotedMin)}
            hint={realDurationMin ? `Real · cotizada ${formatMinutes(quotedMin)}` : "Cotizada (ruta sugerida)"}
          />
        </div>

        <section className={`${styles.section} overflow-hidden !p-0`}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className={styles.sectionIcon}>
                {tab === "chat" ? <MessagesSquare size={18} /> : <MapPinned size={18} />}
              </span>
              <div>
                <h3 className="text-base font-bold text-[#082f49]">{tab === "chat" ? "Chat del servicio" : "Recorrido"}</h3>
                <p className="text-xs text-slate-500">
                  {tab === "chat"
                    ? "Conversación entre cliente y conductor, con fecha y hora de cada mensaje"
                    : tab === "suggested"
                    ? "Ruta calculada entre origen y destino"
                    : "Trayecto GPS del conductor entre inicio y fin del viaje"}
                </p>
              </div>
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              {(
                [
                  ["suggested", "Ruta sugerida"],
                  ["actual", "Ruta realizada"],
                  ["chat", "Chat"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    tab === value ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab === "chat" ? (
            <BookingChatPanel
              bookingId={booking.id}
              live={ACTIVE_STATUSES.includes(status)}
              customerName={data?.customer?.name ?? booking.customer_name}
              driverName={data?.driver?.name ?? booking.driver_name}
            />
          ) : (
          <>
          <div className="relative h-72 bg-slate-100 md:h-80">
            <BookingRouteMap
              mode={routeMode}
              pickup={pickup}
              drop={drop}
              suggestedPath={suggested.route?.path ?? []}
              actualPath={actualPath}
              vehicle={liveVehicle}
            />
            {routeMode === "actual" && !loading && actualPath.length < 2 && (
              <MapOverlay>
                {!tripStartMs
                  ? "El viaje aún no ha iniciado: no hay ruta realizada."
                  : "No hay suficientes puntos GPS registrados para este viaje."}
              </MapOverlay>
            )}
            {routeMode === "suggested" && suggested.loading && <MapOverlay>Calculando ruta sugerida…</MapOverlay>}
          </div>

          <div className="grid gap-4 border-t border-slate-100 p-5 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
            <RoutePoint label="Origen" color="bg-sky-600" value={booking.pickup_address} />
            <RoutePoint label="Destino" color="bg-rose-600" value={booking.drop_address} />
            {routeMode === "suggested" ? (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-center">
                <MapMetric label="Distancia" value={formatKm(suggested.route?.distanceKm ?? quotedKm)} />
                <MapMetric label="Duración" value={formatMinutes(suggested.route?.durationMin ?? quotedMin)} />
                <p className="col-span-2 text-[11px] text-slate-400">
                  {suggested.route?.source === "google"
                    ? "Google Directions"
                    : suggested.route?.source === "osrm"
                    ? "OpenStreetMap (OSRM)"
                    : suggested.route
                    ? "Línea directa"
                    : "—"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3 text-center">
                <MapMetric label="Distancia GPS" value={formatKm(gpsKm)} />
                <MapMetric label="Duración del viaje" value={formatMinutes(realDurationMin)} />
                <MapMetric label="Inicio" value={formatTime(tripStartMs)} />
                <MapMetric label="Fin" value={formatTime(tripEndMs)} />
                <p className="col-span-4 text-[11px] text-slate-500">
                  {actualPath.length} puntos GPS · {data?.tracking.length ?? 0} registrados en total
                </p>
              </div>
            )}
          </div>
          </>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <FareSection
            className="lg:col-span-2"
            quote={quote}
            finalFare={finalFare}
            completed={completed}
            cancelled={cancelled}
            booking={booking}
            reserva={reserva}
          />
          <SectionCard title="Pago" icon={<CreditCard size={18} />}>
            <InfoRow label="Forma de pago" value={paymentLabel(booking.payment_mode ?? reserva?.modo_pago)} />
            <InfoRow label="Prepago" value={reserva ? (reserva.prepago ? "Sí" : "No") : null} />
            <InfoRow label="Cargo conveniencia" value={formatMoney(booking.convenience_fees ?? reserva?.convenience_fees)} />
            <InfoRow label="Descuento" value={formatMoney(booking.discount ?? reserva?.descuento)} />
            <InfoRow
              label="OTP"
              value={
                booking.otp ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-emerald-800">
                      {booking.otp}
                    </span>
                    {reserva?.otp_verificado && <span className="text-xs text-emerald-700">Verificado</span>}
                  </span>
                ) : null
              }
            />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <PersonCard
            title="Cliente"
            icon={<UserRound size={18} />}
            person={data?.customer ?? null}
            fallbackName={booking.customer_name}
            fallbackEmail={booking.customer_email}
            fallbackPhone={booking.customer_contact}
            footer={
              reserva?.pasajero_nombre ? (
                <InfoRow
                  label="Pasajero"
                  value={[reserva.pasajero_nombre, reserva.pasajero_telefono].filter(Boolean).join(" · ")}
                />
              ) : null
            }
          />
          <PersonCard
            title="Conductor"
            icon={<UserRound size={18} />}
            person={data?.driver ?? null}
            fallbackName={booking.driver_name}
            fallbackPhone={booking.driver_contact}
            emptyText="Sin conductor asignado"
            hasAssignee={!!(reserva?.id_conductor ?? booking.driver_id ?? booking.driver)}
          />
          <SectionCard title="Vehículo" icon={<CarFront size={18} />}>
            <InfoRow label="Categoría" value={categoryNameForValue(carTypes, booking.car_type)} />
            <InfoRow
              label="Placa"
              value={
                data?.vehicle?.plate || booking.plate_number ? (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 font-mono text-xs font-bold uppercase tracking-widest text-amber-800">
                    {data?.vehicle?.plate || booking.plate_number}
                  </span>
                ) : null
              }
            />
            <InfoRow label="Marca" value={data?.vehicle?.make ?? booking.vehicle_make} />
            <InfoRow label="Modelo" value={data?.vehicle?.model ?? booking.car_model} />
            <InfoRow label="Color" value={data?.vehicle?.color ?? booking.vehicle_color} />
            <InfoRow label="Año" value={data?.vehicle?.year} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          <SectionCard title="Línea de tiempo" icon={<Clock3 size={18} />} className="lg:col-span-3">
            <Timeline booking={booking} reserva={reserva} snapshots={snapshots} />
          </SectionCard>

          <div className="space-y-5 lg:col-span-2">
            <SectionCard title="Calificaciones" icon={<Star size={18} />}>
              <div className="space-y-3">
                <RatingBlock
                  title="Cliente → Conductor"
                  rating={getNumberValue(booking.driver_rating) ?? getNumberValue(booking.rating)}
                  comment={booking.review}
                />
                <RatingBlock
                  title="Conductor → Cliente"
                  rating={getNumberValue(booking.customer_rating)}
                  comment={booking.customer_review}
                />
              </div>
            </SectionCard>

            <SectionCard title="Observaciones" icon={<MessageSquareText size={18} />}>
              <p
                className={`whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere] ${
                  booking.observations ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {booking.observations || "Sin observaciones"}
              </p>
            </SectionCard>
          </div>
        </div>

        <ServiceSnapshotsSection snapshots={snapshots} loading={loading && !data} />
      </div>
    </main>
  );
}

function QuoteRange({ quote }: { quote: FareQuote }) {
  if (quote.min && quote.max && quote.min !== quote.max) {
    return (
      <span>
        {formatMoney(quote.min)} <span className="text-slate-300">–</span> {formatMoney(quote.max)}
      </span>
    );
  }
  return <span>{formatMoney(quote.min ?? quote.max)}</span>;
}

function FareSection({
  quote,
  finalFare,
  completed,
  cancelled,
  booking,
  reserva,
  className,
}: {
  quote: FareQuote;
  finalFare: number | null;
  completed: boolean;
  cancelled: boolean;
  booking: BookingRecord;
  reserva: ReservaRow | null;
  className?: string;
}) {
  const finalMax = finalFare ? maxFromMinConductor(finalFare) : null;
  const diff = finalFare && quote.min ? finalFare - quote.min : null;
  const diffPct = diff != null && quote.min ? Math.round((diff / quote.min) * 100) : null;

  return (
    <SectionCard title="Tarifa" icon={<CircleDollarSign size={18} />} className={className}>
      <p className="-mt-1 mb-4 text-xs leading-relaxed text-slate-500">
        El rango se calcula sobre la tarifa del conductor: mínimo = tarifa calculada, máximo = mínimo + {Math.round(MARGEN_CLIENTE * 100)}%
        (redondeado a la centena). Siempre se cobra el mínimo.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Cotización · al calcular la ruta</p>
          <div className="mt-3 space-y-2">
            <FareLine label="Rango" value={formatRange(quote.min, quote.max)} />
            <FareLine label="Valor a cobrar (mínimo)" value={formatMoney(quote.min)} strong />
          </div>
          {quote.source === null && (
            <p className="mt-3 text-[11px] text-slate-500">La cotización no quedó registrada para este viaje.</p>
          )}
        </div>

        <div
          className={`rounded-xl border p-4 ${
            finalFare ? "border-emerald-100 bg-emerald-50/50" : "border-slate-200 bg-slate-50/70"
          }`}
        >
          <p className={`text-xs font-bold uppercase tracking-wide ${finalFare ? "text-emerald-700" : "text-slate-500"}`}>
            Cierre · al finalizar el viaje
          </p>
          {finalFare ? (
            <>
              <div className="mt-3 space-y-2">
                <FareLine label="Rango" value={formatRange(finalFare, finalMax)} />
                <FareLine label="Valor cobrado (mínimo)" value={formatMoney(finalFare)} strong />
                <FareLine
                  label="Vs. cotización"
                  value={
                    diff == null
                      ? "—"
                      : diff === 0
                      ? "Sin cambio"
                      : `${diff > 0 ? "+" : "−"}${formatMoney(Math.abs(diff))} (${diff > 0 ? "+" : ""}${diffPct}%)`
                  }
                />
              </div>
              {diff != null && diff > 0 && (
                <p className="mt-3 text-[11px] text-slate-500">Recalculado con la distancia y el tiempo reales del viaje.</p>
              )}
              {diff === 0 && (
                <p className="mt-3 text-[11px] text-slate-500">El recálculo no superó la cotización: se cobra el mínimo cotizado.</p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              {cancelled
                ? "La reserva fue cancelada; no hubo cobro final."
                : completed
                ? "No se encontró el valor final."
                : "El valor final se recalcula con la distancia y el tiempo reales cuando el conductor finaliza el viaje. Nunca baja del mínimo cotizado."}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-x-6 border-t border-slate-100 pt-3 sm:grid-cols-2">
        <InfoRow label="Ganancia conductor" value={formatMoney(booking.driver_share ?? reserva?.ganancia_conductor)} />
        <InfoRow label="Costo total" value={formatMoney(booking.total_cost ?? reserva?.costo_total)} />
      </div>
    </SectionCard>
  );
}

function formatRange(min: number | null, max: number | null) {
  if (!min && !max) return "—";
  if (!min || !max || min === max) return formatMoney(min ?? max);
  return `${formatMoney(min)} – ${formatMoney(max)}`;
}

function FareLine({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-500">
        {label}
        {note && <span className="ml-1 text-[11px] text-slate-400">({note})</span>}
      </span>
      <span className={`${strong ? "text-lg font-black text-slate-900" : "font-bold text-slate-800"} tabular-nums`}>{value}</span>
    </div>
  );
}

type TimelineEvent = { key: string; label: string; at: number; tone: string; detail?: string };

function Timeline({
  booking,
  reserva,
  snapshots,
}: {
  booking: BookingRecord;
  reserva: ReservaRow | null;
  snapshots: ServiceSnapshot[];
}) {
  const candidates: Array<Omit<TimelineEvent, "at"> & { at: unknown }> = [
    { key: "created", label: "Reserva creada", at: reserva?.creado_en ?? booking.created_at, tone: "bg-sky-500" },
    {
      key: "accepted",
      label: "Conductor asignado",
      at: snapshotAt(snapshots, "accepted"),
      tone: "bg-sky-600",
    },
    {
      key: "arrived",
      label: "Conductor en el origen",
      at: reserva?.conductor_llego_en ?? snapshotAt(snapshots, "arrival_pickup"),
      tone: "bg-indigo-500",
    },
    { key: "otp", label: "OTP verificado", at: reserva?.otp_verificado_en, tone: "bg-indigo-400" },
    {
      key: "started",
      label: "Viaje iniciado",
      at: reserva?.viaje_inicio_en ?? booking.trip_start_time ?? snapshotAt(snapshots, "started"),
      tone: "bg-blue-600",
    },
    { key: "destination", label: "Llegada al destino", at: snapshotAt(snapshots, "arrival_destination"), tone: "bg-violet-500" },
    {
      key: "completed",
      label: "Viaje finalizado",
      at: reserva?.viaje_fin_en ?? booking.trip_end_time ?? snapshotAt(snapshots, "completed"),
      tone: "bg-emerald-500",
    },
    { key: "paid", label: "Pagado", at: snapshotAt(snapshots, "paid"), tone: "bg-emerald-600" },
    {
      key: "cancelled",
      label: "Cancelada",
      at: booking.cancelled_at ?? reserva?.cancelado_en,
      tone: "bg-rose-500",
      detail: [booking.cancelled_by ?? reserva?.cancelado_por, booking.reason ?? reserva?.motivo_cancelacion]
        .filter(Boolean)
        .join(" · "),
    },
  ];

  const events: TimelineEvent[] = candidates
    .map((e) => ({ ...e, at: toEpochMs(e.at) ?? NaN }))
    .filter((e) => Number.isFinite(e.at))
    .sort((a, b) => a.at - b.at);

  const scheduledFor = isScheduled(booking) ? booking.booking_date : null;

  return (
    <div>
      {scheduledFor && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-2.5 text-sm">
          <span className="font-semibold text-blue-800">Servicio programado para</span>
          <span className="font-bold text-slate-800">{formatDate(scheduledFor)}</span>
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-sm text-slate-400">Sin eventos registrados.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-5">
          {events.map((e, i) => {
            const prev = events[i - 1];
            const gapMin = prev ? Math.round((e.at - prev.at) / 60000) : null;
            return (
              <li key={e.key} className="relative">
                <span className={`absolute -left-[26px] top-1 h-3 w-3 rounded-full ring-4 ring-white ${e.tone}`} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-sm font-semibold text-slate-800">{e.label}</p>
                  <p className="text-xs tabular-nums text-slate-500">
                    {formatDate(e.at)}
                    {gapMin != null && gapMin > 0 && <span className="ml-2 text-slate-400">+{formatMinutes(gapMin)}</span>}
                  </p>
                </div>
                {e.detail && <p className="mt-0.5 text-xs text-slate-500">{e.detail}</p>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function PersonCard({
  title,
  icon,
  person,
  fallbackName,
  fallbackEmail,
  fallbackPhone,
  footer,
  emptyText,
  hasAssignee = true,
}: {
  title: string;
  icon: React.ReactNode;
  person: PersonInfo | null;
  fallbackName?: string | null;
  fallbackEmail?: string | null;
  fallbackPhone?: string | null;
  footer?: React.ReactNode;
  emptyText?: string;
  hasAssignee?: boolean;
}) {
  const name = person?.name || fallbackName;
  const email = person?.email || fallbackEmail;
  const phone = person?.mobile || fallbackPhone;

  return (
    <SectionCard title={title} icon={icon}>
      {!hasAssignee && !name ? (
        <p className="text-sm text-slate-400">{emptyText || "—"}</p>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-3">
            {person?.photo ? (
              <img src={person.photo} alt={name || title} className="h-12 w-12 rounded-full border border-slate-200 object-cover" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-base font-black text-slate-500">
                {(name || "?").trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="break-words font-bold text-slate-900 [overflow-wrap:anywhere]">{name || "—"}</p>
              {person?.rating != null && person.rating > 0 ? (
                <p className="flex items-center gap-1 text-xs text-slate-500">
                  <Star size={12} className="fill-amber-400 text-amber-400" />
                  {person.rating.toFixed(1)} promedio
                </p>
              ) : (
                <p className="text-xs text-slate-400">Sin calificación promedio</p>
              )}
            </div>
          </div>
          <ContactLine icon={<Phone size={14} />} value={phone} href={phone ? `tel:${phone}` : undefined} />
          <ContactLine icon={<Mail size={14} />} value={email} href={email ? `mailto:${email}` : undefined} />
          {footer && <div className="mt-2 border-t border-slate-100 pt-2">{footer}</div>}
        </>
      )}
    </SectionCard>
  );
}

function ContactLine({ icon, value, href }: { icon: React.ReactNode; value?: string | null; href?: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="text-slate-400">{icon}</span>
      {value ? (
        <a href={href} className="min-w-0 break-words text-slate-700 hover:text-blue-700 [overflow-wrap:anywhere]">
          {value}
        </a>
      ) : (
        <span className="text-slate-400">—</span>
      )}
    </div>
  );
}

const SNAPSHOT_STAGE_ORDER: Record<string, number> = {
  created: 0,
  accepted: 1,
  arrival_pickup: 2,
  started: 3,
  arrival_destination: 4,
  completed: 5,
  paid: 6,
  cancelled: 7,
};

const SNAPSHOT_STAGE_LABELS: Record<string, string> = {
  created: "Creado",
  accepted: "Aceptado",
  arrival_pickup: "Llegada al origen",
  started: "Viaje iniciado",
  arrival_destination: "Llegada al destino",
  completed: "Completado",
  paid: "Pagado",
  cancelled: "Cancelado",
};

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

function isEmptyRawValue(value: unknown) {
  return value === null || value === undefined || value === "";
}

function formatRawValue(key: string, value: unknown): React.ReactNode {
  if (isEmptyRawValue(value)) return "—";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "object") return <span className="font-mono text-xs">{JSON.stringify(value)}</span>;
  if (key === "status_from" || key === "status_to") return statusLabel(String(value).toUpperCase());
  if (typeof value === "number" || /^-?\d+(\.\d+)?$/.test(String(value))) {
    if (/price|amount|fare|cost|total|fee|share/i.test(key)) return formatMoney(value);
    if (/time|date|_at$/i.test(key)) return formatDate(value as number);
  }
  if (/time|date|_at$/i.test(key) && typeof value === "string") return formatDate(value);
  return String(value);
}

function ServiceSnapshotsSection({ snapshots, loading }: { snapshots: ServiceSnapshot[]; loading: boolean }) {
  const list = [...snapshots].sort((a, b) => {
    const oa = SNAPSHOT_STAGE_ORDER[a.stage] ?? 99;
    const ob = SNAPSHOT_STAGE_ORDER[b.stage] ?? 99;
    if (oa !== ob) return oa - ob;
    return String(a.captured_at || "").localeCompare(String(b.captured_at || ""));
  });

  return (
    <details className={`${styles.section} group`}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          <span className={styles.sectionIcon}>
            <History size={18} />
          </span>
          <span>
            <span className="block text-base font-bold text-[#082f49]">Historial técnico del servicio</span>
            <span className="block text-xs text-slate-500">
              {loading ? "Cargando…" : `${list.length} registro${list.length === 1 ? "" : "s"} capturados por etapa`}
            </span>
          </span>
        </span>
        <ChevronDown size={18} className="text-slate-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="mt-4">
        {list.length === 0 ? (
          <p className="text-sm text-slate-400">Sin registros de snapshots para este viaje.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-slate-200 pl-6">
            {list.map((snap) => (
              <SnapshotItem key={snap.id} snap={snap} />
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

function SnapshotItem({ snap }: { snap: ServiceSnapshot }) {
  const label = SNAPSHOT_STAGE_LABELS[snap.stage] || snap.stage;
  const metrics: Array<{ label: string; value: React.ReactNode }> = [];
  if (snap.distance) metrics.push({ label: "Distancia", value: formatKm(snap.distance) });
  if (snap.duration) metrics.push({ label: "Duración", value: formatMinutes(snap.duration / 60) });
  if (snap.calculated_price) metrics.push({ label: "Precio calculado", value: formatMoney(snap.calculated_price) });
  if (snap.latitude != null && snap.longitude != null)
    metrics.push({ label: "Ubicación", value: `${snap.latitude}, ${snap.longitude}` });

  const rawEntries = Object.entries(snap.data || {}).filter(([, v]) => !isEmptyRawValue(v));

  return (
    <li className="relative">
      <span className="absolute -left-[30px] top-1.5 h-3 w-3 rounded-full bg-blue-500 ring-4 ring-white" />
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold uppercase tracking-wide text-[#082f49]">{label}</p>
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

function Kpi({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-2xl border p-4 shadow-[0_10px_30px_rgba(15,23,42,0.04)] ${
        accent ? "border-emerald-100 bg-gradient-to-br from-emerald-50 to-white" : "border-slate-200/80 bg-white"
      }`}
    >
      <p className={styles.label}>{label}</p>
      <p className="mt-1.5 break-words text-lg font-black tracking-tight text-slate-900 tabular-nums [overflow-wrap:anywhere] xl:text-xl">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function MapOverlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-[500] flex justify-center px-4">
      <span className="rounded-full border border-slate-200 bg-white/95 px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm">
        {children}
      </span>
    </div>
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

function InfoRow({ label, value }: { label: string; value?: React.ReactNode | null }) {
  const empty = value === null || value === undefined || value === "" || value === "—";
  return (
    <div className="grid grid-cols-[minmax(110px,42%)_1fr] gap-3 py-1.5 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`${styles.valueText} ${empty ? "text-slate-400" : "text-slate-800"}`}>{empty ? "—" : value}</span>
    </div>
  );
}

function RatingBlock({ title, rating, comment }: { title: string; rating: number | null; comment?: string | null }) {
  const hasRating = rating !== null && rating > 0;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-700">{title}</p>
        {hasRating ? (
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                size={14}
                className={i <= Math.round(rating!) ? "fill-amber-400 text-amber-400" : "fill-slate-200 text-slate-200"}
              />
            ))}
            <span className="ml-1 text-xs font-bold text-slate-700">{rating!.toFixed(1)}</span>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Sin calificación</span>
        )}
      </div>
      <p className={`mt-1.5 whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere] ${comment ? "text-slate-700" : "text-slate-400"}`}>
        {comment || "Sin comentarios"}
      </p>
    </div>
  );
}

function RoutePoint({ label, value, color }: { label: string; value?: React.ReactNode | null; color: string }) {
  return (
    <div className="flex min-w-0 gap-3">
      <span className={`mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-white ${color}`}>
        {label === "Origen" ? <Navigation size={14} /> : <Route size={14} />}
      </span>
      <div className="min-w-0">
        <p className={styles.label}>{label}</p>
        <p className="mt-0.5 break-words text-sm font-medium leading-relaxed text-slate-700 [overflow-wrap:anywhere]">
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

function MapMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="break-words text-sm font-black text-slate-900 tabular-nums [overflow-wrap:anywhere]">{value}</p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
