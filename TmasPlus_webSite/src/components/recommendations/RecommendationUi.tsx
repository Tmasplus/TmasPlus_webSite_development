import React, { useCallback, useEffect, useState } from "react";
import { LifeBuoy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import {
  EVENT_LABELS,
  RESOLUTION_LABELS,
  RecommendationsService,
  settlementLabel,
  type RecommendationEvent,
  type RecommendedTrip,
  type SettlementResolution,
  type SettlementStatus,
} from "@/services/recommendations.service";
import { toast } from "@/utils/toast";

type SettlementInfo = {
  settlementStatus: SettlementStatus | null;
  settlementOverdue: boolean;
  needsSupport: boolean;
  resolution?: SettlementResolution | null;
};

function settlementTone(t: SettlementInfo): string {
  if (!t.settlementStatus) return "bg-slate-100 text-slate-600";
  if (t.needsSupport) return "bg-rose-50 text-rose-700 border border-rose-200";
  if (t.settlementStatus === "confirmado" || (t.settlementStatus === "resuelto" && t.resolution === "pagado")) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (t.settlementStatus === "resuelto") return "bg-slate-100 text-slate-700 border border-slate-200";
  return "bg-amber-50 text-amber-800 border border-amber-200";
}

export const SettlementBadge: React.FC<{ trip: SettlementInfo }> = ({ trip }) => (
  <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${settlementTone(trip)}`}>
    {settlementLabel(trip)}
  </span>
);

/** Chat de soporte del viaje: permanece abierto hasta que el admin lo cierre. */
const SupportReport: React.FC<{ trip: RecommendedTrip; onAttended?: () => void }> = ({ trip, onAttended }) => {
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  if (!trip.supportRequestedAt) return null;
  const closed = !!trip.supportClosedAt;
  const awaitingFirstReply = !closed && !trip.supportAttendedAt;

  async function send() {
    if (!response.trim()) {
      toast.error("Escribe la respuesta para el conductor.");
      return;
    }
    setSaving(true);
    try {
      await RecommendationsService.attendSupport(trip.id, response.trim());
      toast.success("Respuesta enviada. El chat sigue abierto.");
      setResponse("");
      onAttended?.();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo enviar la respuesta"));
    } finally {
      setSaving(false);
    }
  }

  async function closeThread() {
    setClosing(true);
    try {
      await RecommendationsService.closeSupport(trip.id, response.trim() || undefined);
      toast.success("Soporte cerrado. El conductor verá «Soporte terminado».");
      setResponse("");
      onAttended?.();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo cerrar el soporte"));
    } finally {
      setClosing(false);
    }
  }

  return (
    <div
      className={`mt-5 rounded-xl border p-3 text-sm ${
        closed
          ? "border-slate-200 bg-slate-50"
          : awaitingFirstReply
            ? "border-rose-200 bg-rose-50/70"
            : "border-emerald-200 bg-emerald-50/60"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          className={`font-semibold ${
            closed ? "text-slate-600" : awaitingFirstReply ? "text-rose-700" : "text-emerald-700"
          }`}
        >
          {closed
            ? "Soporte terminado"
            : awaitingFirstReply
              ? "Chat de soporte abierto · sin responder"
              : "Chat de soporte abierto"}
        </p>
        <span className="text-xs text-slate-500">
          {trip.supportRequestedBy ?? "Conductor"} · {formatDateTime(trip.supportRequestedAt)}
          {closed && trip.supportClosedAt ? ` · cerrado ${formatDateTime(trip.supportClosedAt)}` : ""}
        </span>
      </div>
      {trip.supportNote && <p className="mt-1 text-slate-700">Último mensaje del conductor: “{trip.supportNote}”</p>}
      {trip.supportResponse && (
        <p className="mt-2 text-slate-700">
          <strong>Última respuesta:</strong> {trip.supportResponse}
          {trip.supportAttendedAt ? (
            <span className="text-xs text-slate-500"> · {formatDateTime(trip.supportAttendedAt)}</span>
          ) : null}
        </p>
      )}
      {!closed && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            className="min-h-[2.75rem] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            rows={2}
            value={response}
            onChange={(e) => setResponse(e.target.value.slice(0, 1000))}
            placeholder="Respuesta al conductor (el chat no se cierra al enviar)"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={send} disabled={saving || closing}>
              {saving ? "Enviando..." : "Responder"}
            </Button>
            <Button variant="secondary" onClick={closeThread} disabled={saving || closing}>
              {closing ? "Cerrando..." : "Cerrar soporte"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Detalle de la recomendación bajo el detalle normal de la reserva. */
export const RecommendationPanel: React.FC<{
  trip: RecommendedTrip;
  onResolve: () => void;
  onChanged?: () => void;
}> = ({ trip, onResolve, onChanged }) => {
  const [events, setEvents] = useState<RecommendationEvent[] | null>(null);

  useEffect(() => {
    let alive = true;
    RecommendationsService.listEvents(trip.id)
      .then((list) => alive && setEvents(list))
      .catch(() => alive && setEvents([]));
    return () => {
      alive = false;
    };
  }, [trip.id, trip.settlementStatus, trip.supportRequestedAt, trip.supportAttendedAt]);

  const rows: [string, React.ReactNode][] = [
    ["Solicitó", `${trip.requesterName}${trip.requesterContact ? ` · ${trip.requesterContact}` : ""}`],
    ["Cliente", `${trip.customerName}${trip.customerContact ? ` · ${trip.customerContact}` : ""}`],
    ["Realizó", trip.driverName ? `${trip.driverName}${trip.plateNumber ? ` · ${trip.plateNumber}` : ""}` : "Sin conductor"],
    ["Tarifa fija", `${trip.fareSource === "manual" ? "Valor manual" : "Recomendada por la app"}: ${formatMoney(trip.fareMin)}`],
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

      <h4 className="mb-2 mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Cómo pagarle al conductor (sin efectivo)
      </h4>
      <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm space-y-2">
        {trip.driverPayDaviplata && trip.driverDaviplataNumero ? (
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">DaviPlata</span>
            <span className="font-mono font-medium text-slate-800">{trip.driverDaviplataNumero}</span>
          </div>
        ) : null}
        {trip.driverPayNequi && trip.driverNequiNumero ? (
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Nequi</span>
            <span className="font-mono font-medium text-slate-800">{trip.driverNequiNumero}</span>
          </div>
        ) : null}
        {trip.driverNequiBreb ? (
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">Llave Bre-b</span>
            <span className="font-medium text-slate-800">{trip.driverNequiBreb}</span>
          </div>
        ) : null}
        {!trip.driverPayDaviplata && !trip.driverPayNequi && !trip.driverNequiBreb ? (
          <p className="text-slate-500">El conductor aún no configuró DaviPlata/Nequi/Bre-b.</p>
        ) : null}
        {trip.driverPayCash ? (
          <p className="text-xs text-slate-400">También acepta efectivo (no aplica para liquidación entre conductores).</p>
        ) : null}
      </div>

      <SupportReport trip={trip} onAttended={onChanged} />

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

export const ResolveModal: React.FC<{
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

/** Sección de recomendación dentro del modal de detalle de reserva (como CorporateBookingExtra). */
export const RecommendedBookingExtra: React.FC<{ bookingId: string; onChanged?: () => void }> = ({ bookingId, onChanged }) => {
  const [trip, setTrip] = useState<RecommendedTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const load = useCallback(async () => {
    try {
      setTrip(await RecommendationsService.getTrip(bookingId));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "No se pudo cargar la recomendación"));
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <div className="mx-6 mb-6 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>;
  if (!trip) return <div className="mx-6 mb-6 text-sm text-slate-400">Cargando recomendación…</div>;

  return (
    <>
      <RecommendationPanel
        trip={trip}
        onResolve={() => setResolving(true)}
        onChanged={() => {
          void load();
          onChanged?.();
        }}
      />
      <ResolveModal
        trip={resolving ? trip : null}
        onClose={() => setResolving(false)}
        onResolved={() => {
          setResolving(false);
          void load();
          onChanged?.();
        }}
      />
    </>
  );
};
