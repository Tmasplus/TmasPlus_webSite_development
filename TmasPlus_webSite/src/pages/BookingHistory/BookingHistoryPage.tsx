import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import { BookingModal } from "./BookingModal";
import {
  BookingsService,
  serviceTotal,
  type AssignableDriver,
  type BookingRecord,
} from "@/services/bookings.service";
import { supabase } from "@/config/supabase";
import { useCarTypeCatalog } from "@/hooks/useCarTypeCatalog";
import type { BookingListFilters } from "@/services/coreBookings.service";
import { carTypeValuesForCategory, categoryNameForValue } from "@/utils/carTypeCatalog";
import { SearchableSelect, type SearchableOption } from "@/components/ui/SearchableSelect";
import { maxFromMinConductor, resolveFinalFare, resolveQuote } from "@/utils/bookingFare";
import { toEpochMs } from "@/utils/tripTracking";
import { ChevronLeft, ChevronRight, Eye } from "lucide-react";

const PAGE_SIZE = 10;

/** Filtros que agrupan varios estados (los usan también los indicadores del inicio). */
const STATUS_GROUPS: Record<string, string[]> = {
  IN_PROGRESS: ["STARTED", "ARRIVED_DESTINATION"],
  DONE: ["COMPLETED", "PAID"],
};

const STATUSES = [
  "TODOS",
  "IN_PROGRESS",
  "DONE",
  "PENDING",
  "ACCEPTED",
  "ARRIVED_PICKUP",
  "STARTED",
  "ARRIVED_DESTINATION",
  "COMPLETED",
  "PAID",
  "CANCELLED",
];

const TERMINAL_STATUSES = ["COMPLETED", "PAID", "CANCELLED"];

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString();
}

function formatMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const num = typeof v === "string" ? Number(v) : v;
  if (isNaN(num)) return String(v);
  if (num === 0) return "$0";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(num);
}

function statusBadgeClass(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED" || s === "PAID")
    return "bg-green-100 text-green-800";
  if (s === "CANCELLED")
    return "bg-rose-100 text-rose-800";
  if (s === "NEW" || s === "PENDING")
    return "bg-yellow-100 text-yellow-800";
  if (s === "ACCEPTED" || s === "STARTED" || s === "ARRIVED_PICKUP" || s === "ARRIVED_DESTINATION")
    return "bg-sky-100 text-sky-800";
  return "bg-slate-200 text-slate-700";
}

const STATUS_LABELS: Record<string, string> = {
  TODOS: "Todos los estados",
  IN_PROGRESS: "En curso (pasajero a bordo)",
  DONE: "Completadas y pagadas",
  NEW: "Nueva",
  PENDING: "Pendiente",
  ACCEPTED: "Aceptada",
  ARRIVED_PICKUP: "En recogida",
  STARTED: "En curso",
  ARRIVED_DESTINATION: "En destino",
  COMPLETED: "Completada",
  COMPLETE: "Completada",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

const statusLabel = (status?: string | null) => {
  const s = (status || "").toUpperCase();
  return STATUS_LABELS[s] || status || "—";
};

function DateCell({ iso }: { iso?: string | null }) {
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(+d)) return <span className="text-slate-400">—</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="text-slate-800">{d.toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}</div>
      <div className="text-xs text-slate-500">{d.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>
  );
}

/** Valor cobrado (mínimo) arriba y rango mínimo–máximo debajo. */
function FareCell({ min, max, empty }: { min: number | null; max: number | null; empty: string }) {
  if (!min) return <span className="text-xs text-slate-400">{empty}</span>;
  return (
    <div className="whitespace-nowrap">
      <div className="font-semibold text-slate-900 tabular-nums">{formatMoney(min)}</div>
      {max && max !== min && (
        <div className="text-[11px] text-slate-500 tabular-nums">
          {formatMoney(min)} – {formatMoney(max)}
        </div>
      )}
    </div>
  );
}

/** Fecha de ejecución: cuándo el viaje realmente inició (trip_start_time o, si no, viaje_inicio_en). */
function executionIso(b: BookingRecord): string | null {
  const ms = toEpochMs(b.trip_start_time) ?? toEpochMs(b.trip_started_at);
  return ms ? new Date(ms).toISOString() : null;
}

