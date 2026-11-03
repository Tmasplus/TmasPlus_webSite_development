import React, { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { errorMessage, formatDateTime } from "@/components/companies/format";
import { CompaniesService, type ChargeParam, type ChargeParamKey } from "@/services/companies.service";
import { toast } from "@/utils/toast";

const PARAM_LABELS: Record<ChargeParamKey, { label: string; unit: string }> = {
  porcentaje_tplus: { label: "P. T+Plus", unit: "%" },
  payu_comision: { label: "Comisión PayU", unit: "COP" },
  paquete_polizas: { label: "Paquete de pólizas", unit: "COP" },
  factor_procesamiento: { label: "Procesamiento de datos", unit: "% del valor T+Plus" },
  iva_procesamiento: { label: "IVA del procesamiento", unit: "%" },
};

/** Admin: valores con que se liquida cada viaje empresarial nuevo. No modifica viajes ya creados. */
export const ChargeDefaultsCard: React.FC = () => {
  const [params, setParams] = useState<ChargeParam[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<ChargeParamKey | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await CompaniesService.listChargeParams();
      setParams(list);
      setDraft(Object.fromEntries(list.map((p) => [p.clave, String(p.valor)])));
    } catch {
      setParams([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (params.length === 0) return null;

  async function save(p: ChargeParam) {
    const value = Number(draft[p.clave]);
    if (!Number.isFinite(value) || value < 0) {
      toast.error("Ingresa un valor válido.");
      return;
    }
    setSaving(p.clave);
    try {
      await CompaniesService.setChargeParam(p.clave, value);
      toast.success("Valor por defecto actualizado. Aplica a los viajes empresariales nuevos.");
      await load();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar el valor"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <SlidersHorizontal size={16} className="text-sky-600" />
          Valores de cobro a empresas
          <span className="font-normal text-slate-500">
            · T+Plus {params.find((p) => p.clave === "porcentaje_tplus")?.valor ?? "-"} % por defecto
          </span>
        </span>
        {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3">
          <p className="mb-3 text-xs text-slate-500">
            Cobro a la empresa = costo del viaje (lo que se le paga al conductor) + hosting tecnológico (P. T+Plus menos
            procesamiento, más PayU) + pólizas + procesamiento de datos + IVA. Estos valores se copian a cada viaje nuevo;
            el porcentaje y la comisión PayU de un viaje puntual se ajustan desde su detalle.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {params.map((p) => {
              const meta = PARAM_LABELS[p.clave];
              const dirty = Number(draft[p.clave]) !== p.valor;
              return (
                <div key={p.clave} className="rounded-xl border border-slate-200 p-3">
                  <label className="text-xs font-medium text-slate-500">
                    {meta?.label ?? p.clave} <span className="text-slate-400">({meta?.unit})</span>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={draft[p.clave] ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, [p.clave]: e.target.value }))}
                      className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                    />
                  </label>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      {p.actualizado_en ? `Actualizado ${formatDateTime(p.actualizado_en)}` : ""}
                    </span>
                    <Button
                      className="!px-3 !py-1 !text-xs"
                      disabled={!dirty || saving !== null}
                      onClick={() => void save(p)}
                    >
                      {saving === p.clave ? "Guardando..." : "Guardar"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChargeDefaultsCard;
