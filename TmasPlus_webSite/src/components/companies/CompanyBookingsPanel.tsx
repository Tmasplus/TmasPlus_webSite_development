import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eye, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  BookingStatusBadge,
  InvoiceStatusBadge,
  PaymentStatusBadge,
} from "@/components/companies/CompanyUi";
import { BillingStatusModal, type BillingChange } from "@/components/companies/BillingStatusModal";
import { CorporateBillingSection } from "@/components/companies/CorporateBillingSection";
import type { LoadBookingExtras } from "@/components/bookings/BookingDetailView";
import { BookingModal } from "@/pages/BookingHistory/BookingModal";
import { errorMessage, formatDateTime, formatMoney } from "@/components/companies/format";
import { useDebounced } from "@/hooks/useDebounced";
import {
  BOOKING_STATUS_LABELS,
  COMPANIES_BACKEND_READY,
  CompaniesService,
  DRIVER_PAYMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  canCancelBooking,
  collaboratorFullName,
  isBillableTrip,
  type Collaborator,
  type CompanyBooking,
  type CompanyBookingStatus,
  type CompanyViewer,
  type CorporateTripDetail,
  type DriverPaymentStatus,
  type InvoiceStatus,
} from "@/services/companies.service";
import { exportToCsv } from "@/utils/exportCsv";
import { toast } from "@/utils/toast";

type Props = {
  /** null: viajes de todas las empresas (vista del administrador). */
  companyId: string | null;
  viewer: CompanyViewer;
  initialSearch?: string;
};

const PAGE_SIZE = 15;

const CANCELLED_BY: Record<string, string> = {
  admin: "T+Plus",
  empresa: "Empresa",
  cliente: "Colaborador",
  conductor: "Conductor",
};
const REQUESTED_BY: Record<CompanyBooking["requested_by"], string> = {
  empresa: "Empresa",
  admin: "Administrador T+Plus",
  colaborador: "Colaborador (app)",
};
const selectClass = "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] gap-2 py-1.5 border-b border-slate-50 last:border-b-0">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm text-slate-800 break-words">{children || "—"}</span>
    </div>
  );
}

function SummaryCard({ label, count, amount, tone }: { label: string; count: number; amount: number; tone: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${tone}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-lg font-semibold">{formatMoney(amount)}</p>
      <p className="text-xs opacity-80">{count} servicio{count === 1 ? "" : "s"}</p>
    </div>
  );
}

