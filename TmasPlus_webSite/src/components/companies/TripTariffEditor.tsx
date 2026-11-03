import React, { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import { CompaniesService, type CompanyBooking, type CompanyTripTariff } from "@/services/companies.service";
import { toast } from "@/utils/toast";

/**
 * Admin: porcentaje T+Plus y comisión PayU con que se liquida ESTE viaje. Cambiarlos reliquida el viaje sin tocar
 * los valores por defecto. Bloqueado cuando el servicio ya está facturado.
 */
export const TripTariffEditor: React.FC<{ booking: CompanyBooking; onSaved: () => void }> = ({ booking, onSaved }) => {
  const [tariff, setTariff] = useState<CompanyTripTariff | null>(null);
  const [percent, setPercent] = useState("");
  const [payu, setPayu] = useState("");
  const [saving, setSaving] = useState(false);
  const invoiced = booking.estado_facturacion === "facturado";

  const load = useCallback(async () => {
    try {
      const t = await CompaniesService.getTripTariff(booking.id);
      setTariff(t);
      setPercent(t ? String(t.porcentaje_tplus) : "");
      setPayu(t ? String(t.payu_comision) : "");
    } catch {
      setTariff(null);
    }
  }, [booking.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!tariff) return null;

  const dirty = Number(percent) !== tariff.porcentaje_tplus || Number(payu) !== tariff.payu_comision;

  async function save() {
    const p = Number(percent);
    const fee = Number(payu);
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      toast.error("El porcentaje T+Plus debe estar entre 0 y 100.");
      return;
    }
    if (!Number.isFinite(fee) || fee < 0) {
      toast.error("La comisión PayU no puede ser negativa.");
      return;
    }
    setSaving(true);
    try {
      await CompaniesService.setTripTariff(booking.id, p, fee);
      toast.success("Tarifa del viaje actualizada y liquidación recalculada.");
      await load();
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar la tarifa del viaje"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-500">
          % T+Plus de este viaje
          <input
            type="number"
            min={0}
            max={100}
            step={0.1}
            value={percent}
            disabled={invoiced || saving}
            onChange={(e) => setPercent(e.target.value)}
            className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100"
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          Comisión PayU (COP)
          <input
            type="number"
            min={0}
            step={100}
            value={payu}
            disabled={invoiced || saving}
            onChange={(e) => setPayu(e.target.value)}
            className="mt-1 block w-36 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-100"
          />
        </label>
        {!invoiced && (
          <Button className="!px-3 !py-1.5 !text-xs" onClick={save} disabled={!dirty || saving}>
            {saving ? "Guardando..." : "Guardar y reliquidar"}
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Pólizas {formatMoney(tariff.paquete_polizas)} · Procesamiento {tariff.factor_procesamiento} % del valor T+Plus ·
        IVA {tariff.iva_procesamiento} %. Solo cambia este viaje; los valores por defecto se editan en Empresas › Cobros
        y facturación.
        {tariff.actualizado_por && (
          <> Ajustado por {tariff.actualizado_por} el {formatDateTime(tariff.actualizado_en)}.</>
        )}
        {invoiced && " El servicio ya está facturado: su tarifa no se puede cambiar."}
      </p>
    </div>
  );
};

export default TripTariffEditor;
