import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Download, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActiveBadge } from "@/components/companies/CompanyUi";
import { CollaboratorFormModal } from "@/components/companies/CollaboratorFormModal";
import { errorMessage, formatDate } from "@/components/companies/format";
import { getDocumentTypeLabel } from "@/config/constants";
import { useDebounced } from "@/hooks/useDebounced";
import {
  CompaniesService,
  collaboratorFullName,
  type Collaborator,
} from "@/services/companies.service";
import { exportToCsv } from "@/utils/exportCsv";
import { toast } from "@/utils/toast";

type StatusFilter = "todos" | "activos" | "inactivos";

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

type Props = {
  companyId: string;
  companyName?: string;
  /** Si se pasa, cada fila ofrece "Solicitar viaje" para ese colaborador. */
  onRequestTrip?: (collaborator: Collaborator) => void;
};

export const CollaboratorsPanel: React.FC<Props> = ({ companyId, companyName, onRequestTrip }) => {
  const [rows, setRows] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("activos");
  const [openAdd, setOpenAdd] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dq = useDebounced(query, 250);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await CompaniesService.listCollaborators(companyId));
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar los colaboradores"));
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = norm(dq.trim());
    return rows.filter((c) => {
      if (status === "activos" && !c.activo) return false;
      if (status === "inactivos" && c.activo) return false;
      if (!q) return true;
      return [collaboratorFullName(c), c.email, c.mobile, c.document_number, c.cargo, c.area].some((v) =>
        norm(v).includes(q)
      );
    });
  }, [rows, dq, status]);

  async function toggleActive(c: Collaborator) {
    const next = !c.activo;
    if (!next && !window.confirm(`¿Desactivar a ${collaboratorFullName(c)}? Ya no se podrán solicitar viajes a su nombre.`)) {
      return;
    }
    setBusyId(c.id);
    try {
      await CompaniesService.setCollaboratorActive(companyId, c.id, next);
      setRows((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: next } : x)));
      toast.success(next ? "Colaborador activado." : "Colaborador desactivado.");
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar el colaborador"));
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    if (filtered.length === 0) {
      toast.info("No hay colaboradores para exportar.");
      return;
    }
    exportToCsv(`colaboradores_${(companyName || "empresa").replace(/\s+/g, "_")}`, filtered, [
      { header: "Nombre", value: (c) => collaboratorFullName(c) },
      { header: "Tipo documento", value: (c) => getDocumentTypeLabel(c.document_type) },
      { header: "Documento", value: (c) => c.document_number },
      { header: "Correo", value: (c) => c.email },
      { header: "Teléfono", value: (c) => c.mobile },
      { header: "Ciudad", value: (c) => c.city },
      { header: "Cargo", value: (c) => c.cargo },
      { header: "Área", value: (c) => c.area },
      { header: "Estado", value: (c) => (c.activo ? "Activo" : "Inactivo") },
      { header: "Alta", value: (c) => c.creado_en },
    ]);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="min-w-[220px] flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
          <Input
            placeholder="Nombre, correo, teléfono, documento, cargo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar colaboradores"
          />
        </div>
        <div className="w-44">
          <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
          <select
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="!px-3 !py-2" onClick={load} title="Refrescar">
            <RefreshCw size={16} />
          </Button>
          <Button variant="secondary" className="!px-3 !py-2" onClick={exportCsv}>
            <Download size={16} />
            Exportar CSV
          </Button>
          <Button className="!px-4 !py-2" onClick={() => setOpenAdd(true)}>
            <Plus size={16} />
            Añadir colaborador
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
      )}

      <Card title={`Colaboradores · ${filtered.length}${filtered.length !== rows.length ? ` de ${rows.length}` : ""}`}>
        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Cargando colaboradores...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? "Aún no hay colaboradores" : "Sin resultados"}
            subtitle={
              rows.length === 0
                ? "Agrega a las personas de la empresa que podrán viajar a nombre de ella."
                : "Ajusta la búsqueda o el filtro de estado."
            }
            action={
              rows.length === 0 ? (
                <Button onClick={() => setOpenAdd(true)}>
                  <Plus size={16} />
                  Añadir colaborador
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Colaborador</th>
                  <th className="px-3 py-2 font-medium">Documento</th>
                  <th className="px-3 py-2 font-medium">Correo</th>
                  <th className="px-3 py-2 font-medium">Teléfono</th>
                  <th className="px-3 py-2 font-medium">Cargo / Área</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Alta</th>
                  <th className="px-3 py-2 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        {c.profile_image ? (
                          <img
                            src={c.profile_image}
                            alt={`Foto de ${collaboratorFullName(c)}`}
                            className="w-9 h-9 rounded-full object-cover border border-slate-200"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-semibold">
                            {(c.first_name?.[0] || "?").toUpperCase()}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-slate-800">{collaboratorFullName(c)}</div>
                          <div className="text-xs text-slate-400">{c.city}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="text-slate-500">{c.document_type}</span>{" "}
                      <span className="font-mono text-slate-700">{c.document_number}</span>
                    </td>
                    <td className="px-3 py-3">{c.email}</td>
                    <td className="px-3 py-3">{c.mobile}</td>
                    <td className="px-3 py-3">
                      <div className="text-slate-700">{c.cargo || "—"}</div>
                      {c.area && <div className="text-xs text-slate-400">{c.area}</div>}
                    </td>
                    <td className="px-3 py-3">
                      <ActiveBadge active={c.activo} activeLabel="Activo" inactiveLabel="Inactivo" />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{formatDate(c.creado_en)}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-2 flex-wrap">
                        {onRequestTrip && c.activo && (
                          <Button className="!px-3 !py-1.5 !text-xs" onClick={() => onRequestTrip(c)}>
                            <CalendarPlus size={14} />
                            Solicitar viaje
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => toggleActive(c)}
                          disabled={busyId === c.id}
                          className={
                            c.activo
                              ? "!px-3 !py-1.5 !text-xs !text-red-700 !border-red-300"
                              : "!px-3 !py-1.5 !text-xs !text-green-700 !border-green-300"
                          }
                        >
                          {busyId === c.id ? "..." : c.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CollaboratorFormModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        companyId={companyId}
        onSaved={() => load()}
      />
    </div>
  );
};

export default CollaboratorsPanel;