export const CompanyBookingsPanel: React.FC<Props> = ({ companyId, viewer, initialSearch = "" }) => {
  const isAdmin = viewer === "admin";
  const [rows, setRows] = useState<CompanyBooking[]>([]);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);
  const [status, setStatus] = useState<CompanyBookingStatus | "">("");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<DriverPaymentStatus | "">("");
  const [collaboratorId, setCollaboratorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tripDetail, setTripDetail] = useState<CorporateTripDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CompanyBooking | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [billingChange, setBillingChange] = useState<BillingChange | null>(null);
  const [savingBilling, setSavingBilling] = useState(false);
  const dSearch = useDebounced(search, 300);
  const showCompany = companyId === null;
  const detail = rows.find((r) => r.id === detailId) ?? null;

  useEffect(() => setSearch(initialSearch), [initialSearch]);

  useEffect(() => {
    if (!companyId) {
      setCollaborators([]);
      return;
    }
    CompaniesService.listCollaborators(companyId).then(setCollaborators).catch(() => setCollaborators([]));
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await CompaniesService.listBookings(
        {
          companyId,
          collaboratorId: collaboratorId || null,
          status: status || null,
          invoiceStatus: invoiceStatus || null,
          paymentStatus: paymentStatus || null,
          search: dSearch,
          dateFrom: dateFrom || null,
          dateTo: dateTo || null,
        },
        viewer
      );
      setRows(data);
      setVisible(PAGE_SIZE);
      setSelected(new Set());
    } catch (e) {
      setError(errorMessage(e, "No se pudieron cargar los viajes"));
    } finally {
      setLoading(false);
    }
  }, [companyId, viewer, collaboratorId, status, invoiceStatus, paymentStatus, dSearch, dateFrom, dateTo]);

  useEffect(() => {
    load();
  }, [load]);

  // Solo lo completado se factura: cancelado o en curso no suma.
  const summary = useMemo(() => {
    const billable = rows.filter(isBillableTrip);
    const sum = (list: CompanyBooking[], pick: (b: CompanyBooking) => number | null) =>
      list.reduce((s, b) => s + (Number(pick(b)) || 0), 0);
    const pendingInvoice = billable.filter((r) => r.estado_facturacion === "sin_facturar");
    const invoiced = billable.filter((r) => r.estado_facturacion === "facturado");
    const pendingPayment = billable.filter((r) => r.estado_pago_conductor === "sin_pagar");
    return {
      count: rows.length,
      completed: { count: billable.length, amount: sum(billable, (b) => b.total_cost) },
      pendingInvoice: { count: pendingInvoice.length, amount: sum(pendingInvoice, (b) => b.total_cost) },
      invoiced: { count: invoiced.length, amount: sum(invoiced, (b) => b.total_cost) },
      pendingPayment: { count: pendingPayment.length, amount: sum(pendingPayment, (b) => b.driver_share ?? b.total_cost) },
    };
  }, [rows]);

  const pageRows = rows.slice(0, visible);
  const selectableIds = pageRows.filter(isBillableTrip).map((r) => r.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  }

  // Mismo detalle que el admin (ruta, GPS, etapas, conductor). Con datos de demostración no hay ruta: detalle simple.
  async function openDetail(b: CompanyBooking) {
    if (!COMPANIES_BACKEND_READY) {
      setDetailId(b.id);
      return;
    }
    setOpeningId(b.id);
    try {
      setTripDetail(await CompaniesService.getTripDetail(b.id));
      setDetailId(b.id);
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo abrir el detalle del viaje"));
    } finally {
      setOpeningId(null);
    }
  }

  function closeDetail() {
    setDetailId(null);
    setTripDetail(null);
  }

  const loadTripExtras = useCallback<LoadBookingExtras>(
    async (booking) => (await CompaniesService.getTripDetail(booking.id)).extras,
    []
  );

  function openCancel(b: CompanyBooking) {
    setCancelTarget(b);
    setCancelReason("");
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const updated = await CompaniesService.cancelBooking(cancelTarget.id, cancelReason, viewer);
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success(`Viaje ${updated.reference} cancelado.`);
      setCancelTarget(null);
      if (tripDetail?.booking.id === updated.id) {
        setTripDetail(await CompaniesService.getTripDetail(updated.id).catch(() => tripDetail));
      }
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo cancelar el viaje"));
    } finally {
      setCancelling(false);
    }
  }

  async function confirmBilling(referencia: string, nota: string) {
    if (!billingChange) return;
    setSavingBilling(true);
    try {
      await CompaniesService.setBillingStatus(
        billingChange.bookingIds,
        billingChange.field,
        billingChange.value,
        referencia,
        nota
      );
      toast.success("Estado actualizado.");
      setBillingChange(null);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, "No se pudo actualizar el estado"));
    } finally {
      setSavingBilling(false);
    }
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.info("No hay viajes para exportar.");
      return;
    }
    exportToCsv("viajes_empresariales", rows, [
      { header: "Referencia", value: (r) => r.reference },
      ...(showCompany ? [{ header: "Empresa", value: (r: CompanyBooking) => r.company_name }] : []),
      { header: "Fecha servicio", value: (r) => r.booking_date },
      { header: "Tipo", value: (r) => (r.booking_type === "SCHEDULED" ? "Programado" : "Inmediato") },
      { header: "Colaborador", value: (r) => r.collaborator_name },
      { header: "Teléfono colaborador", value: (r) => r.collaborator_contact },
      { header: "Origen", value: (r) => r.pickup_address },
      { header: "Destino", value: (r) => r.drop_address },
      { header: "Categoría", value: (r) => r.car_type },
      { header: "Distancia km", value: (r) => r.distance_km },
      { header: "Estado", value: (r) => BOOKING_STATUS_LABELS[r.status] },
      { header: "Conductor", value: (r) => r.driver_name },
      { header: "Placa", value: (r) => r.plate_number },
      { header: "Valor", value: (r) => r.total_cost },
      { header: "Factura", value: (r) => INVOICE_STATUS_LABELS[r.estado_facturacion] },
      { header: "N.° factura", value: (r) => r.factura_referencia },
      ...(isAdmin
        ? [
            {
              header: "Pago conductor",
              value: (r: CompanyBooking) => (r.estado_pago_conductor ? DRIVER_PAYMENT_STATUS_LABELS[r.estado_pago_conductor] : ""),
            },
            { header: "Valor conductor", value: (r: CompanyBooking) => r.driver_share },
          ]
        : []),
      { header: "Solicitado por", value: (r) => REQUESTED_BY[r.requested_by] ?? r.requested_by },
    ]);
  }

  const cancelHint = (b: CompanyBooking) =>
    !isAdmin && !canCancelBooking(b, viewer) && b.status !== "CANCELLED"
      ? "Solo se pueden cancelar viajes sin conductor asignado. Comunícate con T+Plus."
      : undefined;

  const bulk = (field: BillingChange["field"], value: BillingChange["value"]) =>
    setBillingChange({ field, value, bookingIds: [...selected] });

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SummaryCard label="Facturado" {...summary.invoiced} tone="border-emerald-200 bg-emerald-50 text-emerald-800" />
        <SummaryCard label="Por facturar (completados)" {...summary.pendingInvoice} tone="border-sky-200 bg-sky-50 text-sky-800" />
        {isAdmin ? (
          <SummaryCard label="Pendiente de pago a conductores" {...summary.pendingPayment} tone="border-orange-200 bg-orange-50 text-orange-800" />
        ) : (
          <SummaryCard label="Total de viajes completados" {...summary.completed} tone="border-slate-200 bg-white text-slate-800" />
        )}
      </div>
      <p className="-mt-2 mb-4 text-xs text-slate-500">
        Solo se factura lo completado: un viaje cancelado o que aún no termina no se le cobra a la empresa.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-slate-500 mb-1">Buscar</label>
          <Input
            placeholder={showCompany ? "Referencia, empresa, colaborador, dirección..." : "Referencia, colaborador, dirección..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar viajes"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Estado del viaje</label>
          <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as CompanyBookingStatus | "")}>
            <option value="">Todos</option>
            {(Object.keys(BOOKING_STATUS_LABELS) as CompanyBookingStatus[]).map((s) => (
              <option key={s} value={s}>{BOOKING_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Factura</label>
          <select className={selectClass} value={invoiceStatus} onChange={(e) => setInvoiceStatus(e.target.value as InvoiceStatus | "")}>
            <option value="">Todas</option>
            {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => (
              <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        {isAdmin && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Pago al conductor</label>
            <select className={selectClass} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as DriverPaymentStatus | "")}>
              <option value="">Todos</option>
              {(Object.keys(DRIVER_PAYMENT_STATUS_LABELS) as DriverPaymentStatus[]).map((s) => (
                <option key={s} value={s}>{DRIVER_PAYMENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        )}
        {!showCompany && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Colaborador</label>
            <select className={selectClass} value={collaboratorId} onChange={(e) => setCollaboratorId(e.target.value)}>
              <option value="">Todos</option>
              {collaborators.map((c) => (
                <option key={c.id} value={c.id}>{collaboratorFullName(c)}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
          <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
          <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">{error}</div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{summary.count}</span> viajes ·{" "}
            <span className="font-semibold text-slate-800">{formatMoney(summary.completed.amount)}</span> en viajes completados
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="!px-3 !py-2" onClick={load} title="Refrescar">
              <RefreshCw size={16} />
            </Button>
            <Button variant="secondary" className="!px-3 !py-2" onClick={exportCsv}>
              <Download size={16} />
              Exportar CSV
            </Button>
          </div>
        </div>

        {isAdmin && selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm">
            <span className="font-medium text-sky-800">{selected.size} seleccionado{selected.size === 1 ? "" : "s"}:</span>
            <Button className="!px-3 !py-1.5 !text-xs" onClick={() => bulk("facturacion", "facturado")}>Marcar facturado</Button>
            <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => bulk("facturacion", "sin_facturar")}>Sin facturar</Button>
            <span className="mx-1 h-5 w-px bg-sky-200" />
            <Button className="!px-3 !py-1.5 !text-xs" onClick={() => bulk("pago_conductor", "pagado")}>Marcar pagado al conductor</Button>
            <Button variant="secondary" className="!px-3 !py-1.5 !text-xs" onClick={() => bulk("pago_conductor", "sin_pagar")}>Sin pagar</Button>
            <button type="button" className="ml-auto text-xs font-semibold text-sky-700 underline" onClick={() => setSelected(new Set())}>
              Limpiar selección
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-slate-500 text-sm">Cargando viajes...</div>
        ) : rows.length === 0 ? (
          <EmptyState title="Sin viajes" subtitle="No hay viajes que coincidan con los filtros." />
        ) : (
          <>
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    {isAdmin && (
                      <th className="px-3 py-2 w-10">
                        <input type="checkbox" aria-label="Seleccionar visibles" checked={allSelected} onChange={toggleSelectAll} />
                      </th>
                    )}
                    <th className="px-3 py-2 font-medium">Referencia</th>
                    {showCompany && <th className="px-3 py-2 font-medium">Empresa</th>}
                    <th className="px-3 py-2 font-medium">Fecha servicio</th>
                    <th className="px-3 py-2 font-medium">Colaborador</th>
                    <th className="px-3 py-2 font-medium">Recorrido</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Conductor</th>
                    <th className="px-3 py-2 font-medium text-right">Valor</th>
                    <th className="px-3 py-2 font-medium">Factura</th>
                    {isAdmin && <th className="px-3 py-2 font-medium">Pago conductor</th>}
                    <th className="px-3 py-2 font-medium text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((b) => {
                    const cancellable = canCancelBooking(b, viewer);
                    const cancelled = b.status === "CANCELLED";
                    const billable = isBillableTrip(b);
                    return (
                      <tr key={b.id} className="border-t border-slate-100 hover:bg-slate-50 align-top">
                        {isAdmin && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Seleccionar ${b.reference}`}
                              checked={selected.has(b.id)}
                              disabled={!billable}
                              title={billable ? undefined : "Solo se facturan viajes completados"}
                              onChange={() => toggleSelect(b.id)}
                            />
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="font-mono text-xs font-semibold text-slate-800">{b.reference}</div>
                          <div className="text-xs text-slate-400">
                            {b.booking_type === "SCHEDULED" ? "Programado" : "Inmediato"}
                          </div>
                        </td>
                        {showCompany && <td className="px-3 py-3 font-medium text-slate-700">{b.company_name}</td>}
                        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(b.booking_date)}</td>
                        <td className="px-3 py-3">
                          <div className="font-medium text-slate-800">{b.collaborator_name}</div>
                          <div className="text-xs text-slate-400">{b.collaborator_contact || ""}</div>
                        </td>
                        <td className="px-3 py-3 max-w-[260px]">
                          <div className="truncate" title={b.pickup_address}>
                            <span className="text-green-600">●</span> {b.pickup_address}
                          </div>
                          <div className="truncate" title={b.drop_address}>
                            <span className="text-red-500">●</span> {b.drop_address}
                          </div>
                        </td>
                        <td className="px-3 py-3"><BookingStatusBadge status={b.status} /></td>
                        <td className="px-3 py-3">
                          {b.driver_name ? (
                            <>
                              <div className="text-slate-800">{b.driver_name}</div>
                              <div className="text-xs text-slate-400">{b.plate_number || ""}</div>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">Sin asignar</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {billable ? (
                            <span className="font-medium">{formatMoney(b.total_cost)}</span>
                          ) : cancelled ? (
                            <span className="text-slate-400">{formatMoney(0)}</span>
                          ) : (
                            <>
                              <div className="text-slate-500">{formatMoney(b.total_cost)}</div>
                              <div className="text-[11px] text-slate-400">Estimado</div>
                            </>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {billable ? (
                            <>
                              <InvoiceStatusBadge status={b.estado_facturacion} />
                              {b.factura_referencia && (
                                <div className="mt-0.5 font-mono text-[11px] text-slate-500">{b.factura_referencia}</div>
                              )}
                            </>
                          ) : (
                            <span className="text-xs text-slate-400">{cancelled ? "No se factura" : "Al completar"}</span>
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-3">
                            {!billable || !b.estado_pago_conductor ? (
                              <span className="text-xs text-slate-400">—</span>
                            ) : (
                              <PaymentStatusBadge status={b.estado_pago_conductor} />
                            )}
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="secondary"
                              className="!px-3 !py-1.5 !text-xs"
                              onClick={() => void openDetail(b)}
                              disabled={openingId === b.id}
                            >
                              <Eye size={14} />
                              {openingId === b.id ? "Abriendo..." : "Ver"}
                            </Button>
                            {!cancelled && (
                              <Button
                                variant="secondary"
                                className="!px-3 !py-1.5 !text-xs !text-rose-700 !border-rose-300"
                                disabled={!cancellable}
                                title={cancelHint(b)}
                                onClick={() => openCancel(b)}
                              >
                                <XCircle size={14} />
                                Cancelar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > visible && (
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                  Ver más ({rows.length - visible} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {detail && tripDetail && (
        <BookingModal
          open
          booking={tripDetail.booking}
          onClose={closeDetail}
          hideChat={!isAdmin}
          loadExtras={loadTripExtras}
          onCancel={canCancelBooking(detail, viewer) ? () => openCancel(detail) : undefined}
          extra={
            <section className="mx-4 mb-6 rounded-2xl border border-sky-200 bg-white p-5 sm:mx-6">
              <p className="mb-4 text-sm text-slate-600">
                <span className="font-semibold text-sky-700">Viaje empresarial</span> · {detail.company_name} · Colaborador{" "}
                {detail.collaborator_name} · Solicitado por {REQUESTED_BY[detail.requested_by] ?? detail.requested_by} · Pago
                empresarial
              </p>
              <CorporateBillingSection booking={detail} viewer={viewer} onChanged={load} />
            </section>
          }
        />
      )}

      <Modal
        open={!!detail && !tripDetail}
        onClose={closeDetail}
        title={detail ? `Viaje ${detail.reference}` : ""}
        size="xl"
        footer={
          detail && detail.status !== "CANCELLED" ? (
            <Button
              variant="secondary"
              className="!text-rose-700 !border-rose-300"
              disabled={!canCancelBooking(detail, viewer)}
              title={cancelHint(detail)}
              onClick={() => openCancel(detail)}
            >
              Cancelar viaje
            </Button>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-5">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <BookingStatusBadge status={detail.status} />
                <span className="text-xs text-slate-500">
                  {detail.booking_type === "SCHEDULED" ? "Programado" : "Inmediato"} · Pago empresarial
                </span>
              </div>
              {showCompany && <DetailRow label="Empresa">{detail.company_name}</DetailRow>}
              <DetailRow label="Colaborador">{detail.collaborator_name}</DetailRow>
              <DetailRow label="Contacto">
                {[detail.collaborator_contact, detail.collaborator_email].filter(Boolean).join(" · ")}
              </DetailRow>
              <DetailRow label="Fecha del servicio">{formatDateTime(detail.booking_date)}</DetailRow>
              <DetailRow label="Solicitado">
                {formatDateTime(detail.created_at)} · {REQUESTED_BY[detail.requested_by] ?? detail.requested_by}
              </DetailRow>
              <DetailRow label="Origen">{detail.pickup_address}</DetailRow>
              <DetailRow label="Destino">{detail.drop_address}</DetailRow>
              <DetailRow label="Recorrido">
                {[detail.trip_type, `${detail.distance_km} km`, `${detail.duration_min} min`].filter(Boolean).join(" · ")}
              </DetailRow>
              <DetailRow label="Categoría">{detail.car_type}</DetailRow>
              <DetailRow label="Conductor">
                {detail.driver_name
                  ? [detail.driver_name, detail.driver_contact, detail.plate_number].filter(Boolean).join(" · ")
                  : "Sin asignar"}
              </DetailRow>
              <DetailRow label="Observaciones">{detail.observations}</DetailRow>
              {detail.status === "CANCELLED" && (
                <DetailRow label="Cancelación">
                  {formatDateTime(detail.cancelled_at)} · {CANCELLED_BY[detail.cancelled_by ?? ""] ?? detail.cancelled_by} ·{" "}
                  {detail.cancel_reason}
                </DetailRow>
              )}
            </div>

            <CorporateBillingSection booking={detail} viewer={viewer} onChanged={load} />
          </div>
        )}
      </Modal>

      <BillingStatusModal
        change={billingChange}
        saving={savingBilling}
        onClose={() => setBillingChange(null)}
        onConfirm={confirmBilling}
      />

      <Modal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancelar viaje"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelTarget(null)}>Volver</Button>
            <Button onClick={confirmCancel} disabled={cancelling} className="!from-rose-500 !to-rose-600">
              {cancelling ? "Cancelando..." : "Confirmar cancelación"}
            </Button>
          </>
        }
      >
        {cancelTarget && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Vas a cancelar el viaje <strong>{cancelTarget.reference}</strong> de{" "}
              <strong>{cancelTarget.collaborator_name}</strong>. Esta acción no se puede deshacer.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Motivo (opcional)</label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-300 p-2 text-sm"
                placeholder="Ej. La reunión se reprogramó"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CompanyBookingsPanel;
