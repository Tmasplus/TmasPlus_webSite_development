import { useEffect, useState } from "react";
import { Page } from "@/components/layout/Page";
import { EmptyState } from "@/components/ui/EmptyState";
import { DemoNotice } from "@/components/companies/CompanyUi";
import { CompanyInfoCard } from "@/components/companies/CompanyInfoCard";
import { CompanyScopeRequired } from "@/components/companies/CompanyScopeRequired";
import { CompaniesService, type Company } from "@/services/companies.service";

function ProfileContent({ companyId }: { companyId: string }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    CompaniesService.get(companyId)
      .then((c) => !cancelled && setCompany(c))
      .catch(() => !cancelled && setCompany(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (loading) return <div className="p-6 text-center text-slate-500 text-sm">Cargando...</div>;

  return (
    <Page title="Perfil de la empresa">
      <DemoNotice />
      {company ? (
        <>
          <CompanyInfoCard company={company} />
          <p className="mt-4 text-xs text-slate-500">
            Para actualizar los datos de la empresa o el correo de acceso, comunícate con T+Plus.
          </p>
        </>
      ) : (
        <EmptyState title="No se encontraron los datos de la empresa" />
      )}
    </Page>
  );
}

export default function CompanyProfilePage() {
  return (
    <CompanyScopeRequired>{({ companyId }) => <ProfileContent companyId={companyId} />}</CompanyScopeRequired>
  );
}
