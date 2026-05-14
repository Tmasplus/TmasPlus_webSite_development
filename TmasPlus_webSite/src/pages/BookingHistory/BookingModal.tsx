import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { BookingRecord } from "@/services/bookings.service";

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

function Field({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="text-sm text-slate-800 break-words">{value || "—"}</div>
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

  const isCancelled = (booking.status || "").toUpperCase() === "CANCELLED";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Detalle de reserva
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {booking.reference || booking.id}
            </p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold ${
              isCancelled
                ? "bg-rose-100 text-rose-800"
                : "bg-sky-100 text-sky-800"
            }`}
          >
            {booking.status}
          </span>
        </div>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Cliente
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Nombre" value={booking.customer_name} />
            <Field label="Email" value={booking.customer_email} />
            <Field label="Contacto" value={booking.customer_contact} />
          </div>
        </section>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Conductor / vehículo
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Conductor" value={booking.driver_name} />
            <Field label="Contacto" value={booking.driver_contact} />
            <Field label="Tipo" value={booking.car_type} />
            <Field label="Modelo" value={booking.car_model} />
            <Field label="Placa" value={booking.plate_number} />
          </div>
        </section>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Recorrido
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Origen" value={booking.pickup_address} />
            <Field label="Destino" value={booking.drop_address} />
            <Field
              label="Distancia"
              value={
                booking.distance ? `${booking.distance} km` : null
              }
            />
            <Field
              label="Duración"
              value={booking.duration ? `${booking.duration} min` : null}
            />
            <Field label="Tipo viaje" value={booking.trip_type} />
            <Field label="Tipo reserva" value={booking.booking_type} />
          </div>
        </section>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">Pago</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Estimado" value={formatMoney(booking.estimate)} />
            <Field label="Precio" value={formatMoney(booking.price)} />
            <Field
              label="Costo total"
              value={formatMoney(booking.total_cost)}
            />
            <Field
              label="Comisión conductor"
              value={formatMoney(booking.driver_share)}
            />
            <Field
              label="Cargo conveniencia"
              value={formatMoney(booking.convenience_fees)}
            />
            <Field label="Descuento" value={formatMoney(booking.discount)} />
            <Field label="Forma de pago" value={booking.payment_mode} />
            <Field label="OTP" value={booking.otp} />
          </div>
        </section>

        <section className="mb-4">
          <h3 className="text-sm font-semibold text-slate-700 mb-2">
            Fechas
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field
              label="Fecha creación"
              value={formatDate(booking.created_at)}
            />
            <Field
              label="Fecha reserva"
              value={formatDate(booking.booking_date)}
            />
            <Field
              label="Actualizada"
              value={formatDate(booking.updated_at)}
            />
            {isCancelled && (
              <>
                <Field
                  label="Cancelada el"
                  value={formatDate(booking.cancelled_at)}
                />
                <Field label="Cancelada por" value={booking.cancelled_by} />
                <Field label="Motivo" value={booking.reason} />
              </>
            )}
          </div>
        </section>

        <div className="flex justify-between items-center mt-6 gap-2 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {onCancel && (
              <Button
                variant="secondary"
                onClick={() => onCancel(booking)}
                disabled={actionLoading || isCancelled}
                className="!text-amber-700 !border-amber-300"
              >
                {actionLoading ? "..." : "Cancelar reserva"}
              </Button>
            )}
            {onDelete && (
              <Button
                variant="secondary"
                onClick={() => onDelete(booking)}
                disabled={actionLoading}
                className="!text-rose-700 !border-rose-300"
              >
                {actionLoading ? "..." : "Eliminar"}
              </Button>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
