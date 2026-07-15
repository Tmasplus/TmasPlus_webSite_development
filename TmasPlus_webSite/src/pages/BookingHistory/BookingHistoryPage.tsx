import { useEffect, useMemo, useRef, useState } from "react";
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
import { supabaseSecondary } from "@/config/supabase";

const STATUSES = [
  "TODOS",
  "PENDING",
  "ACCEPTED",
  "STARTED",
  "ARRIVED",
  "PICKED_UP",
  "COMPLETED",
  "CANCELLED",
];

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString();
}

function formatMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const num = typeof v === "string" ? Number(v) : v;
  if (isNaN(num)) return String(v);
  if (num === 0) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(num);
}

function statusBadgeClass(status: string) {
  const s = (status || "").toUpperCase();
  if (s === "COMPLETED" || s === "COMPLETADO")
    return "bg-green-100 text-green-800";
  if (s === "CANCELLED" || s === "CANCELADA")
    return "bg-rose-100 text-rose-800";
  if (s === "PENDING" || s === "PENDIENTE")
    return "bg-yellow-100 text-yellow-800";
  if (s === "ACCEPTED" || s === "STARTED" || s === "PICKED_UP" || s === "ARRIVED")
    return "bg-sky-100 text-sky-800";
  return "bg-slate-200 text-slate-700";
}

