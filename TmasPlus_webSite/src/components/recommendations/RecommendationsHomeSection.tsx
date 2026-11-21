import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Handshake,
  LifeBuoy,
  MessageSquareWarning,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { classNames } from "@/utils/classNames";
import { formatMoney } from "@/components/companies/format";
import type { RecommendationSummary } from "@/services/recommendations.service";

const TONES = {
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  slate: "bg-slate-100 text-slate-600",
} as const;

function SettlementCard({
  to,
  icon: Icon,
  label,
  hint,
  value,
  sub,
  tone,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  value: number;
  sub?: string;
  tone: keyof typeof TONES;
}) {
  return (
    <Link
      to={to}
      title={`${hint}. Clic para ver el detalle.`}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
    >
      <span className={classNames("flex h-9 w-9 items-center justify-center rounded-xl", TONES[tone])}>
        <Icon size={17} />
      </span>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      <p className="text-xs font-medium text-slate-600">{label}</p>
      {sub && <p className="mt-0.5 text-[11px] text-slate-400">{sub}</p>}
    </Link>
  );
}

/** Inicio del admin: liquidaciones entre conductores de las reservas recomendadas (aparte de la operación normal). */
export function RecommendationsHomeSection({ summary }: { summary: RecommendationSummary | null }) {
  if (!summary) return null;
  const trips = "/bookingRecommended";
  const support = "/bookingRecommended?tab=soporte";

  return (
    <section className="rounded-3xl border border-sky-100 bg-sky-50/40 p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
            <Handshake size={20} />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Reservas recomendadas · pagos entre conductores</h2>
            <p className="text-sm text-slate-500">
              {summary.totalTrips} viajes recomendados · {summary.activeTrips} en curso · por pagar{" "}
              <strong className="text-slate-700">{formatMoney(summary.amountToPay)}</strong> · pagado{" "}
              <strong className="text-slate-700">{formatMoney(summary.amountPaid)}</strong>
            </p>
          </div>
        </div>
        {summary.needsAttention > 0 && (
          <Link
            to={support}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-600"
          >
            <AlertTriangle size={16} />
            {summary.needsAttention} por revisar en soporte
          </Link>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <SettlementCard
          to={trips}
          icon={Clock3}
          label="Sin pagar"
          hint="El solicitante aún no reporta el pago y sigue dentro de las 24 h"
          value={summary.unpaid}
          tone="amber"
        />
        <SettlementCard
          to={support}
          icon={AlertTriangle}
          label="Sin pagar vencidas"
          hint="Pasaron las 24 h y el solicitante no reportó el pago"
          value={summary.unpaidOverdue}
          tone="rose"
        />
        <SettlementCard
          to={trips}
          icon={Wallet}
          label="Pagadas sin confirmar"
          hint="El solicitante reportó el pago; falta que el otro conductor confirme"
          value={summary.paidUnconfirmed}
          sub={summary.paidUnconfirmedOverdue ? `${summary.paidUnconfirmedOverdue} vencidas` : undefined}
          tone="sky"
        />
        <SettlementCard
          to={trips}
          icon={CheckCircle2}
          label="Confirmadas por ambos"
          hint="El solicitante pagó y el otro conductor confirmó que recibió"
          value={summary.confirmed}
          tone="emerald"
        />
        <SettlementCard
          to={support}
          icon={LifeBuoy}
          label="En disputa"
          hint="El solicitante dice que pagó y el otro conductor que no recibió"
          value={summary.disputed}
          tone="rose"
        />
        <SettlementCard
          to={trips}
          icon={ShieldCheck}
          label="Resueltas por soporte"
          hint="Cerradas por el administrador"
          value={summary.resolved}
          tone="slate"
        />
        <SettlementCard
          to={support}
          icon={MessageSquareWarning}
          label="Reportes de conductores"
          hint="Reportes a soporte que aún no tienen respuesta"
          value={summary.supportPending}
          tone="rose"
        />
      </div>
    </section>
  );
}
