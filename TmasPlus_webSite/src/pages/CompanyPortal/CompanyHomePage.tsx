import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, CalendarPlus, Car, Receipt, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingStatusBadge, CompanyLogo, DemoNotice } from "@/components/companies/CompanyUi";
import { CompanyScopeRequired } from "@/components/companies/CompanyScopeRequired";
import { formatDateTime, formatMoney } from "@/components/companies/format";
import {
  ACTIVE_BOOKING_STATUSES,
  CompaniesService,
  companyCharge,
  isBillableTrip,
  type Collaborator,
  type Company,
  type CompanyBooking,
  type CompanyViewer,
} from "@/services/companies.service";

function StatCard({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-600">{icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="text-xl font-semibold text-slate-800">{value}</p>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function QuickAction({ to, icon, label, description }: { to: string; icon: React.ReactNode; label: string; description: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-500 text-white">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{description}</span>
      </span>
    </Link>
  );
}

function HomeContent({ companyId, viewer }: { companyId: string; viewer: CompanyViewer }) {
  const [company, setCompany] = useState<Company | null>(null);
  const [bookings, setBookings] = useState<CompanyBooking[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      CompaniesService.get(companyId),
      CompaniesService.listBookings({ companyId }, viewer),
      CompaniesService.listCollaborators(companyId),
    ])
      .then(([c, b, col]) => {
        if (cancelled) return;
        setCompany(c);
        setBookings(b);
        setCollaborators(col);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [companyId, viewer]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    // Solo lo completado se factura a la empresa.
    const thisMonth = bookings.filter((b) => isBillableTrip(b) && new Date(b.booking_date).getTime() >= monthStart);
    return {
      activeCollaborators: collaborators.filter((c) => c.activo).length,
      inProgress: bookings.filter((b) => ACTIVE_BOOKING_STATUSES.includes(b.status)).length,
      monthTrips: thisMonth.length,
      monthAmount: thisMonth.reduce((s, b) => s + (Number(companyCharge(b)) || 0), 0),
      invoiced: bookings
        .filter((b) => isBillableTrip(b) && b.estado_facturacion === "facturado")
        .reduce((s, b) => s + (Number(companyCharge(b)) || 0), 0),
    };
  }, [bookings, collaborators]);

  if (loading) {
    return <div className="p-6 text-center text-slate-500 text-sm">Cargando...</div>;
  }

  const name = company ? company.nombre_comercial || company.razon_social : "tu empresa";

  return (
    <div className="p-4 md:p-6">
      <DemoNotice />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <CompanyLogo src={company?.logo_url} name={name} size={56} />
        <div>
          <p className="text-sm text-slate-500">Bienvenido al portal corporativo</p>
          <h1 className="text-xl md:text-2xl font-semibold text-slate-800">{name}</h1>
        </div>
      </div>

      {company && !company.activo && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Esta empresa está inactiva: no puede solicitar viajes ni agregar colaboradores.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard icon={<Users size={20} />} label="Colaboradores activos" value={stats.activeCollaborators} />
        <StatCard icon={<Car size={20} />} label="Viajes en curso" value={stats.inProgress} hint="Pendientes, asignados o en ruta" />
        <StatCard icon={<CalendarClock size={20} />} label="Viajes completados este mes" value={stats.monthTrips} hint={`Valor: ${formatMoney(stats.monthAmount)}`} />
        <StatCard icon={<Receipt size={20} />} label="Total facturado" value={formatMoney(stats.invoiced)} hint="Viajes completados ya facturados a la empresa" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <QuickAction to="/empresa/reservar" icon={<CalendarPlus size={20} />} label="Solicitar viaje" description="Pide un servicio para un colaborador" />
        <QuickAction to="/empresa/colaboradores" icon={<UserPlus size={20} />} label="Colaboradores" description="Agrega o administra tu equipo" />
        <QuickAction to="/empresa/reservas" icon={<CalendarClock size={20} />} label="Historial de viajes" description="Consulta y cancela tus viajes" />
      </div>

      <Card title="Últimos viajes">
        {bookings.length === 0 ? (
          <EmptyState title="Aún no hay viajes" subtitle="Los viajes que solicites aparecerán aquí." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookings.slice(0, 5).map((b) => (
              <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {b.collaborator_name} <span className="font-mono text-xs text-slate-400">· {b.reference}</span>
                  </p>
                  <p className="truncate text-xs text-slate-500" title={`${b.pickup_address} → ${b.drop_address}`}>
                    {b.pickup_address} → {b.drop_address}
                  </p>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">{formatDateTime(b.booking_date)}</span>
                <BookingStatusBadge status={b.status} />
                <span className="w-24 text-right text-sm font-medium text-slate-700">{formatMoney(companyCharge(b))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function CompanyHomePage() {
  return (
    <CompanyScopeRequired>
      {({ companyId, viewer }) => <HomeContent companyId={companyId} viewer={viewer} />}
    </CompanyScopeRequired>
  );
}
