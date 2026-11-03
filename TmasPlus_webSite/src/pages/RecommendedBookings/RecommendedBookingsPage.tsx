import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Eye, LifeBuoy, RefreshCw, Users } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookingModal } from "@/pages/BookingHistory/BookingModal";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import { useDebounced } from "@/hooks/useDebounced";
import type { BookingRecord } from "@/services/bookings.service";
import {
  EVENT_LABELS,
  RESOLUTION_LABELS,
  RecommendationsService,
  settlementLabel,
  type PortfolioCustomer,
  type RecommendationEvent,
  type RecommendedTrip,
  type RecommenderStats,
  type SettlementFilter,
  type SettlementResolution,
} from "@/services/recommendations.service";
import { exportToCsv } from "@/utils/exportCsv";
import { toast } from "@/utils/toast";

type TabValue = "viajes" | "conductores" | "soporte";

const TRIP_STATUS: Record<string, string> = {
  NEW: "Buscando conductor", PENDING: "Buscando conductor", ACCEPTED: "Aceptado", ARRIVED: "Conductor en el punto",
  STARTED: "En viaje", REACHED: "En destino", COMPLETE: "Completado", PAID: "Completado", CANCELLED: "Cancelado",
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function settlementTone(t: RecommendedTrip): string {
  if (!t.settlementStatus) return "bg-slate-100 text-slate-600";
  if (t.needsSupport) return "bg-rose-50 text-rose-700 border border-rose-200";
  if (t.settlementStatus === "confirmado" || (t.settlementStatus === "resuelto" && t.resolution === "pagado")) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (t.settlementStatus === "resuelto") return "bg-slate-100 text-slate-700 border border-slate-200";
  return "bg-amber-50 text-amber-800 border border-amber-200";
}

const SettlementBadge: React.FC<{ trip: RecommendedTrip }> = ({ trip }) => (
  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${settlementTone(trip)}`}>
    {settlementLabel(trip)}
  </span>
);

const Stat: React.FC<{ label: string; value: React.ReactNode; tone?: string }> = ({ label, value, tone }) => (
  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="text-xs font-medium text-slate-500">{label}</div>
    <div className={`mt-1 text-xl font-bold ${tone ?? "text-slate-800"}`}>{value}</div>
  </div>
);

/** Detalle de la recomendación bajo el detalle normal de la reserva. */
const RecommendationPanel: React.FC<{ trip: RecommendedTrip; onResolve: () => void }> = ({ trip, onResolve }) => {
  const [events, setEvents] = useState<RecommendationEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    RecommendationsService.listEvents(trip.id)
      .then((list) => alive && setEvents(list))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [trip.id, trip.settlementStatus]);

  const rows: [string, React.ReactNode][] = [
    ["Solicitó", `${trip.requesterName}${trip.requesterContact ? ` · ${trip.requesterContact}` : ""}`],
    ["Cliente", `${trip.customerName}${trip.customerContact ? ` · ${trip.customerContact}` : ""}`],
    ["Realizó", trip.driverName ? `${trip.driverName}${trip.plateNumber ? ` · ${trip.plateNumber}` : ""}` : "Sin conductor"],
    ["Tarifa", `${trip.fareSource === "manual" ? "Rango manual" : "Recomendada por la app"}: ${formatMoney(trip.fareMin)} – ${formatMoney(trip.fareMax)}`],
    ["Precio final", trip.finalPrice !== null ? formatMoney(trip.finalPrice) : "—"],
    ["Valor acordado con el cliente", trip.agreedValue !== null ? formatMoney(trip.agreedValue) : "No informado"],
    ["Ganancia del solicitante", trip.requesterMargin !== null ? formatMoney(trip.requesterMargin) : "—"],
  ];

  return (
    <section className="mx-6 mb-6 rounded-2xl border border-sky-200 bg-sky-50/50 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700">
            <Users size={20} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Reserva recomendada</p>
            <p className="text-sm text-slate-700">
              El cliente le paga a <strong>{trip.requesterName}</strong>; él le paga a quien realizó el viaje.
            </p>
          </div>
        </div>
        {trip.settlementStatus && trip.settlementStatus !== "resuelto" && trip.settlementStatus !== "confirmado" && (
          <Button onClick={onResolve}>
            <LifeBuoy size={16} />
            Resolver liquidación
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-sky-100 py-1.5">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>

      <h4 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Liquidación entre conductores</h4>
      {trip.settlementStatus ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <SettlementBadge trip={trip} />
          <span>Monto: <strong>{formatMoney(trip.settlementAmount)}</strong></span>
          <span className="text-slate-500">Plazo: {formatDateTime(trip.settlementDueAt)}</span>
          <span className="text-slate-500">
            Pago reportado: {trip.paidReportedAt ? formatDateTime(trip.paidReportedAt) : "no"} · Recibido:{" "}
            {trip.received === null ? "sin respuesta" : trip.received ? "sí" : "no"}
          </span>
          {trip.resolution && (
            <span className="w-full text-slate-700">
              Soporte: <strong>{RESOLUTION_LABELS[trip.resolution]}</strong>
              {trip.resolutionNote ? ` — ${trip.resolutionNote}` : ""}
            </span>
          )}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Se abre cuando el viaje se completa.</p>
      )}

      <h4 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">Historial</h4>
      {events === null ? (
        <p className="text-sm text-slate-400">Cargando…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-400">Sin eventos.</p>
      ) : (
        <ol className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />
              <div>
                <div className="font-medium text-slate-800">{EVENT_LABELS[e.type] ?? e.type}</div>
                <div className="text-xs text-slate-500">
                  {formatDateTime(e.createdAt)}
                  {e.actorName ? ` · ${e.actorName}` : ""}
                  {e.note ? ` · ${e.note}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
};

const ResolveModal: React.FC<{
  trip: RecommendedTrip | null;
  onClose: () => void;
  onResolved: () => void;
}> = ({ trip, onClose, onResolved }) => {
  const [resolution, setResolution] = useState<SettlementResolution>("pagado");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trip) {
      setResolution("pagado");
      setNote("");
    }
  }, [trip]);

  if (!trip) return null;

  async function confirm() {
    if (!trip) return;
    if (!note.trim()) {
      toast.error("Escribe la nota de la resolución.");
      return;
    }
    setSaving(true);
    try {
      await RecommendationsService.resolve(trip.id, resolution, note.trim());
      toast.success("Liquidación resuelta.");
      onResolved();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo resolver la liquidación"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`Resolver liquidación · ${trip.reference ?? trip.id.slice(0, 8)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={confirm} disabled={saving}>{saving ? "Guardando..." : "Confirmar"}</Button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">
          {trip.requesterName} debe pagarle {formatMoney(trip.settlementAmount)} a {trip.driverName ?? "el conductor"}.
          Estado actual: <strong>{settlementLabel(trip)}</strong>.
        </p>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Resultado</label>
          <select
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={resolution}
            onChange={(e) => setResolution(e.target.value as SettlementResolution)}
          >
            <option value="pagado">Pagado: el pago se hizo</option>
            <option value="no_pagado">No pagado: queda como deuda sin saldar</option>
            <option value="anulado">Anulado: no aplica cobro</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Nota (obligatoria)</label>
          <textarea
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Qué se verificó y con quién"
          />
        </div>
      </div>
    </Modal>
  );
};

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
  const [query, setQuery] = useState("");
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>("todas");
  const dq = useDebounced(query, 250);

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

  const filtered = useMemo(() => {
    const q = norm(dq.trim());
    return trips.filter((t) => {
      if (settlementFilter === "abiertas" && !["pendiente", "pago_reportado", "en_disputa"].includes(t.settlementStatus ?? "")) return false;
      if (settlementFilter === "soporte" && !t.needsSupport) return false;
      if (settlementFilter === "confirmadas" && t.settlementStatus !== "confirmado") return false;
      if (settlementFilter === "resueltas" && t.settlementStatus !== "resuelto") return false;
      if (settlementFilter === "sin_liquidacion" && t.settlementStatus) return false;
      if (!q) return true;
      return [t.reference, t.requesterName, t.customerName, t.driverName, t.plateNumber, t.pickupAddress, t.dropAddress]
        .some((v) => norm(v).includes(q));
    });
  }, [trips, dq, settlementFilter]);

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

  function exportCsv() {
    if (filtered.length === 0) {
      toast.info("No hay viajes para exportar.");
      return;
    }
    exportToCsv("reservas_recomendadas", filtered, [
      { header: "Referencia", value: (t) => t.reference },
      { header: "Fecha", value: (t) => t.bookingDate },
      { header: "Estado", value: (t) => TRIP_STATUS[t.status] ?? t.status },
      { header: "Solicitó", value: (t) => t.requesterName },
      { header: "Cliente", value: (t) => t.customerName },
      { header: "Conductor", value: (t) => t.driverName },
      { header: "Placa", value: (t) => t.plateNumber },
      { header: "Tarifa", value: (t) => (t.fareSource === "manual" ? "Manual" : "Recomendada") },
      { header: "Mínimo", value: (t) => t.fareMin },
      { header: "Máximo", value: (t) => t.fareMax },
      { header: "Precio final", value: (t) => t.finalPrice },
      { header: "Valor acordado", value: (t) => t.agreedValue },
      { header: "Ganancia solicitante", value: (t) => t.requesterMargin },
      { header: "Liquidación", value: (t) => settlementLabel(t) },
      { header: "Monto liquidación", value: (t) => t.settlementAmount },
      { header: "Plazo", value: (t) => t.settlementDueAt },
    ]);
  }

  const tripsTable = (list: RecommendedTrip[], withResolve: boolean) => (
    <div className="overflow-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-slate-600">
          <tr>
            <th className="px-3 py-2 font-medium">Referencia</th>
            <th className="px-3 py-2 font-medium">Fecha</th>
            <th className="px-3 py-2 font-medium">Solicitó</th>
            <th className="px-3 py-2 font-medium">Cliente</th>
            <th className="px-3 py-2 font-medium">Conductor / Placa</th>
            <th className="px-3 py-2 font-medium text-right">Rango</th>
            <th className="px-3 py-2 font-medium text-right">Precio final</th>
            <th className="px-3 py-2 font-medium text-right">Acordado</th>
            <th className="px-3 py-2 font-medium">Liquidación</th>
            <th className="px-3 py-2 font-medium text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {list.map((t) => (
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
              <td className="px-3 py-3 text-right whitespace-nowrap">
                {formatMoney(t.fareMin)} – {formatMoney(t.fareMax)}
                <div className="text-xs text-slate-400">{t.fareSource === "manual" ? "Manual" : "Recomendada"}</div>
              </td>
              <td className="px-3 py-3 text-right whitespace-nowrap">{t.finalPrice !== null ? formatMoney(t.finalPrice) : "—"}</td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                {t.agreedValue !== null ? formatMoney(t.agreedValue) : "—"}
                {t.requesterMargin !== null && (
                  <div className={`text-xs ${t.requesterMargin >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    Ganancia {formatMoney(t.requesterMargin)}
                  </div>
                )}
              </td>
              <td className="px-3 py-3">
                <SettlementBadge trip={t} />
                {t.settlementDueAt && !["confirmado", "resuelto"].includes(t.settlementStatus ?? "") && (
                  <div className="mt-1 text-xs text-slate-400">Plazo {formatDateTime(t.settlementDueAt)}</div>
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
                  {withResolve && (
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
        <>
          <Button variant="secondary" className="!px-3 !py-2" onClick={load} title="Refrescar">
            <RefreshCw size={16} />
          </Button>
          {tab === "viajes" && (
            <Button variant="secondary" className="!px-3 !py-2" onClick={exportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
          )}
        </>
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

      {tab === "viajes" && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-3">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500">Buscar</label>
              <Input
                placeholder="Referencia, conductor, cliente, placa, dirección..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Buscar reservas recomendadas"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Liquidación</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                value={settlementFilter}
                onChange={(e) => setSettlementFilter(e.target.value as SettlementFilter)}
              >
                <option value="todas">Todas</option>
                <option value="abiertas">Abiertas (sin confirmar)</option>
                <option value="soporte">En soporte (disputa o vencidas)</option>
                <option value="confirmadas">Confirmadas</option>
                <option value="resueltas">Resueltas por soporte</option>
                <option value="sin_liquidacion">Sin liquidación (no completados)</option>
              </select>
            </div>
          </div>
          <Card title={`Viajes · ${filtered.length}${filtered.length !== trips.length ? ` de ${trips.length}` : ""}`}>
            {loading ? (
              <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title={trips.length === 0 ? "Aún no hay reservas recomendadas" : "Sin resultados"}
                subtitle={trips.length === 0 ? "Aparecerán cuando un conductor pida un viaje para un cliente." : "Ajusta la búsqueda o el filtro."}
              />
            ) : (
              tripsTable(filtered, false)
            )}
          </Card>
        </>
      )}

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
        <Card title={`Liquidaciones en disputa o vencidas · ${support.length}`}>
          {loading ? (
            <div className="p-6 text-center text-sm text-slate-500">Cargando…</div>
          ) : support.length === 0 ? (
            <EmptyState title="Sin casos pendientes" subtitle="Aquí llegan las liquidaciones en disputa o que vencieron sin confirmar." />
          ) : (
            tripsTable(support, true)
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
        extra={detailTrip ? <RecommendationPanel trip={detailTrip} onResolve={() => setResolveTrip(detailTrip)} /> : null}
      />
      <ResolveModal trip={resolveTrip} onClose={() => setResolveTrip(null)} onResolved={afterResolve} />
      <PortfolioModal driver={portfolioDriver} onClose={() => setPortfolioDriver(null)} />
    </Page>
  );
};

export default RecommendedBookingsPage;
