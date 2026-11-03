import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Receipt } from "lucide-react";
import AddBookingPage from "@/pages/AddBooking/AddBookingPage";
import { DemoNotice } from "@/components/companies/CompanyUi";
import { CompanyScopeRequired } from "@/components/companies/CompanyScopeRequired";
import type { CreateBookingInput, CustomerLite } from "@/services/bookings.service";
import { CompaniesService, type CompanyViewer } from "@/services/companies.service";

function NewBookingContent({ companyId, viewer }: { companyId: string; viewer: CompanyViewer }) {
  const [params] = useSearchParams();
  const preselectedId = params.get("colaborador");
  const [initialCustomer, setInitialCustomer] = useState<CustomerLite | null>(null);
  const [ready, setReady] = useState(!preselectedId);

  useEffect(() => {
    if (!preselectedId) {
      setInitialCustomer(null);
      setReady(true);
      return;
    }
    let cancelled = false;
    setReady(false);
    CompaniesService.listCollaborators(companyId)
      .then((list) => {
        if (cancelled) return;
        const c = list.find((x) => x.id === preselectedId && x.activo);
        setInitialCustomer(
          c ? { id: c.id, first_name: c.first_name, last_name: c.last_name, email: c.email, mobile: c.mobile } : null
        );
      })
      .catch(() => setInitialCustomer(null))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, [companyId, preselectedId]);

  const searchCollaborators = useCallback(
    (query: string, limit: number) => CompaniesService.searchCollaborators(companyId, query, limit),
    [companyId]
  );
  const createBooking = useCallback(
    (input: CreateBookingInput) => CompaniesService.createBooking(companyId, input, viewer),
    [companyId, viewer]
  );

  if (!ready) {
    return <div className="p-6 text-center text-slate-500 text-sm">Cargando...</div>;
  }

  return (
    <AddBookingPage
      key={initialCustomer?.id ?? "nuevo"}
      title="Solicitar viaje"
      customerLabel="Colaborador"
      customerPlaceholder="Buscar colaborador por nombre, correo, teléfono o documento..."
      searchCustomers={searchCollaborators}
      createBooking={createBooking}
      paymentOptions={["Empresarial"]}
      initialCustomer={initialCustomer}
      showCustomerId={false}
      successMessage="El viaje quedó solicitado a nombre del colaborador. Puedes seguirlo en el historial de viajes."
      notice={
        <>
          <DemoNotice />
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-100 bg-sky-50 px-4 py-2.5 text-xs text-sky-800">
            <Receipt size={16} className="mt-0.5 shrink-0" />
            <span>
              Los viajes se pagan con el método <strong>Empresarial</strong>: se facturan a la empresa y T+Plus le paga
              al conductor. ¿No encuentras a la persona?{" "}
              <Link to="/empresa/colaboradores" className="font-semibold underline">
                Agrégala como colaborador
              </Link>
              .
            </span>
          </div>
        </>
      }
    />
  );
}

export default function CompanyNewBookingPage() {
  return (
    <CompanyScopeRequired>
      {({ companyId, viewer }) => <NewBookingContent companyId={companyId} viewer={viewer} />}
    </CompanyScopeRequired>
  );
}
