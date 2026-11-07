import React, { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import { CompaniesService, type Company, type CompanyTariff } from "@/services/companies.service";
import { toast } from "@/utils/toast";

/**
 * Admin: % T+Plus y comisión PayU propios de una empresa. Los viajes nuevos de la empresa toman estos valores;
 * cada viaje se puede seguir ajustando desde su detalle.
 */
export const CompanyTariffModal: React.FC<{ company: Company | null; onClose: () => void }> = ({ company, onClose }) => {
  const [tariff, setTariff] = useState<CompanyTariff | null>(null);
  const [percent, setPercent] = useState("");
  const [payu, setPayu] = useState("");
  const [applyToUninvoiced, setApplyToUninvoiced] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!company) return;
    setTariff(null);
    setApplyToUninvoiced(false);
    CompaniesService.getCompanyTariff(company.id)
      .then((t) => {
        setTariff(t);
        setPercent(String(t.porcentaje_tplus));
        setPayu(String(t.payu_comision));
      })
      .catch((e) => {
        toast.error(errorMessage(e, "No se pudo cargar la tarifa de la empresa"));
        onClose();
      });
  }, [company, onClose]);

  if (!company) return null;

  async function save(reset: boolean) {
    if (!company) return;
    const p = reset ? null : Number(percent);
    const fee = reset ? null : Number(payu);
    if (p !== null && (percent.trim() === "" || !Number.isFinite(p) || p < 0 || p > 100)) {
      toast.error("El porcentaje T+Plus debe estar entre 0 y 100.");
      return;
    }
    if (fee !== null && (payu.trim() === "" || !Number.isFinite(fee) || fee < 0)) {
      toast.error("La comisión PayU no puede ser negativa.");
      return;
    }
    setSaving(true);
    try {
      const n = await CompaniesService.setCompanyTariff(company.id, p, fee, applyToUninvoiced);
      toast.success(
        `${reset ? "La empresa vuelve a los valores por defecto." : "Tarifa de la empresa guardada."}` +
          (applyToUninvoiced ? ` ${n} viaje${n === 1 ? "" : "s"} sin facturar reliquidado${n === 1 ? "" : "s"}.` : "")
      );
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo guardar la tarifa de la empresa"));
    } finally {
      setSaving(false);
    }
  }

  const custom = !!tariff && (tariff.porcentaje_personalizado || tariff.payu_personalizado);

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Tarifa de ${company.nombre_comercial || company.razon_social}`}
      footer={
        <>
          {custom && (
            <Button variant="secondary" onClick={() => void save(true)} disabled={saving}>
              Usar valores por defecto
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => void save(false)} disabled={saving || !tariff}>
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </>
      }
    >
      {!tariff ? (
        <p className="py-6 text-center text-sm text-slate-400">Cargando tarifa…</p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Los viajes nuevos de esta empresa se liquidan con estos valores. Por defecto: {tariff.porcentaje_defecto} % y{" "}
            {formatMoney(tariff.payu_defecto)}.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-500">
              % T+Plus
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                {tariff.porcentaje_personalizado ? "Propio de la empresa" : "Valor por defecto"}
              </span>
            </label>
            <label className="text-xs font-medium text-slate-500">
              Comisión PayU (COP)
              <input
                type="number"
                min={0}
                step={100}
                value={payu}
                onChange={(e) => setPayu(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800"
              />
              <span className="mt-1 block text-[11px] font-normal text-slate-400">
                {tariff.payu_personalizado ? "Propio de la empresa" : "Valor por defecto"}
              </span>
            </label>
          </div>
          <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={applyToUninvoiced}
              onChange={(e) => setApplyToUninvoiced(e.target.checked)}
            />
            <span>
              Aplicar también a los viajes de esta empresa que aún no se han facturado
              <span className="block text-xs text-slate-500">Los viajes ya facturados no cambian.</span>
            </span>
          </label>
          {tariff.actualizado_por && (
            <p className="text-xs text-slate-400">
              Última modificación: {tariff.actualizado_por}
              {tariff.actualizado_en ? ` · ${formatDateTime(tariff.actualizado_en)}` : ""}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
};

export default CompanyTariffModal;