export default function BookingHistoryPage() {
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("TODOS");
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
  const isMountedRef = useRef(true);
  const selectedBookingRef = useRef<BookingRecord | null>(null);

  selectedBookingRef.current = selectedBooking;

  const loadBookings = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await BookingsService.list();
      if (!isMountedRef.current) return;
      setBookings(data);
      setLastUpdate(new Date());
    } catch (e: any) {
      if (!isMountedRef.current) return;
      setError(e?.message || "Error al cargar las reservas");
    } finally {
      if (!isMountedRef.current) return;
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    isMountedRef.current = true;
    loadBookings();

    // Realtime: suscripción a cambios en la tabla bookings
    let channel: ReturnType<typeof supabaseSecondary.channel> | null = null;
    if (supabaseSecondary) {
      channel = supabaseSecondary
        .channel("bookings-history-realtime")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings" },
          (payload: any) => {
            if (!isMountedRef.current) return;
            setLastUpdate(new Date());
            const { eventType, new: newRow, old: oldRow } = payload;
            if (eventType === "INSERT" && newRow) {
              setBookings((prev) => {
                if (prev.some((b) => b.id === newRow.id)) return prev;
                return [newRow as BookingRecord, ...prev];
              });
            } else if (eventType === "UPDATE" && newRow) {
              setBookings((prev) =>
                prev.map((b) => (b.id === newRow.id ? { ...b, ...newRow } : b))
              );
              if (selectedBookingRef.current?.id === newRow.id) {
                setSelectedBooking((prev) =>
                  prev ? { ...prev, ...newRow } : prev
                );
              }
            } else if (eventType === "DELETE" && oldRow) {
              setBookings((prev) => prev.filter((b) => b.id !== oldRow.id));
              if (selectedBookingRef.current?.id === oldRow.id) {
                setSelectedBooking(null);
                setOpenModal(false);
              }
            }
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
      loadBookings(true);
    }, 5000);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(pollId);
      if (channel && supabaseSecondary) {
        supabaseSecondary.removeChannel(channel);
      }
    };
  }, []);

  const filteredBookings = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return bookings.filter((b) => {
      const matchesStatus =
        statusFilter === "TODOS" ||
        (b.status || "").toUpperCase() === statusFilter;
      if (!term) return matchesStatus;
      const matchesTerm = [
        b.id,
        b.reference,
        b.customer_name,
        b.customer_email,
        b.customer_contact,
        b.driver_name,
        b.driver_contact,
        b.plate_number,
        b.pickup_address,
        b.drop_address,
        b.car_type,
      ]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
      return matchesStatus && matchesTerm;
    });
  }, [bookings, searchTerm, statusFilter]);

  const exportToCSV = () => {
    if (filteredBookings.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const headers = [
      "Referencia",
      "Fecha creación",
      "Fecha servicio",
      "Cliente",
      "Email cliente",
      "Conductor",
      "Placa",
      "Tipo",
      "Origen",
      "Destino",
      "Costo total",
      "Estado",
      "OTP",
    ];

    const rows = filteredBookings.map((b) => [
      b.reference || b.id,
      formatDate(b.created_at),
      formatDate(b.booking_date),
      b.customer_name || "",
      b.customer_email || "",
      b.driver_name || "",
      b.plate_number || "",
      b.car_type || "",
      b.pickup_address || "",
      b.drop_address || "",
      serviceTotal(b) ?? "",
      b.status || "",
      b.otp || "",
    ]);

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
    if ((b.status || "").toUpperCase().startsWith("COMPLET")) {
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
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      if (selectedBooking?.id === b.id) closeBookingModal();
    } catch (e: any) {
      alert(e?.message || "Error al eliminar la reserva");
    } finally {
      setActionLoadingId(null);
    }
  };

  const loadAssignableDrivers = async (query = "") => {
    setAssignLoading(true);
    setAssignError(null);
    try {
      const data = await BookingsService.listAssignableDrivers(query);
      setAssignDrivers(data);
    } catch (e: any) {
      setAssignError(e?.message || "Error al cargar conductores");
    } finally {
      setAssignLoading(false);
    }
  };

  const openAssignModal = (booking: BookingRecord) => {
    const status = (booking.status || "").trim().toUpperCase();
    if (status.startsWith("COMPLET") || status.startsWith("CANCEL")) return;
    setAssignBooking(booking);
    setAssignQuery("");
    setAssignDrivers([]);
    loadAssignableDrivers();
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
          <Button onClick={exportToCSV}>Exportar CSV</Button>
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
          onChange={(e) => setStatusFilter(e.target.value)}
          className="p-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      {/* Tabla */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Referencia</th>
              <th className="p-3">Fecha creación</th>
              <th className="p-3">Fecha servicio</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Conductor</th>
              <th className="p-3">Placa</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Costo</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="text-center py-6 text-slate-400">
                  Cargando reservas...
                </td>
              </tr>
            ) : filteredBookings.length > 0 ? (
              filteredBookings.map((b) => {
                const statusUpper = (b.status || "").toUpperCase();
                const isCancelled = statusUpper.startsWith("CANCEL");
                const isCompleted = statusUpper.startsWith("COMPLET");
                const busy = actionLoadingId === b.id;
                return (
                  <motion.tr
                    key={b.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-b hover:bg-slate-50"
                  >
                    <td className="p-3 font-mono text-xs">
                      {b.reference || b.id.slice(0, 8)}
                    </td>
                    <td className="p-3">{formatDate(b.created_at)}</td>
                    <td className="p-3">{formatDate(b.booking_date)}</td>
                    <td className="p-3">
                      <div>{b.customer_name || "—"}</div>
                      <div className="text-xs text-slate-500">
                        {b.customer_email || ""}
                      </div>
                    </td>
                    <td className="p-3">{b.driver_name || "—"}</td>
                    <td className="p-3">{b.plate_number || "—"}</td>
                    <td className="p-3">{b.car_type || "—"}</td>
                    <td className="p-3">
                      {formatMoney(serviceTotal(b))}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${statusBadgeClass(
                          b.status
                        )}`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-center gap-2 flex-wrap">
                        <Button
                          variant="secondary"
                          onClick={() => openBookingModal(b)}
                          className="!px-3 !py-1.5 !text-xs"
                        >
                          Ver
                        </Button>
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
                        <Button
                          variant="secondary"
                          onClick={() => handleDelete(b)}
                          disabled={busy}
                          className="!px-3 !py-1.5 !text-xs !text-rose-700 !border-rose-300"
                        >
                          {busy ? "..." : "Eliminar"}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} className="text-center py-6 text-slate-400">
                  No hay reservas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal */}
      <BookingModal
        open={openModal}
        onClose={closeBookingModal}
        booking={selectedBooking}
        onCancel={handleCancel}
        onDelete={handleDelete}
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
                    No hay conductores disponibles con esos filtros.
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
