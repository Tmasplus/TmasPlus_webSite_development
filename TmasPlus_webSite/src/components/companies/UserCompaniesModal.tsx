import React, { useEffect, useMemo, useState } from "react";
import { Building2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { ActiveBadge } from "@/components/companies/CompanyUi";
import { errorMessage } from "@/components/companies/format";
import { CompaniesService, type CompanyLink, type CompanyOption } from "@/services/companies.service";
import { toast } from "@/utils/toast";

export type LinkableUser = {
  id: string;
  name: string;
  email: string | null;
  mobile: string | null;
  document_number: string | null;
};

type Props = {
  user: LinkableUser | null;
  links: CompanyLink[];
  companies: CompanyOption[];
  onClose: () => void;
  onChanged: () => void;
};

/** Empresas de un Usuario App: vincular a una empresa creada, desvincular o reactivar (solo admin). */
export const UserCompaniesModal: React.FC<Props> = ({ user, links, companies, onClose, onChanged }) => {
  const [companyId, setCompanyId] = useState("");
  const [cargo, setCargo] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setCompanyId("");
    setCargo("");
    setArea("");
    setBusy(null);
  }, [user?.id]);

  // Las empresas con un vínculo previo (activo o no) se gestionan desde la lista, no se vuelven a vincular.
  const available = useMemo(
    () => companies.filter((c) => c.active && !links.some((l) => l.companyId === c.id)),
    [companies, links]
  );

  if (!user) return null;

  async function link() {
    if (!user || !companyId) return;
    setBusy("link");
    try {
      await CompaniesService.linkExistingAppUser(companyId, user.id, {
        email: user.email ?? undefined,
        mobile: user.mobile ?? undefined,
        document_number: user.document_number ?? undefined,
        cargo,
        area,
      });
      toast.success(`${user.name} quedó vinculado a ${companies.find((c) => c.id === companyId)?.name ?? "la empresa"}.`);
      setCompanyId("");
      setCargo("");
      setArea("");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo vincular a la empresa"));
    } finally {
      setBusy(null);
    }
  }

  async function setActive(l: CompanyLink, active: boolean) {
    if (!user) return;
    if (!active && !window.confirm(`¿Desvincular a ${user.name} de ${l.companyName}? Ya no podrá viajar a nombre de esa empresa.`)) {
      return;
    }
    setBusy(l.companyId);
    try {
      await CompaniesService.setCollaboratorActive(l.companyId, user.id, active);
      toast.success(active ? "Vínculo reactivado." : "Desvinculado de la empresa.");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar el vínculo"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Empresas de ${user.name}`} size="lg">
      <div className="space-y-5">
        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Empresas vinculadas</h4>
          {links.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              Este usuario no está vinculado a ninguna empresa.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {links.map((l) => (
                <li key={l.companyId} className="flex flex-wrap items-center gap-3 px-3 py-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-50 text-sky-600">
                    <Building2 size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{l.companyName}</p>
                    <p className="text-xs text-slate-500">
                      {[l.cargo, l.area].filter(Boolean).join(" · ") || "Sin cargo ni área"}
                      {!l.companyActive && " · empresa inactiva"}
                    </p>
                  </div>
                  <ActiveBadge active={l.active} activeLabel="Vinculado" inactiveLabel="Desvinculado" />
                  <Button
                    variant="secondary"
                    disabled={!!busy}
                    onClick={() => setActive(l, !l.active)}
                    className={
                      l.active
                        ? "!px-3 !py-1.5 !text-xs !text-red-700 !border-red-300"
                        : "!px-3 !py-1.5 !text-xs !text-green-700 !border-green-300"
                    }
                  >
                    {busy === l.companyId ? "..." : l.active ? "Desvincular" : "Reactivar"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Vincular a una empresa</h4>
          {available.length === 0 ? (
            <p className="text-sm text-slate-500">
              {companies.length === 0
                ? "Aún no hay empresas creadas."
                : "No hay más empresas activas disponibles para vincular."}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-500 mb-1">Empresa</label>
                <select
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                >
                  <option value="">Selecciona una empresa…</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Cargo (opcional)</label>
                <Input value={cargo} onChange={(e) => setCargo(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Área (opcional)</label>
                <Input value={area} onChange={(e) => setArea(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full !py-2" disabled={!companyId || !!busy} onClick={link}>
                  {busy === "link" ? "Vinculando..." : "Vincular"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default UserCompaniesModal;
