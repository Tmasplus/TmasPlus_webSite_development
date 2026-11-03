import { useSearchParams } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { DemoNotice } from "@/components/companies/CompanyUi";
import { CompanyBookingsPanel } from "@/components/companies/CompanyBookingsPanel";
import { CompanyScopeRequired } from "@/components/companies/CompanyScopeRequired";

export default function CompanyBookingsPage() {
  const [params] = useSearchParams();
  return (
    <CompanyScopeRequired>
      {({ companyId, viewer }) => (
        <Page title="Historial de viajes">
          <DemoNotice />
          <p className="mb-4 text-sm text-slate-500">
            Viajes solicitados a nombre de la empresa. Puedes cancelar un viaje mientras no tenga conductor asignado.
          </p>
          <CompanyBookingsPanel companyId={companyId} viewer={viewer} initialSearch={params.get("search") ?? ""} />
        </Page>
      )}
    </CompanyScopeRequired>
  );
}