function tripDurationMin(b: BookingRecord): number | null {
  const start = toEpochMs(b.trip_start_time);
  const end = toEpochMs(b.trip_end_time);
  return start && end && end > start ? Math.round((end - start) / 60000) : null;
}

function formatDuration(min: number | null) {
  if (min == null) return "—";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

function pageItems(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items: (number | "…")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);
  if (start > 2) items.push("…");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < totalPages - 1) items.push("…");
  items.push(totalPages);
  return items;
}

function Pagination({
  page,
  totalPages,
  total,
  disabled,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  disabled: boolean;
  onChange: (page: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm text-slate-600">
      <span>
        Mostrando <b className="text-slate-800">{from}–{to}</b> de <b className="text-slate-800">{total.toLocaleString("es-CO")}</b> reservas
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={`${btn} hover:bg-slate-200`} disabled={disabled || page <= 1} onClick={() => onChange(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        {pageItems(page, totalPages).map((item, i) =>
          item === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
          ) : (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onChange(item)}
              className={`${btn} ${item === page ? "bg-blue-600 text-white shadow-sm" : "hover:bg-slate-200"}`}
              aria-current={item === page ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
        <button type="button" className={`${btn} hover:bg-slate-200`} disabled={disabled || page >= totalPages} onClick={() => onChange(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default function BookingHistoryPage() {
  const { categories: carTypes, activeCategories } = useCarTypeCatalog();
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get("status") ?? "TODOS");
  const [driverFilter, setDriverFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [dateFrom, setDateFrom] = useState(() => searchParams.get("from") ?? "");
  const [dateTo, setDateTo] = useState(() => searchParams.get("to") ?? "");
  const [exporting, setExporting] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<BookingRecord | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [assignBooking, setAssignBooking] = useState<BookingRecord | null>(null);
  const [assignDrivers, setAssignDrivers] = useState<AssignableDriver[]>([]);
  const [assignQuery, setAssignQuery] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigningDriverId, setAssigningDriverId] = useState<string | null>(null);
  const [cancelBlocked, setCancelBlocked] = useState<BookingRecord | null>(
    null
  );
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "live" | "offline"
  >("connecting");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(() => (searchParams.get("search") ?? "").trim());
  const [driverQuery, setDriverQuery] = useState("");
  const [driverOptions, setDriverOptions] = useState<SearchableOption[]>([]);
  const [driverOptionsLoading, setDriverOptionsLoading] = useState(false);
  const [driverLabel, setDriverLabel] = useState("");
  const isMountedRef = useRef(true);
  const realtimeStatusRef = useRef(realtimeStatus);
  const selectedBookingRef = useRef<BookingRecord | null>(null);
  const requestSeqRef = useRef(0);

  realtimeStatusRef.current = realtimeStatus;
  selectedBookingRef.current = selectedBooking;

  const filters = useMemo<BookingListFilters>(() => {
    const category = carTypes.find((c) => c.id === categoryFilter);
    return {
      search: debouncedSearch,
      status: statusFilter === "TODOS" || STATUS_GROUPS[statusFilter] ? null : statusFilter,
      statuses: STATUS_GROUPS[statusFilter] ?? null,
      driverId: driverFilter || null,
      carTypes: category ? carTypeValuesForCategory(category) : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    };
  }, [debouncedSearch, statusFilter, driverFilter, categoryFilter, carTypes, dateFrom, dateTo]);

  const filtersRef = useRef(filters);
  const pageRef = useRef(page);
  filtersRef.current = filters;
  pageRef.current = page;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const loadBookings = async (silent = false) => {
    const seq = ++requestSeqRef.current;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const { rows, total: count } = await BookingsService.listPage(filtersRef.current, pageRef.current, PAGE_SIZE);
      if (!isMountedRef.current || seq !== requestSeqRef.current) return;
      setBookings(rows);
      setTotal(count);
      const selectedId = selectedBookingRef.current?.id;
      const refreshed = selectedId ? rows.find((booking) => booking.id === selectedId) : null;
      if (refreshed) setSelectedBooking(refreshed);
      setLastUpdate(new Date());
    } catch (e: any) {
      if (!isMountedRef.current || seq !== requestSeqRef.current) return;
      setError(e?.message || "Error al cargar las reservas");
    } finally {
      if (isMountedRef.current && seq === requestSeqRef.current && !silent) setLoading(false);
    }
  };

  // Cualquier cambio de filtro vuelve a la página 1.
  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, 400);
    return () => window.clearTimeout(id);
  }, [searchTerm]);

  // Filtros que llegan por URL: buscador del header (?search=) e indicadores del inicio (?status=&from=&to=).
  const urlSearch = searchParams.get("search");
  const urlStatus = searchParams.get("status");
  const urlFrom = searchParams.get("from");
  const urlTo = searchParams.get("to");
  useEffect(() => {
    if (urlSearch === null && urlStatus === null && urlFrom === null && urlTo === null) return;
    if (urlSearch !== null) setSearchTerm(urlSearch);
    if (urlStatus !== null || urlFrom !== null || urlTo !== null) {
      setStatusFilter(urlStatus ?? "TODOS");
      setDateFrom(urlFrom ?? "");
      setDateTo(urlTo ?? "");
      setDriverFilter("");
      setCategoryFilter("");
      setPage(1);
    }
    setSearchParams({}, { replace: true });
  }, [urlSearch, urlStatus, urlFrom, urlTo, setSearchParams]);

  const filtersKey = JSON.stringify(filters);
  useEffect(() => {
    void loadBookings();
  }, [filtersKey, page]);

  // Si al refrescar la página actual queda fuera de rango (p. ej. tras borrar), retrocede.
  useEffect(() => {
    if (!loading && page > totalPages) setPage(totalPages);
  }, [loading, page, totalPages]);

  useEffect(() => {
    let cancelled = false;
    setDriverOptionsLoading(true);
    const id = window.setTimeout(async () => {
      try {
        const drivers = await BookingsService.searchDriverOptions(driverQuery);
        if (!cancelled) setDriverOptions(drivers.map((d) => ({ value: d.id, label: d.name })));
      } catch {
        if (!cancelled) setDriverOptions([]);
      } finally {
        if (!cancelled) setDriverOptionsLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [driverQuery]);

  const handleDriverChange = (value: string) => {
    setDriverLabel(driverOptions.find((o) => o.value === value)?.label ?? "");
    setDriverFilter(value);
    setPage(1);
  };

  useEffect(() => {
    isMountedRef.current = true;

    // Reload core reservations; polling also works without Realtime publication.
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (supabase) {
      channel = supabase
        .channel("bookings-history-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "reserva" },
          () => {
            if (!isMountedRef.current) return;
            clearTimeout(refreshTimer);
            refreshTimer = setTimeout(() => void loadBookings(true), 200);
          }
        )
        .subscribe((status: string) => {
          if (!isMountedRef.current) return;
          if (status === "SUBSCRIBED") setRealtimeStatus("live");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            setRealtimeStatus("offline");
          else if (status === "CLOSED") setRealtimeStatus("offline");
          else setRealtimeStatus("connecting");
        });
    } else {
      setRealtimeStatus("offline");
    }

    // Polling de respaldo cada 5s (mantiene la tabla viva aunque Realtime falle)
    const pollId = window.setInterval(() => {
      if (!isMountedRef.current) return;
      if (realtimeStatusRef.current === "live") return;
      loadBookings(true);
    }, 5000);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(pollId);
      clearTimeout(refreshTimer);
      if (channel && supabase) {
        supabase.removeChannel(channel);
      }
    };
  }, []);

  const categoryOptions = activeCategories;

  const exportToCSV = async () => {
    if (total === 0) {
      alert("No hay datos para exportar");
      return;
    }

    setExporting(true);
    try {
    const filteredBookings = await BookingsService.listAll(filters);
    const snapshots = await BookingsService.getServiceSnapshots(filteredBookings.map((b) => b.id));
    const byBooking = new Map<string, typeof snapshots>();
    snapshots.forEach((snapshot) => byBooking.set(snapshot.booking_id, [...(byBooking.get(snapshot.booking_id) || []), snapshot]));
    const headers = [
      "Referencia",
      "Fecha creación",
      "Fecha programada",
      "Fecha ejecución",
      "Cliente",
      "Email cliente",
      "Conductor",
      "Placa",
      "Tipo",
      "Origen",
      "Destino",
      "Precio estimado", "Precio final", "Duración real (min)", "Distancia real (km)",
      "Estado",
      "OTP",
      "Creado en",
      "Llegada pickup",
      "Iniciado",
      "Llegó destino",
      "Completado",
      "Cancelado",
    ];

    const rows = filteredBookings.map((b) => {
      const stages = byBooking.get(b.id) || [];
      const stageAt = (name: string) => {
        const snapshot = stages.find((item) => item.stage === name);
        return snapshot ? formatDate(snapshot.captured_at) : "";
      };
      return [
        b.reference || b.id,
        formatDate(b.created_at),
        b.booking_type === "SCHEDULED" ? formatDate(b.booking_date) : "",
        executionIso(b) ? formatDate(executionIso(b)) : "",
        b.customer_name || "",
        b.customer_email || "",
        b.driver_name || "",
        b.plate_number || "",
        categoryNameForValue(carTypes, b.car_type),
        b.pickup_address || "",
        b.drop_address || "",
        b.estimate ?? "", serviceTotal(b) ?? "", b.duration ?? "", b.distance ?? "",
        b.status || "",
        b.otp || "",
        stageAt("created"),
        stageAt("arrival_pickup"),
        stageAt("started"),
        stageAt("arrival_destination"),
        stageAt("completed"),
        stageAt("cancelled"),
      ];
    });

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            typeof value === "string"
              ? `"${value.replace(/"/g, '""')}"`
              : value
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historial_reservas.csv";
    a.click();
    URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "No fue posible exportar los snapshots");
    } finally { setExporting(false); }
  };

  const openBookingModal = (booking: BookingRecord) => {
    setSelectedBooking(booking);
    setOpenModal(true);
  };

  const closeBookingModal = () => {
    setSelectedBooking(null);
    setOpenModal(false);
  };

  const handleCancel = async (b: BookingRecord) => {
    // Una reserva completada no se puede cancelar: avisamos con un modal.
    if (TERMINAL_STATUSES.includes((b.status || "").toUpperCase())) {
      setCancelBlocked(b);
      return;
    }
    if (!confirm(`¿Cancelar la reserva ${b.reference || b.id}?`)) return;
    setActionLoadingId(b.id);
    try {
      const updated = await BookingsService.cancel(b.id);
      setBookings((prev) =>
        prev.map((x) => (x.id === b.id ? { ...x, ...updated } : x))
      );
      if (selectedBooking?.id === b.id) {
        setSelectedBooking({ ...selectedBooking, ...updated });
      }
    } catch (e: any) {
      alert(e?.message || "Error al cancelar la reserva");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (b: BookingRecord) => {
    if (
      !confirm(
        `¿Eliminar definitivamente la reserva ${b.reference || b.id}? Esta acción no se puede deshacer.`
      )
    )
      return;
    setActionLoadingId(b.id);
    try {
      await BookingsService.delete(b.id);
      if (selectedBooking?.id === b.id) closeBookingModal();
      void loadBookings(true);
    } catch (e: any) {
      alert(e?.message || "Error al eliminar la reserva");
    } finally {
      setActionLoadingId(null);
    }
  };

  const loadAssignableDrivers = async (query = "", bookingId = assignBooking?.id) => {
    setAssignLoading(true);
    setAssignError(null);
    try {
      const data = await BookingsService.listAssignableDrivers(query, bookingId);
      setAssignDrivers(data);
    } catch (e: any) {
      setAssignError(e?.message || "Error al cargar conductores");
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssignModal = (booking: BookingRecord) => {
    const status = (booking.status || "").trim().toUpperCase();
    if (TERMINAL_STATUSES.includes(status)) return;
    setAssignBooking(booking);
    setAssignQuery("");
    setAssignDrivers([]);
    loadAssignableDrivers("", booking.id);
  };

  const closeAssignModal = () => {
    if (assigningDriverId) return;
    setAssignBooking(null);
    setAssignDrivers([]);
    setAssignError(null);
  };

  const handleAssignDriver = async (driver: AssignableDriver) => {
    if (!assignBooking) return;
    const hadDriver = !!assignBooking.driver_id;
    const driverName = [driver.first_name, driver.last_name].filter(Boolean).join(" ") || driver.email || "conductor";
    if (
      hadDriver &&
      !confirm(`¿Reasignar la reserva ${assignBooking.reference || assignBooking.id} a ${driverName}?`)
    ) {
      return;
    }

    setAssigningDriverId(driver.id);
    setActionLoadingId(assignBooking.id);
    try {
      const updated = await BookingsService.assignDriver(assignBooking.id, driver.id);
      setBookings((prev) =>
        prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x))
      );
      if (selectedBooking?.id === updated.id) {
        setSelectedBooking({ ...selectedBooking, ...updated });
      }
      setAssignBooking(null);
    } catch (e: any) {
      setAssignError(e?.message || "Error al asignar conductor");
    } finally {
      setAssigningDriverId(null);
      setActionLoadingId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Historial de reservas
          </h1>
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${
                realtimeStatus === "live"
                  ? "bg-emerald-100 text-emerald-700"
                  : realtimeStatus === "connecting"
                  ? "bg-amber-100 text-amber-700"
                  : "bg-slate-200 text-slate-600"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  realtimeStatus === "live"
                    ? "bg-emerald-500 animate-pulse"
                    : realtimeStatus === "connecting"
                    ? "bg-amber-500"
                    : "bg-slate-400"
                }`}
              />
              {realtimeStatus === "live"
                ? "En vivo"
                : realtimeStatus === "connecting"
                ? "Conectando..."
                : "Sin conexión en tiempo real"}
            </span>
            {lastUpdate && (
              <span>
                Última actualización: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => loadBookings()}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Button onClick={exportToCSV} disabled={exporting}>{exporting ? "Exportando..." : "Exportar CSV"}</Button>
        </div>
      </div>

      {/* Buscador y filtros */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por cliente, conductor, placa, referencia, dirección..."
          className="p-2 border border-slate-300 rounded-lg flex-1 min-w-[260px] focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <select
          value={statusFilter}
          onChange={(e) => resetPage(setStatusFilter)(e.target.value)}
          className="p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <input type="date" aria-label="Fecha desde" title="Fecha desde" value={dateFrom} onChange={(e) => resetPage(setDateFrom)(e.target.value)} className="p-2 border border-slate-300 rounded-lg" />
        <input type="date" aria-label="Fecha hasta" title="Fecha hasta" value={dateTo} onChange={(e) => resetPage(setDateTo)(e.target.value)} className="p-2 border border-slate-300 rounded-lg" />
        <SearchableSelect
          options={driverOptions}
          value={driverFilter}
          onChange={handleDriverChange}
          onQueryChange={setDriverQuery}
          loading={driverOptionsLoading}
          selectedLabel={driverLabel}
          allLabel="Todos los conductores"
          placeholder="Escribe el nombre del conductor…"
        />
        <select value={categoryFilter} onChange={(e) => resetPage(setCategoryFilter)(e.target.value)} className="p-2 border border-slate-300 rounded-lg">
          <option value="">Todas las categorías</option>
          {categoryOptions.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr className="[&>th]:px-4 [&>th]:py-3 [&>th]:align-bottom">
              <th>Referencia</th>
              <th>Creación</th>
              <th>Programada</th>
              <th>Ejecución</th>
              <th>Cliente</th>
              <th>Conductor / Placa</th>
              <th>Categoría</th>
              <th className="min-w-[150px]">
                Estimado inicial cotizado
                <span className="block font-normal normal-case tracking-normal text-slate-400">Mínimo · rango</span>
              </th>
              <th className="min-w-[150px]">
                Precio final
                <span className="block font-normal normal-case tracking-normal text-slate-400">Mínimo · rango</span>
              </th>
              <th>Duración viaje</th>
              <th>Distancia cotizada</th>
              <th>Estado</th>
              <th className="text-center">OTP</th>
              <th className="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={14} className="text-center py-6 text-slate-400">
                  Cargando reservas...
                </td>
              </tr>
            ) : bookings.length > 0 ? (
              bookings.map((b) => {
                const statusUpper = (b.status || "").toUpperCase();
                const isCancelled = statusUpper === "CANCELLED";
                const isCompleted = statusUpper === "COMPLETED" || statusUpper === "PAID";
                const busy = actionLoadingId === b.id;
                const quote = resolveQuote(b, null, []);
                const finalFare = resolveFinalFare(b, null);
                const durationMin = tripDurationMin(b);
                const distanceKm = Number(b.distance);
                return (
                  <motion.tr
                    key={b.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b border-slate-100 align-top transition-colors hover:bg-sky-50/40 [&>td]:px-4 [&>td]:py-3"
                  >
                    <td>
                      <span className="inline-block rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs font-semibold text-slate-700">
                        {b.reference || b.id.slice(0, 8)}
                      </span>
                    </td>
                    <td><DateCell iso={b.created_at} /></td>
                    <td><DateCell iso={b.booking_type === "SCHEDULED" ? b.booking_date : null} /></td>
                    <td><DateCell iso={executionIso(b)} /></td>
                    <td className="max-w-[220px]">
                      <div className="font-medium text-slate-800">{b.customer_name || "—"}</div>
                      <div className="truncate text-xs text-slate-500" title={b.customer_email || ""}>
                        {b.customer_email || ""}
                      </div>
                    </td>
                    <td className="max-w-[200px]">
                      <div className="font-medium text-slate-800">{b.driver_name || <span className="text-slate-400">Sin asignar</span>}</div>
                      {b.plate_number && (
                        <span className="mt-1 inline-block rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-800">
                          {b.plate_number}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap">{categoryNameForValue(carTypes, b.car_type)}</td>
                    <td>
                      <FareCell min={quote.min} max={quote.max} empty="—" />
                    </td>
                    <td>
                      <FareCell
                        min={finalFare}
                        max={finalFare ? maxFromMinConductor(finalFare) : null}
                        empty={isCancelled ? "Cancelada" : "Pendiente"}
                      />
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{formatDuration(durationMin)}</td>
                    <td className="whitespace-nowrap tabular-nums">
                      {Number.isFinite(distanceKm) && distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : "—"}
                    </td>
                    <td>
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(b.status)}`}>
                        {statusLabel(b.status)}
                      </span>
                    </td>
                    <td className="text-center">
                      {b.otp ? (
                        <span className="inline-block rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-emerald-800">
                          {b.otp}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col items-stretch gap-1.5">
                        <button
                          type="button"
                          onClick={() => openBookingModal(b)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
                        >
                          <Eye size={14} />
                          Detalle
                        </button>
                        <Button
                          variant="secondary"
                          onClick={() => openAssignModal(b)}
                          disabled={busy || isCancelled || isCompleted}
                          className="!px-3 !py-1.5 !text-xs !text-sky-700 !border-sky-300 disabled:!bg-slate-200 disabled:!text-slate-400 disabled:!border-slate-300 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100"
                        >
                          {b.driver_id ? "Reasignar" : "Asignar"}
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() => handleCancel(b)}
                          disabled={busy || isCancelled}
                          className="!px-3 !py-1.5 !text-xs !text-amber-700 !border-amber-300 disabled:!bg-slate-200 disabled:!text-slate-400 disabled:!border-slate-300 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100"
                        >
                          {busy ? "..." : "Cancelar"}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={14} className="text-center py-6 text-slate-400">
                  {debouncedSearch || statusFilter !== "TODOS" || driverFilter || categoryFilter || dateFrom || dateTo
                    ? "Ninguna reserva coincide con la búsqueda o los filtros."
                    : "No hay reservas registradas."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
        <Pagination page={page} totalPages={totalPages} total={total} disabled={loading} onChange={setPage} />
      </Card>

      {/* Modal */}
      <BookingModal
        open={openModal}
        onClose={closeBookingModal}
        booking={selectedBooking}
        onCancel={handleCancel}
        actionLoading={
          selectedBooking ? actionLoadingId === selectedBooking.id : false
        }
      />

      {assignBooking && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-slate-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {assignBooking.driver_id ? "Reasignar conductor" : "Asignar conductor"}
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Reserva {assignBooking.reference || assignBooking.id.slice(0, 8)}
                    {assignBooking.driver_name ? ` · Actual: ${assignBooking.driver_name}` : ""}
                  </p>
                </div>
                <button
                  onClick={closeAssignModal}
                  disabled={!!assigningDriverId}
                  className="rounded-lg p-2 hover:bg-slate-100 text-slate-500 disabled:opacity-50"
                  aria-label="Cerrar asignación"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="p-6">
              <div className="flex gap-2 mb-4">
                <input
                  value={assignQuery}
                  onChange={(e) => setAssignQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") loadAssignableDrivers(assignQuery);
                  }}
                  placeholder="Buscar por nombre, correo o teléfono..."
                  className="p-2 border border-slate-300 rounded-lg flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
                <Button
                  variant="secondary"
                  onClick={() => loadAssignableDrivers(assignQuery)}
                  disabled={assignLoading}
                >
                  {assignLoading ? "Buscando..." : "Buscar"}
                </Button>
              </div>

              {assignError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
                  {assignError}
                </div>
              )}

              <div className="max-h-[52vh] overflow-auto rounded-xl border border-slate-200">
                {assignLoading ? (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    Cargando conductores...
                  </div>
                ) : assignDrivers.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-sm">
                    No hay conductores con vehículo y membresía activa disponibles con esos filtros.
                  </div>
                ) : (
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="px-3 py-2 font-medium">Conductor</th>
                        <th className="px-3 py-2 font-medium">Contacto</th>
                        <th className="px-3 py-2 font-medium">Vehículo</th>
                        <th className="px-3 py-2 font-medium text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignDrivers.map((driver) => {
                        const name =
                          [driver.first_name, driver.last_name].filter(Boolean).join(" ") ||
                          driver.email ||
                          "Conductor";
                        const vehicle = driver.vehicle;
                        const sameDriver = assignBooking.driver_id === driver.id;
                        return (
                          <tr key={driver.id} className="border-t border-slate-100">
                            <td className="px-3 py-3">
                              <div className="font-medium text-slate-800">{name}</div>
                              <div className="text-xs text-slate-400 font-mono">{driver.id.slice(0, 8)}</div>
                            </td>
                            <td className="px-3 py-3">
                              <div>{driver.mobile || "—"}</div>
                              <div className="text-xs text-slate-500">{driver.email || ""}</div>
                            </td>
                            <td className="px-3 py-3">
                              {vehicle ? (
                                <div>
                                  <div>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "Vehículo"}</div>
                                  <div className="text-xs text-slate-500">{vehicle.plate || "Sin placa"}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400 text-xs">Sin vehículo</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-right">
                              <Button
                                onClick={() => handleAssignDriver(driver)}
                                disabled={!!assigningDriverId || sameDriver}
                                className="!px-3 !py-1.5 !text-xs"
                              >
                                {assigningDriverId === driver.id
                                  ? "Asignando..."
                                  : sameDriver
                                  ? "Asignado"
                                  : assignBooking.driver_id
                                  ? "Reasignar"
                                  : "Asignar"}
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Aviso: no se puede cancelar una reserva completada */}
      {cancelBlocked && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          >
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">
                ⚠️
              </div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">
                No se puede cancelar
              </h2>
              <p className="text-sm text-slate-600">
                La reserva{" "}
                <span className="font-semibold">
                  {cancelBlocked.reference || cancelBlocked.id.slice(0, 8)}
                </span>{" "}
                ya está <span className="font-semibold">completada</span> y no
                puede cancelarse.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <Button onClick={() => setCancelBlocked(null)}>Entendido</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
