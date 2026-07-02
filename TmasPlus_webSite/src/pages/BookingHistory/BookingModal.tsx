import { motion } from "framer-motion";
import { X } from "lucide-react";
import {
  BookingDetailBody,
  BookingDetailHeader,
  isBookingCancelled,
} from "@/components/bookings/BookingDetailView";
import { Button } from "@/components/ui/Button";
import type { BookingRecord } from "@/services/bookings.service";

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

  const isCancelled = isBookingCancelled(booking);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-4">
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22 }}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        <BookingDetailHeader
          booking={booking}
          actions={
            <button
              onClick={onClose}
              className="grid h-10 w-10 place-items-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar detalle de reserva"
            >
              <X size={22} />
            </button>
          }
        />

        <BookingDetailBody booking={booking} className="flex-1 overflow-y-auto" />

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-white px-6 py-4">
          <div className="flex flex-wrap gap-3">
            {onCancel && (
              <button
                onClick={() => onCancel(booking)}
                disabled={actionLoading || isCancelled}
                className="rounded-xl border border-amber-200 bg-white px-5 py-3 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading ? "..." : "Cancelar reserva"}
              </button>
            )}
            {onDelete && (
              <button
                onClick={() => onDelete(booking)}
                disabled={actionLoading}
                className="rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {actionLoading ? "..." : "Eliminar"}
              </button>
            )}
          </div>
          <Button onClick={onClose} disabled={actionLoading} className="min-w-32">
            Cerrar
          </Button>
        </footer>
      </motion.div>
    </div>
  );
}
