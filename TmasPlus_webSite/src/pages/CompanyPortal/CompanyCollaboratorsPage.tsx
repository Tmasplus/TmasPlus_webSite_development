import { useNavigate } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { DemoNotice } from "@/components/companies/CompanyUi";
import { CollaboratorsPanel } from "@/components/companies/CollaboratorsPanel";
import { CompanyScopeRequired } from "@/components/companies/CompanyScopeRequired";

export default function CompanyCollaboratorsPage() {
  const navigate = useNavigate();
  return (
    <CompanyScopeRequired>
      {({ companyId, companyName }) => (
        <Page title="Colaboradores">
          <DemoNotice />
          <p className="mb-4 text-sm text-slate-500">
            Personas de la empresa que pueden viajar a nombre de ella. Cada colaborador es un Usuario App de T+Plus
            vinculado a la empresa.
          </p>
          <CollaboratorsPanel
            companyId={companyId}
            companyName={companyName}
            onRequestTrip={(c) => navigate(`/empresa/reservar?colaborador=${c.id}`)}
          />
        </Page>
      )}
    </CompanyScopeRequired>
  );
}
