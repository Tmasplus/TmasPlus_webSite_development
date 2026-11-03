import { Building2, FlaskConical } from "lucide-react";
import { classNames } from "@/utils/classNames";
import {
  BOOKING_STATUS_LABELS,
  COMPANIES_BACKEND_READY,
  DRIVER_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  type CompanyBookingStatus,
  type DriverPaymentStatus,
  type InvoiceStatus,
} from "@/services/companies.service";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "facturado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-600 border-slate-200"
      )}
    >
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}

export function PaymentStatusBadge({ status }: { status: DriverPaymentStatus }) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        status === "pagado" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-orange-50 text-orange-700 border-orange-200"
      )}
    >
      {DRIVER_PAYMENT_STATUS_LABELS[status]}
    </span>
  );
}

const STATUS_STYLES: Record<CompanyBookingStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  ACCEPTED: "bg-sky-50 text-sky-700 border-sky-200",
  ARRIVED_PICKUP: "bg-sky-50 text-sky-700 border-sky-200",
  STARTED: "bg-indigo-50 text-indigo-700 border-indigo-200",
  ARRIVED_DESTINATION: "bg-indigo-50 text-indigo-700 border-indigo-200",
  COMPLETED: "bg-green-50 text-green-700 border-green-200",
  PAID: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-rose-50 text-rose-700 border-rose-200",
};

export function BookingStatusBadge({ status }: { status: CompanyBookingStatus }) {
  return (
    <span className={classNames("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_STYLES[status])}>
      {BOOKING_STATUS_LABELS[status]}
    </span>
  );
}

export function ActiveBadge({ active, activeLabel = "Activa", inactiveLabel = "Inactiva" }: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
        active ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-600 border-slate-200"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

export function CompanyLogo({ src, name, size = 36 }: { src?: string | null; name: string; size?: number }) {
  if (src) {
    return (
      <img
        src={src}
        alt={`Logo ${name}`}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-lg border border-slate-200 bg-white object-contain"
      />
    );
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-500 border border-sky-100"
    >
      <Building2 size={Math.round(size * 0.5)} />
    </div>
  );
}

/** Aviso visible mientras el módulo funciona con datos de demostración. */
export function DemoNotice() {
  if (COMPANIES_BACKEND_READY) return null;
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
      <FlaskConical size={16} className="mt-0.5 shrink-0" />
      <span>
        <strong>Datos de demostración.</strong> El módulo de empresas aún no está conectado a la base de datos:
        lo que crees aquí se guarda solo en este navegador y no genera viajes reales.
      </span>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="md:col-span-2 mt-2 border-b border-slate-100 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h3>
  );
}
