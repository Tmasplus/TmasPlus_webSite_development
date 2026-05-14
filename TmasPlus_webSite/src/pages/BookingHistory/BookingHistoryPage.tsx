import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import { BookingModal } from "./BookingModal";
import {
  BookingsService,
  type BookingRecord,
} from "@/services/bookings.service";

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

  const loadBookings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await BookingsService.list();
      setBookings(data);
    } catch (e: any) {
      setError(e?.message || "Error al cargar las reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
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
      b.total_cost ?? b.price ?? "",
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

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Historial de reservas
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={loadBookings}>
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
                const isCancelled = (b.status || "").toUpperCase() === "CANCELLED";
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
                      {formatMoney(b.total_cost ?? b.price)}
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
                          onClick={() => handleCancel(b)}
                          disabled={busy || isCancelled}
                          className="!px-3 !py-1.5 !text-xs !text-amber-700 !border-amber-300"
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
    </div>
  );
}
