import React from "react";
import { CHARGE_CONCEPTS, isBillableTrip, type CompanyBooking } from "@/services/companies.service";
import { formatMoney } from "./format";

const cell = "border border-slate-200 px-3 py-1.5";
const head = "bg-cyan-300/80 font-semibold text-slate-900";

function Amount({ value }: { value: number | null }) {
  return value === null ? (
    <span className="text-xs italic text-slate-400">Por definir</span>
  ) : (
    <span className="tabular-nums">{formatMoney(value)}</span>
  );
}

/** Liquidación de un servicio empresarial con el formato de la factura (Dataico / SIIGO). */
export const ServiceLiquidation: React.FC<{ booking: CompanyBooking }> = ({ booking }) => {
  const cancelled = booking.status === "CANCELLED";
  const billable = isBillableTrip(booking);
  // Cancelado: no se factura nada. En curso: los valores son la estimación hasta que se complete.
  const amountOf = (codigo: string) =>
    cancelled ? 0 : booking.cobros.find((c) => c.concepto === codigo)?.monto ?? null;
  const pending = !cancelled && CHARGE_CONCEPTS.some((c) => amountOf(c.codigo) === null);
  const total = CHARGE_CONCEPTS.reduce((sum, c) => sum + (amountOf(c.codigo) ?? 0), 0);
  const totalLabel = cancelled ? "Viaje cancelado: no se factura" : billable ? "El cliente pagó Empresarial" : "Estimado (aún no se factura)";

  const groups: { nombre: string; monto: number | null }[] = [];
  for (const c of CHARGE_CONCEPTS) {
    const value = amountOf(c.codigo);
    const group = groups.find((g) => g.nombre === c.grupo_factura);
    if (!group) groups.push({ nombre: c.grupo_factura, monto: value });
    else group.monto = group.monto === null || value === null ? null : group.monto + value;
  }

  return (
    <div className="space-y-3">
      {cancelled && (
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-700">
          Este viaje se canceló: no se le factura nada a la empresa.
        </p>
      )}
      {!cancelled && !billable && (
        <p className="rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800">
          El viaje aún no se completa: se facturará a la empresa cuando termine. Los valores son estimados.
        </p>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-sm">
        <table className="w-full border-collapse">
          <thead>
            <tr><th colSpan={2} className={`${cell} ${head} text-center`}>Datos del servicio</th></tr>
          </thead>
          <tbody>
            <tr><td className={`${cell} ${head}`}>Nombre del conductor</td><td className={cell}>{booking.driver_name || "Sin asignar"}</td></tr>
            <tr><td className={`${cell} ${head}`}>Nombre de la empresa</td><td className={cell}>{booking.company_name}</td></tr>
            <tr><td className={`${cell} ${head}`}>Referencia del servicio</td><td className={`${cell} font-mono`}>{booking.reference}</td></tr>
            <tr><td className={`${cell} ${head}`}>Colaborador</td><td className={cell}>{booking.collaborator_name}</td></tr>
            {CHARGE_CONCEPTS.map((c) => (
              <tr key={c.codigo}>
                <td className={`${cell} ${head}`}>{c.nombre}</td>
                <td className={`${cell} text-right`}><Amount value={amountOf(c.codigo)} /></td>
              </tr>
            ))}
            <tr>
              <td className={`${cell} bg-[#0b3a53] font-semibold text-cyan-200`}>{totalLabel}</td>
              <td className={`${cell} bg-[#0b3a53] text-right font-semibold text-cyan-200 tabular-nums`}>{formatMoney(total)}</td>
            </tr>
          </tbody>
        </table>

        <table className="w-full border-collapse">
          <thead>
            <tr><th colSpan={2} className={`${cell} ${head} text-center`}>Para factura</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.nombre}>
                <td className={`${cell} text-xs text-sky-800`}>{g.nombre}</td>
                <td className={`${cell} text-right`}><Amount value={g.monto} /></td>
              </tr>
            ))}
            <tr>
              <td className={`${cell} bg-[#0b3a53] font-semibold text-white`}>Total neto</td>
              <td className={`${cell} bg-[#0b3a53] text-right font-semibold text-white tabular-nums`}>{formatMoney(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {pending && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Total parcial: los cobros adicionales para empresas (hosting, pólizas, procesamiento de datos, IVA y
          comisiones) se calcularán cuando se defina la lógica de cobro.
        </p>
      )}
    </div>
  );
};

export default ServiceLiquidation;
