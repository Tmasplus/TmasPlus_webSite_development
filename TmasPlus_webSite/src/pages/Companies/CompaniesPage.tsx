import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Download, Eye, Pencil, Percent, Plus, RefreshCw } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActiveBadge, CompanyLogo, DemoNotice } from "@/components/companies/CompanyUi";
import { CompanyBookingsPanel } from "@/components/companies/CompanyBookingsPanel";
import { CorporateBillingSummary } from "@/components/companies/CorporateBillingSummary";
import { ChargeDefaultsCard } from "@/components/companies/ChargeDefaultsCard";
import { CompanyTariffModal } from "@/components/companies/CompanyTariffModal";
import { BookingHistoryView } from "@/pages/BookingHistory/BookingHistoryPage";
import { errorMessage, formatDate } from "@/components/companies/format";
import { useDebounced } from "@/hooks/useDebounced";
import {
  COMPANIES_BACKEND_READY,
  CompaniesService,
  companyTypeLabel,
  outdatedDocuments,
  type Company,
} from "@/services/companies.service";
import { exportToCsv } from "@/utils/exportCsv";
import { formatNit } from "@/utils/nit";
import { toast } from "@/utils/toast";
import { CompanyFormModal } from "./CompanyFormModal";

type StatusFilter = "todas" | "activas" | "inactivas";
type SortFilter = "fecha_desc" | "fecha_asc" | "nombre_asc";

