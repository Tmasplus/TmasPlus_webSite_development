import React, { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { InvoiceStatusBadge, PaymentStatusBadge } from "@/components/companies/CompanyUi";
import { BillingStatusModal, type BillingChange } from "@/components/companies/BillingStatusModal";
import { ServiceLiquidation } from "@/components/companies/ServiceLiquidation";
import { TripTariffEditor } from "@/components/companies/TripTariffEditor";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import {
  CompaniesService,
  DRIVER_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  isBillableTrip,
  type CompanyBooking,
  type CompanyViewer,
} from "@/services/companies.service";
import { toast } from "@/utils/toast";

const BILLING_LABELS: Record<string, string> = { ...INVOICE_STATUS_LABELS, ...DRIVER_PAYMENT_STATUS_LABELS };
const billingLabel = (value: string) => BILLING_LABELS[value] ?? value;

const REQUESTED_BY: Record<CompanyBooking["requested_by"], string> = {
  empresa: "la empresa (portal)",
  admin: "T+Plus",
  colaborador: "el colaborador (app)",
};

/** Factura, pago al conductor (solo admin), liquidación e historial de un viaje empresarial. */
export const CorporateBillingSection: React.FC<{
  booking: CompanyBooking;
  viewer: CompanyViewer;
  onChanged: () => void;
}> = ({ booking, viewer, onChanged }) => {
  const isAdmin = viewer === "admin";
  const [change, setChange] = useState<BillingChange | null>(null);
  const [saving, setSaving] = useState(false);
  const billable = isBillableTrip(booking);

  async function confirm(referencia: string, nota: string) {
    if (!change) return;
    setSaving(true);
    try {
      await CompaniesService.setBillingStatus(change.bookingIds, change.field, change.value, referencia, nota);
      toast.success("Estado actualizado.");
      setChange(null);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar el estado"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {booking.cost_center && (
        <p className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600">
          Centro de costo o motivo: <strong className="text-slate-800">{booking.cost_center}</strong>
        </p>
      )}
      {billable && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Facturación</h4>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
            <span className="text-sm text-slate-600">Factura:</span>
            <InvoiceStatusBadge status={booking.estado_facturacion} />
            {booking.factura_referencia && <span className="font-mono text-xs text-slate-500">{booking.factura_referencia}</span>}
            {isAdmin && (
              <Button
                variant="secondary"
                className="!px-3 !py-1.5 !text-xs"
                onClick={() =>
                  setChange({
                    field: "facturacion",
                    value: booking.estado_facturacion === "facturado" ? "sin_facturar" : "facturado",
                    bookingIds: [booking.id],
                  })
                }
              >
                {booking.estado_facturacion === "facturado" ? "Marcar sin facturar" : "Marcar facturado"}
              </Button>
            )}
            {isAdmin && booking.estado_pago_conductor && (
              <>
                <span className="mx-1 h-5 w-px bg-slate-200" />
                <span className="text-sm text-slate-600">Pago al conductor:</span>
                <PaymentStatusBadge status={booking.estado_pago_conductor} />
                {booking.driver_share !== null && (
                  <span className="text-xs text-slate-500">{formatMoney(booking.driver_share)}</span>
                )}
                <Button
                  variant="secondary"
                  className="!px-3 !py-1.5 !text-xs"
                  onClick={() =>
                    setChange({
                      field: "pago_conductor",
                      value: booking.estado_pago_conductor === "pagado" ? "sin_pagar" : "pagado",
                      bookingIds: [booking.id],
                    })
                  }
                >
                  {booking.estado_pago_conductor === "pagado" ? "Marcar sin pagar" : "Marcar pagado"}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Liquidación del servicio</h4>
        {isAdmin && booking.status !== "CANCELLED" && (
          <div className="mb-3">
            <TripTariffEditor booking={booking} onSaved={onChanged} />
          </div>
        )}
        <ServiceLiquidation booking={booking} />
      </div>

      {isAdmin && booking.historial_cobro.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Historial de factura y pago</h4>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {booking.historial_cobro.map((ev, i) => (
              <li key={i} className="px-3 py-2 text-xs text-slate-600">
                <span className="font-medium text-slate-800">{ev.campo === "facturacion" ? "Factura" : "Pago al conductor"}:</span>{" "}
                {ev.valor_anterior ? `${billingLabel(ev.valor_anterior)} → ` : ""}
                {billingLabel(ev.valor_nuevo)}
                {ev.referencia && <> · <span className="font-mono">{ev.referencia}</span></>}
                {ev.nota && <> · {ev.nota}</>}
                <span className="block text-slate-400">
                  {formatDateTime(ev.cambiado_en)} · {ev.cambiado_por}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BillingStatusModal change={change} saving={saving} onClose={() => setChange(null)} onConfirm={confirm} />
    </div>
  );
};

/** Sección empresarial dentro del modal de detalle de reserva (vista del administrador). */
export const CorporateBookingExtra: React.FC<{ bookingId: string; onChanged?: () => void }> = ({ bookingId, onChanged }) => {
  const [booking, setBooking] = useState<CompanyBooking | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBooking(await CompaniesService.getBooking(bookingId, "admin"));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la información empresarial"));
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="mx-6 mb-6 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>;
  if (!booking) return <div className="mx-6 mb-6 text-sm text-slate-400">Cargando información empresarial…</div>;

  return (
    <section className="mx-6 mb-6 rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
          <Building2 size={20} />
        </span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Viaje empresarial</p>
          <p className="text-sm text-slate-700">
            <strong>{booking.company_name}</strong> · Colaborador {booking.collaborator_name} · Solicitado por{" "}
            {REQUESTED_BY[booking.requested_by] ?? booking.requested_by} · Pago empresarial
          </p>
        </div>
      </div>
      <CorporateBillingSection
        booking={booking}
        viewer="admin"
        onChanged={() => {
          void load();
          onChanged?.();
        }}
      />
    </section>
  );
};
