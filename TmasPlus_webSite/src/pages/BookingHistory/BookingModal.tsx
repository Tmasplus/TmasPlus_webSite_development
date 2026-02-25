import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export function BookingModal({
  open,
  onClose,
  booking,
}: {
  open: boolean;
  onClose: () => void;
  booking: any;
}) {
  if (!open || !booking) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-slate-800 mb-4">
          Detalle de reserva
        </h2>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <p>
            <span className="font-medium">Cliente:</span> {booking.client}
          </p>
          <p>
            <span className="font-medium">Conductor:</span> {booking.driver}
          </p>
          <p>
            <span className="font-medium">Placa:</span> {booking.plate}
          </p>
          <p>
            <span className="font-medium">Tipo:</span> {booking.type}
          </p>
          <p>
            <span className="font-medium">Costo:</span> $
            {booking.cost.toLocaleString()}
          </p>
          <p>
            <span className="font-medium">Comisión:</span> $
            {booking.commission.toLocaleString()}
          </p>
          <p>
            <span className="font-medium">Estado:</span> {booking.status}
          </p>
          <p>
            <span className="font-medium">Código OTP:</span> {booking.otp}
          </p>
        </div>

        <div className="flex justify-end mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