const TABS = [
  { value: "empresas", label: "Empresas" },
  { value: "facturacion", label: "Cobros y facturación" },
];

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export const CompaniesPage: React.FC = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "facturacion" ? "facturacion" : "empresas";
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todas");
  const [sortBy, setSortBy] = useState<SortFilter>("fecha_desc");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tariffCompany, setTariffCompany] = useState<Company | null>(null);
  const closeTariff = useCallback(() => setTariffCompany(null), []);
  const dq = useDebounced(query, 250);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCompanies(await CompaniesService.list());
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar las empresas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = norm(dq.trim());
    const list = companies.filter((c) => {
      if (status === "activas" && !c.activo) return false;
      if (status === "inactivas" && c.activo) return false;
      if (!q) return true;
      return [c.razon_social, c.nombre_comercial, c.nit, c.acceso_email, c.correo_corporativo, c.ciudad].some((v) =>
        norm(v).includes(q)
      );
    });
    return [...list].sort((a, b) => {
      if (sortBy === "nombre_asc") return a.razon_social.localeCompare(b.razon_social, "es");
      if (sortBy === "fecha_asc") return a.creado_en.localeCompare(b.creado_en);
      return b.creado_en.localeCompare(a.creado_en);
    });
  }, [companies, dq, status, sortBy]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(c: Company) {
    setEditing(c);
    setFormOpen(true);
  }

  async function toggleActive(c: Company) {
    const next = !c.activo;
    if (
      !next &&
      !window.confirm(
        `¿Desactivar ${c.razon_social}? La empresa no podrá ingresar al portal ni solicitar viajes hasta que la actives de nuevo.`
      )
    ) {
      return;
    }
    setBusyId(c.id);
    try {
      await CompaniesService.setActive(c.id, next);
      setCompanies((prev) => prev.map((x) => (x.id === c.id ? { ...x, activo: next } : x)));
      toast.success(next ? "Empresa activada." : "Empresa desactivada.");
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar la empresa"));
    } finally {
      setBusyId(null);
    }
  }

  function exportCsv() {
    if (filtered.length === 0) {
      toast.info("No hay empresas para exportar.");
      return;
    }
    exportToCsv("empresas", filtered, [
      { header: "Razón social", value: (c) => c.razon_social },
      { header: "Nombre comercial", value: (c) => c.nombre_comercial },
      { header: "NIT", value: (c) => formatNit(c.nit, c.dv) },
      { header: "Tipo", value: (c) => companyTypeLabel(c) },
      { header: "CIIU", value: (c) => c.ciiu },
      { header: "Correo corporativo", value: (c) => c.correo_corporativo },
      { header: "Correo de facturación", value: (c) => c.correo_facturacion },
      { header: "Teléfono", value: (c) => c.telefono },
      { header: "Departamento", value: (c) => c.departamento },
      { header: "Ciudad", value: (c) => c.ciudad },
      { header: "Dirección", value: (c) => c.direccion },
      { header: "Representante legal", value: (c) => c.rep_nombre },
      { header: "Correo de acceso", value: (c) => c.acceso_email },
      { header: "Colaboradores activos", value: (c) => c.total_colaboradores },
      { header: "Viajes", value: (c) => c.total_viajes },
      { header: "Estado", value: (c) => (c.activo ? "Activa" : "Inactiva") },
      { header: "Alta", value: (c) => c.creado_en },
    ]);
  }

  return (
    <Page
      title={`Empresas${companies.length ? ` (${companies.length})` : ""}`}
      actions={
        tab === "empresas" ? (
          <>
            <Button variant="secondary" className="!px-3 !py-2" onClick={load} title="Refrescar">
              <RefreshCw size={16} />
            </Button>
            <Button variant="secondary" className="!px-3 !py-2" onClick={exportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
            <Button className="!px-4 !py-2" onClick={openCreate}>
              <Plus size={16} />
              Añadir empresa
            </Button>
          </>
        ) : undefined
      }
    >
      <DemoNotice />
      <div className="mb-4">
        <Tabs tabs={TABS} value={tab} onChange={(v) => setParams(v === "facturacion" ? { tab: "facturacion" } : {})} />
      </div>

      {tab === "facturacion" ? (
        COMPANIES_BACKEND_READY ? (
          <>
            <ChargeDefaultsCard />
            <CorporateBillingSummary companyId={null} />
            <BookingHistoryView corporate={{ companyId: null }} embedded />
          </>
        ) : (
          <CompanyBookingsPanel companyId={null} viewer="admin" />
        )
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
              <Input
                placeholder="Razón social, NIT, correo, ciudad..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar empresas"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Estado</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                value={status}
                onChange={(e) => setStatus(e.target.value as StatusFilter)}
              >
                <option value="todas">Todas</option>
                <option value="activas">Activas</option>
                <option value="inactivas">Inactivas</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Ordenar por</label>
              <select
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortFilter)}
              >
                <option value="fecha_desc">Más recientes primero</option>
                <option value="fecha_asc">Más antiguas primero</option>
                <option value="nombre_asc">Alfabético (A-Z)</option>
              </select>
            </div>
          </div>

          {error && (
            <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
          )}

          <Card title={`Empresas registradas · ${filtered.length}${filtered.length !== companies.length ? ` de ${companies.length}` : ""}`}>
            {loading ? (
              <div className="p-6 text-center text-slate-500 text-sm">Cargando empresas...</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={companies.length === 0 ? "Aún no hay empresas" : "Sin resultados"}
                subtitle={
                  companies.length === 0
                    ? "Crea la primera empresa para habilitar su portal corporativo."
                    : "Ajusta la búsqueda o los filtros."
                }
                action={
                  companies.length === 0 ? (
                    <Button onClick={openCreate}>
                      <Plus size={16} />
                      Añadir empresa
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Empresa</th>
                      <th className="px-3 py-2 font-medium">NIT</th>
                      <th className="px-3 py-2 font-medium">Ciudad</th>
                      <th className="px-3 py-2 font-medium">Correo de acceso</th>
                      <th className="px-3 py-2 font-medium text-center">Colaboradores</th>
                      <th className="px-3 py-2 font-medium text-center">Viajes</th>
                      <th className="px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2 font-medium">Alta</th>
                      <th className="px-3 py-2 font-medium text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => navigate(`/empresas/${c.id}`)}
                            className="flex items-center gap-3 text-left"
                          >
                            <CompanyLogo src={c.logo_url} name={c.razon_social} />
                            <div>
                              <div className="font-medium text-slate-800 hover:text-sky-700">{c.razon_social}</div>
                              <div className="text-xs text-slate-400">
                                {c.nombre_comercial ? `${c.nombre_comercial} · ` : ""}
                                {companyTypeLabel(c)}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-slate-700 whitespace-nowrap">{formatNit(c.nit, c.dv)}</td>
                        <td className="px-3 py-3">{c.ciudad}</td>
                        <td className="px-3 py-3">{c.acceso_email}</td>
                        <td className="px-3 py-3 text-center">{c.total_colaboradores}</td>
                        <td className="px-3 py-3 text-center">{c.total_viajes}</td>
                        <td className="px-3 py-3">
                          <ActiveBadge active={c.activo} />
                          {outdatedDocuments(c).length > 0 && (
                            <div
                              className="mt-1 text-[11px] font-medium text-amber-700"
                              title={`Por actualizar: ${outdatedDocuments(c).join(", ")}`}
                            >
                              Documentos por actualizar
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDate(c.creado_en)}</td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-2 flex-wrap">
                            <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => navigate(`/empresas/${c.id}`)}>
                              <Eye size={14} />
                              Ver
                            </Button>
                            <button
                              type="button"
                              onClick={() => openEdit(c)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100"
                            >
                              <Pencil size={13} />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => setTariffCompany(c)}
                              title="% T+Plus y comisión PayU de esta empresa"
                              className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 shadow-sm transition-colors hover:bg-sky-100"
                            >
                              <Percent size={13} />
                              Tarifa
                            </button>
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
        </>
      )}

      <CompanyFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        company={editing}
        onSaved={() => load()}
      />
      <CompanyTariffModal company={tariffCompany} onClose={closeTariff} />
    </Page>
  );
};

export default CompaniesPage;
