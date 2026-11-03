import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCompanyScope, type CompanyScope } from "@/hooks/useCompanyScope";

type Props = {
  children: (scope: CompanyScope & { companyId: string }) => React.ReactNode;
};

/** Renderiza el contenido del portal solo cuando hay una empresa en contexto. */
export const CompanyScopeRequired: React.FC<Props> = ({ children }) => {
  const scope = useCompanyScope();
  const navigate = useNavigate();

  if (!scope.companyId) {
    return (
      <div className="p-6">
        <EmptyState
          title="Ninguna empresa seleccionada"
          subtitle="Abre una empresa desde el módulo Empresas y pulsa «Ver portal de la empresa»."
          action={<Button onClick={() => navigate("/empresas")}>Ir a Empresas</Button>}
        />
      </div>
    );
  }
  return <>{children({ ...scope, companyId: scope.companyId })}</>;
};

export default CompanyScopeRequired;
