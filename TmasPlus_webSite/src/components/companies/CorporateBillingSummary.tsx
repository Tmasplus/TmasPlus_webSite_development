import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatMoney } from "@/components/companies/format";
import { CompaniesService, companyCharge, isBillableTrip, type CompanyBooking } from "@/services/companies.service";

type Totals = { count: number; amount: number };

function SummaryCard({ label, totals, tone }: { label: string; totals: Totals; tone: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-lg font-semibold">{formatMoney(totals.amount)}</p>
      <p className="text-xs opacity-80">{totals.count} servicio{totals.count === 1 ? "" : "s"}</p>
    </div>
  );
}

const sum = (list: CompanyBooking[], pick: (b: CompanyBooking) => number | null): Totals => ({
  count: list.length,
  amount: list.reduce((s, b) => s + (Number(pick(b)) || 0), 0),
});

/** Totales de facturación y pago a conductores de los viajes empresariales (sin cancelados). */
export const CorporateBillingSummary: React.FC<{ companyId: string | null }> = ({ companyId }) => {
  const [totals, setTotals] = useState<{ pending: Totals; invoiced: Totals; unpaid: Totals } | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await CompaniesService.listBookings({ companyId }, "admin")).filter(isBillableTrip);
      setTotals({
        pending: sum(rows.filter((r) => r.estado_facturacion === "sin_facturar"), companyCharge),
        invoiced: sum(rows.filter((r) => r.estado_facturacion === "facturado"), companyCharge),
        unpaid: sum(rows.filter((r) => r.estado_pago_conductor === "sin_pagar"), (b) => b.driver_share ?? b.total_cost),
      });
    } catch {
      setTotals(null);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!totals) return null;
  return (
    <div className="mb-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard label="Por facturar (completados)" totals={totals.pending} tone="border-sky-200 bg-sky-50 text-sky-800" />
        <SummaryCard label="Facturado" totals={totals.invoiced} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <SummaryCard label="Pendiente de pago a conductores" totals={totals.unpaid} tone="border-orange-200 bg-orange-50 text-orange-800" />
      </div>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800"
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
        Actualizar totales
      </button>
    </div>
  );
};

export default CorporateBillingSummary;
