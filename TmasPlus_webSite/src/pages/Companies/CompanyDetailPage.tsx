import React, { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { DemoNotice } from "@/components/companies/CompanyUi";
import { errorMessage } from "@/components/companies/format";
import { CompanyInfoCard } from "@/components/companies/CompanyInfoCard";
import { CollaboratorsPanel } from "@/components/companies/CollaboratorsPanel";
import { CompanyBookingsPanel } from "@/components/companies/CompanyBookingsPanel";
import { CorporateBillingSummary } from "@/components/companies/CorporateBillingSummary";
import { BookingHistoryView } from "@/pages/BookingHistory/BookingHistoryPage";
import { COMPANIES_BACKEND_READY, CompaniesService, type Company } from "@/services/companies.service";
import { startCompanyPreview } from "@/utils/companyPreview";
import { toast } from "@/utils/toast";
import { CompanyFormModal } from "./CompanyFormModal";

const TABS = [
  { value: "info", label: "Información" },
  { value: "colaboradores", label: "Colaboradores" },
  { value: "viajes", label: "Viajes y facturación" },
];

export const CompanyDetailPage: React.FC = () => {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("info");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCompany(await CompaniesService.get(id));
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo cargar la empresa"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function viewPortal() {
    if (!company) return;
    startCompanyPreview({ id: company.id, name: company.nombre_comercial || company.razon_social });
    navigate("/empresa/inicio");
  }

  async function toggleActive() {
    if (!company) return;
    const next = !company.activo;
    if (!next && !window.confirm(`¿Desactivar ${company.razon_social}? No podrá ingresar al portal ni solicitar viajes.`)) {
      return;
    }
    setBusy(true);
    try {
      await CompaniesService.setActive(company.id, next);
      setCompany({ ...company, activo: next });
      toast.success(next ? "Empresa activada." : "Empresa desactivada.");
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar la empresa"));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-slate-500 text-sm">Cargando empresa...</div>;
  }

  if (!company) {
    return (
      <Page title="Empresa">
        <EmptyState
          title="Empresa no encontrada"
          subtitle="Puede que haya sido eliminada o que el enlace no sea correcto."
          action={<Button onClick={() => navigate("/empresas")}>Volver a empresas</Button>}
        />
      </Page>
    );
  }

  return (
    <Page
      title={company.nombre_comercial || company.razon_social}
      actions={
        <>
          <Button variant="secondary" className="!px-3 !py-2" onClick={() => setEditOpen(true)}>
            <Pencil size={16} />
            Editar
          </Button>
          <Button
            variant="secondary"
            className={company.activo ? "!px-3 !py-2 !text-red-700 !border-red-300" : "!px-3 !py-2 !text-green-700 !border-green-300"}
            onClick={toggleActive}
            disabled={busy}
          >
            {company.activo ? "Desactivar" : "Activar"}
          </Button>
          <Button className="!px-4 !py-2" onClick={viewPortal} disabled={!company.activo} title={company.activo ? undefined : "Activa la empresa para ver su portal"}>
            <Eye size={16} />
            Ver portal de la empresa
          </Button>
        </>
      }
    >
      <Link to="/empresas" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} />
        Todas las empresas
      </Link>
      <DemoNotice />
      <div className="mb-4">
        <Tabs tabs={TABS} value={tab} onChange={setTab} />
      </div>

      {tab === "info" && <CompanyInfoCard company={company} />}
      {tab === "colaboradores" && (
        <CollaboratorsPanel companyId={company.id} companyName={company.razon_social} />
      )}
      {tab === "viajes" &&
        (COMPANIES_BACKEND_READY ? (
          <>
            <CorporateBillingSummary companyId={company.id} />
            <BookingHistoryView corporate={{ companyId: company.id }} embedded />
          </>
        ) : (
          <CompanyBookingsPanel companyId={company.id} viewer="admin" />
        ))}

      <CompanyFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        company={company}
        onSaved={(saved) => setCompany(saved)}
      />
    </Page>
  );
};

export default CompanyDetailPage;
