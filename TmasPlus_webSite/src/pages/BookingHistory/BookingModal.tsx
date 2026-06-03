import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { BookingRecord } from "@/services/bookings.service";

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
  return isNaN(+d) ? String(value) : d.toLocaleString();
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

function Row({
  label,
  value,
  mono,
  uppercase,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  uppercase?: boolean;
}) {
  const empty =
    value === null ||
    value === undefined ||
    value === "" ||
    value === "—";
  return (
    <div>
      <span className="font-semibold text-slate-500 block">{label}:</span>
      <p
        className={`${mono ? "font-mono text-xs" : ""} ${
          uppercase ? "uppercase font-bold" : ""
        } ${empty ? "text-slate-400" : "text-slate-800"} break-words`}
      >
        {empty ? "—" : value}
      </p>
    </div>
  );
}

export function BookingModal({
  open,
  onClose,
  booking,
  onCancel,
  onDelete,
  actionLoading,
}: {
  open: boolean;
  onClose: () => void;
  booking: BookingRecord | null;
  onCancel?: (b: BookingRecord) => void;
  onDelete?: (b: BookingRecord) => void;
  actionLoading?: boolean;
}) {
  if (!open || !booking) return null;

  const status = (booking.status || "").toUpperCase();
  const isCancelled = status === "CANCELLED";

  const statusStyles: Record<string, string> = {
    CANCELLED: "bg-red-50 text-red-700 border-red-200",
    COMPLETED: "bg-green-50 text-green-700 border-green-200",
    PENDING: "bg-amber-50 text-amber-700 border-amber-200",
    CONFIRMED: "bg-sky-50 text-sky-700 border-sky-200",
  };
  const statusClass =
    statusStyles[status] || "bg-slate-50 text-slate-700 border-slate-200";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Detalle de Reserva
            </h2>
            <p className="text-sm text-slate-500">
              Ref: {booking.reference || booking.id}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${statusClass}`}
            >
              {booking.status || "—"}
            </span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 font-bold text-2xl leading-none"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-sky-50 to-indigo-50 p-4 rounded-xl border border-sky-100">
              <h3 className="text-sm font-bold text-sky-900 mb-2 uppercase tracking-wide">
                Resumen del viaje
              </h3>
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs text-sky-700">Total cobrado</p>
                  <p className="text-lg font-bold text-sky-900">
                    {formatMoney(booking.total_cost)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-sky-700">Distancia</p>
                  <p className="text-2xl font-black text-indigo-600">
                    {booking.distance ? `${booking.distance} km` : "—"}
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                Cliente
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Nombre" value={booking.customer_name} />
                <Row label="Email" value={booking.customer_email} />
                <Row label="Contacto" value={booking.customer_contact} />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                Conductor / Vehículo
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Conductor" value={booking.driver_name} />
                <Row label="Contacto" value={booking.driver_contact} />
                <Row label="Tipo" value={booking.car_type} />
                <Row label="Modelo" value={booking.car_model} />
                <Row
                  label="Placa"
                  value={booking.plate_number}
                  uppercase={!!booking.plate_number}
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                Recorrido
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Origen" value={booking.pickup_address} />
                <Row label="Destino" value={booking.drop_address} />
                <Row
                  label="Distancia"
                  value={booking.distance ? `${booking.distance} km` : null}
                />
                <Row
                  label="Duración"
                  value={booking.duration ? `${booking.duration} min` : null}
                />
                <Row label="Tipo de viaje" value={booking.trip_type} />
                <Row label="Tipo de reserva" value={booking.booking_type} />
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                Pago
              </h3>
              <div className="space-y-3 text-sm">
                <Row label="Estimado" value={formatMoney(booking.estimate)} />
                <Row label="Precio" value={formatMoney(booking.price)} />
                <Row
                  label="Costo total"
                  value={formatMoney(booking.total_cost)}
                />
                <Row
                  label="Comisión del conductor"
                  value={formatMoney(booking.driver_share)}
                />
                <Row
                  label="Cargo por conveniencia"
                  value={formatMoney(booking.convenience_fees)}
                />
                <Row
                  label="Descuento"
                  value={formatMoney(booking.discount)}
                />
                <Row label="Forma de pago" value={booking.payment_mode} />
                <Row label="OTP" value={booking.otp} mono />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                Fechas
              </h3>
              <div className="space-y-3 text-sm">
                <Row
                  label="Fecha de creación"
                  value={formatDate(booking.created_at)}
                />
                <Row
                  label="Fecha de reserva"
                  value={formatDate(booking.booking_date)}
                />
                <Row
                  label="Última actualización"
                  value={formatDate(booking.updated_at)}
                />
              </div>
            </div>

            {isCancelled && (
              <div>
                <h3 className="text-lg font-bold text-[#002f45] border-b pb-2 mb-3">
                  Cancelación
                </h3>
                <div className="space-y-3 text-sm">
                  <Row
                    label="Cancelada el"
                    value={formatDate(booking.cancelled_at)}
                  />
                  <Row label="Cancelada por" value={booking.cancelled_by} />
                  <Row label="Motivo" value={booking.reason} />
                </div>
                <p className="mt-4 p-2 bg-rose-50 text-rose-800 rounded border border-rose-200 text-xs">
                  <span className="font-bold">
                    Esta reserva fue cancelada.
                  </span>
                  <br />
                  Revisa el motivo y la fecha para auditoría.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {onCancel && (
              <button
                onClick={() => onCancel(booking)}
                disabled={actionLoading || isCancelled}
                className="px-4 py-2 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg font-medium hover:bg-amber-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "..." : "Cancelar reserva"}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(booking)}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading ? "..." : "Eliminar"}
              </button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose} disabled={actionLoading}>
            Cerrar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
