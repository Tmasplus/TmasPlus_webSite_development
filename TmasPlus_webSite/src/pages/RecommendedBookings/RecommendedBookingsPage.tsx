import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, LifeBuoy, RefreshCw, Users } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingModal } from "@/pages/BookingHistory/BookingModal";
import { BookingHistoryView } from "@/pages/BookingHistory/BookingHistoryPage";
import { RecommendationPanel, ResolveModal, SettlementBadge } from "@/components/recommendations/RecommendationUi";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import type { BookingRecord } from "@/services/bookings.service";
import {
  RecommendationsService,
  type PortfolioCustomer,
  type RecommendedTrip,
  type RecommenderStats,
} from "@/services/recommendations.service";
import { toast } from "@/utils/toast";

type TabValue = "viajes" | "conductores" | "soporte";

const TRIP_STATUS: Record<string, string> = {
  NEW: "Buscando conductor", PENDING: "Buscando conductor", ACCEPTED: "Aceptado", ARRIVED: "Conductor en el punto",
  STARTED: "En viaje", REACHED: "En destino", COMPLETE: "Completado", PAID: "Completado", CANCELLED: "Cancelado",
};

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-bold ${tone ?? "text-slate-800"}`}>{value}</div>
  </div>
);

const PortfolioModal: React.FC<{ driver: RecommenderStats | null; onClose: () => void }> = ({ driver, onClose }) => {
  const [rows, setRows] = useState<PortfolioCustomer[] | null>(null);

  useEffect(() => {
    if (!driver) return;
    setRows(null);
    RecommendationsService.listPortfolio(driver.driverId)
      .then(setRows)
      .catch((e) => {
        toast.error(errorMessage(e, "No se pudo cargar la cartera"));
        setRows([]);
      });
  }, [driver]);

  if (!driver) return null;

  return (
    <Modal open onClose={onClose} size="lg" title={`Cartera de ${driver.driverName}`}>
      {rows === null ? (
        <p className="p-4 text-sm text-slate-500">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Sin clientes.</p>
      ) : (
        <div className="overflow-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Contacto</th>
                <th className="px-3 py-2 font-medium">Origen</th>
                <th className="px-3 py-2 font-medium text-center">Viajes</th>
                <th className="px-3 py-2 font-medium">Agregado</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.customerId} className={`border-t border-slate-100 ${c.active ? "" : "opacity-60"}`}>
                  <td className="px-3 py-2 font-medium text-slate-800">{c.customerName}{c.active ? "" : " (quitado)"}</td>
                  <td className="px-3 py-2 text-slate-600">{[c.customerContact, c.customerEmail].filter(Boolean).join(" · ")}</td>
                  <td className="px-3 py-2">{c.origin === "registrado" ? "Lo registró" : "Lo agregó (ya existía)"}</td>
                  <td className="px-3 py-2 text-center">{c.trips}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(c.addedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
};

export const RecommendedBookingsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab = (["viajes", "conductores", "soporte"].includes(params.get("tab") ?? "") ? params.get("tab") : "viajes") as TabValue;
  const [trips, setTrips] = useState<RecommendedTrip[]>([]);
  const [drivers, setDrivers] = useState<RecommenderStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailTrip, setDetailTrip] = useState<RecommendedTrip | null>(null);
  const [detailBooking, setDetailBooking] = useState<BookingRecord | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [resolveTrip, setResolveTrip] = useState<RecommendedTrip | null>(null);
  const [portfolioDriver, setPortfolioDriver] = useState<RecommenderStats | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d] = await Promise.all([RecommendationsService.listTrips(), RecommendationsService.listRecommenders()]);
      setTrips(t);
      setDrivers(d);
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar las reservas recomendadas"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const support = useMemo(() => trips.filter((t) => t.needsSupport), [trips]);

  const totals = useMemo(() => {
    const open = trips.filter((t) => ["pendiente", "pago_reportado", "en_disputa"].includes(t.settlementStatus ?? ""));
    return {
      trips: trips.length,
      completed: trips.filter((t) => t.finalPrice !== null).length,
      openAmount: open.reduce((s, t) => s + (t.settlementAmount ?? 0), 0),
      support: support.length,
      newCustomers: drivers.reduce((s, d) => s + d.customersRegistered, 0),
    };
  }, [trips, drivers, support]);

  async function openDetail(t: RecommendedTrip) {
    setOpeningId(t.id);
    try {
      setDetailBooking(await RecommendationsService.getBookingRecord(t.id));
      setDetailTrip(t);
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo abrir el detalle"));
    } finally {
      setOpeningId(null);
    }
  }

  async function afterResolve() {
    setResolveTrip(null);
    const all = await RecommendationsService.listTrips().catch(() => null);
    if (all) {
      setTrips(all);
      if (detailTrip) setDetailTrip(all.find((x) => x.id === detailTrip.id) ?? null);
    }
    RecommendationsService.listRecommenders().then(setDrivers).catch(() => {});
  }

  const supportTable = (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">Referencia</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Solicitó</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Conductor / Placa</th>
            <th className="px-3 py-2 font-medium text-right">Monto</th>
            <th className="px-3 py-2 font-medium">Liquidación</th>
            <th className="px-3 py-2 font-medium text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {support.map((t) => (
            <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-3">
                <div className="font-mono text-xs font-semibold text-slate-800">{t.reference ?? t.id.slice(0, 8)}</div>
                <div className="text-xs text-slate-400">{TRIP_STATUS[t.status] ?? t.status}</div>
              </td>
              <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(t.bookingDate)}</td>
              <td className="px-3 py-3">{t.requesterName}</td>
              <td className="px-3 py-3">{t.customerName}</td>
              <td className="px-3 py-3">
                {t.driverName ?? <span className="text-slate-400">Sin asignar</span>}
                {t.plateNumber && <div className="text-xs text-slate-400">{t.plateNumber}</div>}
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">{formatMoney(t.settlementAmount)}</td>
              <td className="px-3 py-3">
                <SettlementBadge trip={t} />
                {t.settlementDueAt && (
                  <div className="mt-1 text-xs text-slate-400">Plazo {formatDateTime(t.settlementDueAt)}</div>
                )}
                {t.supportRequestedAt && !t.supportClosedAt && (
                  <div className="mt-1 text-xs font-semibold text-rose-600" title={t.supportNote ?? undefined}>
                    Chat abierto · {t.supportRequestedBy ?? "un conductor"}
                    {t.supportAttendedAt ? " (ya respondido)" : ""}
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <div className="flex justify-center gap-2">
                  <Button
                    variant="secondary"
                    className="!px-3 !py-1.5 !text-xs"
                    onClick={() => openDetail(t)}
                    disabled={openingId === t.id}
                  >
                    <Eye size={14} />
                    {openingId === t.id ? "..." : "Detalle"}
                  </Button>
                  {t.settlementStatus && !["confirmado", "resuelto"].includes(t.settlementStatus) && (
                    <Button className="!px-3 !py-1.5 !text-xs" onClick={() => setResolveTrip(t)}>
                      <LifeBuoy size={14} />
                      Resolver
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Page
      title="Reservas recomendadas"
      actions={
        <Button variant="secondary" className="!px-3 !py-2" onClick={load} title="Refrescar">
          <RefreshCw size={16} />
        </Button>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        Viajes que un conductor pide a nombre de un cliente de su cartera y realiza otro conductor. El cliente le paga al
        conductor que solicitó; este le paga al que hizo el viaje dentro de las 24 h siguientes a completarlo.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Viajes recomendados" value={totals.trips} />
        <Stat label="Completados" value={totals.completed} />
        <Stat label="Clientes nuevos registrados" value={totals.newCustomers} />
        <Stat label="Pendiente entre conductores" value={formatMoney(totals.openAmount)} tone="text-amber-700" />
        <Stat label="Casos en soporte" value={totals.support} tone={totals.support ? "text-rose-600" : undefined} />
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            { value: "viajes", label: "Viajes" },
            { value: "conductores", label: "Conductores" },
            { value: "soporte", label: `Soporte${support.length ? ` (${support.length})` : ""}` },
          ]}
          value={tab}
          onChange={(v) => setParams(v === "viajes" ? {} : { tab: v })}
        />
      </div>

      {error && <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      {tab === "viajes" && <BookingHistoryView recommended embedded />}

      {tab === "conductores" && (
        <Card title={`Conductores que recomiendan · ${drivers.length}`}>
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
          ) : drivers.length === 0 ? (
            <EmptyState title="Ningún conductor ha registrado clientes" subtitle="Aquí verás su cartera y sus deudas." />
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Conductor</th>
                    <th className="px-3 py-2 font-medium text-center">Clientes registrados</th>
                    <th className="px-3 py-2 font-medium text-center">En cartera</th>
                    <th className="px-3 py-2 font-medium text-center">Viajes pedidos</th>
                    <th className="px-3 py-2 font-medium text-center">Completados</th>
                    <th className="px-3 py-2 font-medium text-right">Por pagar a conductores</th>
                    <th className="px-3 py-2 font-medium text-center">En soporte</th>
                    <th className="px-3 py-2 font-medium">Última solicitud</th>
                    <th className="px-3 py-2 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d) => (
                    <tr key={d.driverId} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-3">
                        <div className="font-medium text-slate-800">{d.driverName}</div>
                        <div className="text-xs text-slate-400">{[d.driverContact, d.driverEmail].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className="px-3 py-3 text-center">{d.customersRegistered}</td>
                      <td className="px-3 py-3 text-center">{d.customersInPortfolio}</td>
                      <td className="px-3 py-3 text-center">{d.tripsRequested}</td>
                      <td className="px-3 py-3 text-center">{d.tripsCompleted}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {formatMoney(d.amountOpen)}
                        {d.settlementsOpen > 0 && <div className="text-xs text-slate-400">{d.settlementsOpen} abiertas</div>}
                      </td>
                      <td className={`px-3 py-3 text-center ${d.settlementsWithIssues ? "font-semibold text-rose-600" : ""}`}>
                        {d.settlementsWithIssues}
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(d.lastRequestAt)}</td>
                      <td className="px-3 py-3 text-center">
                        <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => setPortfolioDriver(d)}>
                          <Users size={14} />
                          Cartera
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === "soporte" && (
        <Card title={`En disputa, vencidas o con reporte de un conductor · ${support.length}`}>
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
          ) : support.length === 0 ? (
            <EmptyState
              title="Sin casos pendientes"
              subtitle="Aquí llegan las liquidaciones en disputa o vencidas y los reportes que envían los conductores."
            />
          ) : (
            supportTable
          )}
        </Card>
      )}

      <BookingModal
        open={!!detailTrip && !!detailBooking}
        booking={detailBooking}
        onClose={() => {
          setDetailTrip(null);
          setDetailBooking(null);
        }}
        extra={
          detailTrip ? (
            <RecommendationPanel trip={detailTrip} onResolve={() => setResolveTrip(detailTrip)} onChanged={afterResolve} />
          ) : null
        }
      />
      <ResolveModal trip={resolveTrip} onClose={() => setResolveTrip(null)} onResolved={afterResolve} />
      <PortfolioModal driver={portfolioDriver} onClose={() => setPortfolioDriver(null)} />
    </Page>
  );
};

export default RecommendedBookingsPage;
