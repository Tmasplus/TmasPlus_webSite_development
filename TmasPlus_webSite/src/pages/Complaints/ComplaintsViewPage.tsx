import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { motion } from "framer-motion";
import { ComplaintsService } from "@/services/complaints.service";
import type {
  ComplaintFilters,
  ComplaintPriority,
  ComplaintStatus,
  ComplaintType,
  ComplaintWithUser,
} from "@/config/database.types";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/utils/toast";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  resolved: "Resuelto",
  rejected: "Rechazado",
};

const STATUS_BADGE: Record<ComplaintStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-green-100 text-green-800",
  rejected: "bg-slate-200 text-slate-700",
};

const PRIORITY_BADGE: Record<ComplaintPriority, string> = {
  alta: "bg-red-100 text-red-800",
  media: "bg-amber-100 text-amber-800",
  baja: "bg-slate-100 text-slate-700",
};

const TYPE_LABEL: Record<ComplaintType, string> = {
  queja: "Queja",
  reclamo: "Reclamo",
  sugerencia: "Sugerencia",
};

export default function ComplaintsViewPage() {
  const { profile } = useAuth();

  const [rows, setRows] = useState<ComplaintWithUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState<ComplaintFilters>({
    status: "all",
    priority: "all",
    complaint_type: "all",
    user_type: "all",
    searchQuery: "",
  });
  const [searchInput, setSearchInput] = useState("");

  const [selected, setSelected] = useState<ComplaintWithUser | null>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [markResolved, setMarkResolved] = useState(false);
  const [saving, setSaving] = useState(false);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / PAGE_SIZE)),
    [total]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await ComplaintsService.getComplaints(filters, {
        page,
        limit: PAGE_SIZE,
      });
      setRows(result.data);
      setTotal(result.total);
    } catch {
      // El servicio ya muestra el toast de error
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const applySearch = () => {
    setPage(1);
    setFilters((prev) => ({ ...prev, searchQuery: searchInput.trim() }));
  };

  const exportToCSV = () => {
    if (rows.length === 0) {
      toast.info("No hay quejas para exportar");
      return;
    }

    const headers = [
      "Fecha",
      "Tipo",
      "Asunto",
      "Descripción",
      "Prioridad",
      "Estado",
      "Tipo Usuario",
      "Usuario",
      "Email",
      "Respuesta Admin",
      "Resuelto en",
    ];

    const csvRows = rows.map((c) => [
      new Date(c.created_at).toLocaleString(),
      c.complaint_type,
      c.subject,
      c.body,
      c.priority,
      STATUS_LABEL[c.status as ComplaintStatus] ?? c.status,
      c.user_type,
      c.user ? `${c.user.first_name} ${c.user.last_name}` : "",
      c.user?.email ?? "",
      c.admin_response ?? "",
      c.resolved_at ? new Date(c.resolved_at).toLocaleString() : "",
    ]);

    const csvContent = [headers, ...csvRows]
      .map((row) =>
        row
          .map((v) =>
            typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "quejas.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openDetails = (complaint: ComplaintWithUser) => {
    setSelected(complaint);
    setAdminResponse(complaint.admin_response ?? "");
    setMarkResolved(complaint.status === "resolved");
  };

  const closeDetails = () => {
    setSelected(null);
    setAdminResponse("");
    setMarkResolved(false);
  };

  const handleSaveResponse = async () => {
    if (!selected) return;
    if (!adminResponse.trim()) {
      toast.warning("Escribe una respuesta antes de guardar");
      return;
    }
    setSaving(true);
    try {
      await ComplaintsService.respond(
        selected.id,
        adminResponse.trim(),
        profile?.id ?? null,
        markResolved
      );
      toast.success(
        markResolved ? "Queja resuelta" : "Respuesta guardada"
      );
      closeDetails();
      fetchData();
    } catch {
      // toast manejado en el servicio
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (
    complaint: ComplaintWithUser,
    status: ComplaintStatus
  ) => {
    try {
      await ComplaintsService.setStatus(complaint.id, status, profile?.id ?? null);
      toast.success(`Estado actualizado a "${STATUS_LABEL[status]}"`);
      fetchData();
    } catch {
      // toast manejado en el servicio
    }
  };

  const evidenceCount = (c: ComplaintWithUser) =>
    ComplaintsService.parseEvidenceUrls(c.evidence_urls).length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Quejas y Reclamos
        </h1>
        <Button onClick={exportToCSV}>Exportar CSV</Button>
      </div>

      {/* Filtros */}
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Estado</label>
            <select
              value={filters.status}
              onChange={(e) => {
                setPage(1);
                setFilters((p) => ({
                  ...p,
                  status: e.target.value as ComplaintFilters["status"],
                }));
              }}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="in_progress">En proceso</option>
              <option value="resolved">Resuelto</option>
              <option value="rejected">Rechazado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Prioridad</label>
            <select
              value={filters.priority}
              onChange={(e) => {
                setPage(1);
                setFilters((p) => ({
                  ...p,
                  priority: e.target.value as ComplaintFilters["priority"],
                }));
              }}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
            >
              <option value="all">Todas</option>
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Tipo</label>
            <select
              value={filters.complaint_type}
              onChange={(e) => {
                setPage(1);
                setFilters((p) => ({
                  ...p,
                  complaint_type: e.target.value as ComplaintFilters["complaint_type"],
                }));
              }}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="queja">Queja</option>
              <option value="reclamo">Reclamo</option>
              <option value="sugerencia">Sugerencia</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Usuario</label>
            <select
              value={filters.user_type}
              onChange={(e) => {
                setPage(1);
                setFilters((p) => ({
                  ...p,
                  user_type: e.target.value as ComplaintFilters["user_type"],
                }));
              }}
              className="w-full border border-slate-300 rounded-lg p-2 text-sm"
            >
              <option value="all">Todos</option>
              <option value="driver">Conductor</option>
              <option value="customer">Cliente</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Buscar</label>
            <div className="flex gap-2">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applySearch();
                }}
                placeholder="Asunto o descripción"
                className="w-full border border-slate-300 rounded-lg p-2 text-sm"
              />
              <Button variant="secondary" onClick={applySearch}>
                Buscar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Asunto</th>
              <th className="p-3">Usuario</th>
              <th className="p-3">Prioridad</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-center">Evidencias</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  Cargando...
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-500">
                  No hay quejas con los filtros seleccionados.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((c) => {
                const status = (c.status as ComplaintStatus) || "pending";
                const priority = (c.priority as ComplaintPriority) || "media";
                const type = (c.complaint_type as ComplaintType) || "queja";
                return (
                  <motion.tr
                    key={c.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-b hover:bg-slate-50 align-top"
                  >
                    <td className="p-3 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="font-medium">
                        {TYPE_LABEL[type] ?? c.complaint_type}
                      </div>
                      <div className="text-xs text-slate-500 capitalize">
                        {c.user_type}
                      </div>
                    </td>
                    <td className="p-3 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">
                        {c.subject}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2">
                        {c.body}
                      </div>
                    </td>
                    <td className="p-3">
                      {c.user ? (
                        <>
                          <div>
                            {c.user.first_name} {c.user.last_name}
                          </div>
                          <div className="text-xs text-slate-500">
                            {c.user.email}
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-semibold capitalize ${
                          PRIORITY_BADGE[priority] ?? PRIORITY_BADGE.media
                        }`}
                      >
                        {priority}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          STATUS_BADGE[status] ?? STATUS_BADGE.pending
                        }`}
                      >
                        {STATUS_LABEL[status] ?? c.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">{evidenceCount(c)}</td>
                    <td className="p-3 text-center space-x-2 whitespace-nowrap">
                      <Button onClick={() => openDetails(c)}>Detalles</Button>
                      {status !== "resolved" && status !== "rejected" && (
                        <Button
                          variant="secondary"
                          onClick={() => handleStatusChange(c, "rejected")}
                        >
                          Rechazar
                        </Button>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
          </tbody>
        </table>
      </Card>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
        <div>
          {total} resultado{total === 1 ? "" : "s"} · Página {page} de{" "}
          {totalPages}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
          >
            ← Anterior
          </Button>
          <Button
            variant="secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
          >
            Siguiente →
          </Button>
        </div>
      </div>

      {/* Modal de detalles / respuesta */}
      <Modal
        open={!!selected}
        onClose={closeDetails}
        title="Detalle de la queja"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeDetails}>
              Cancelar
            </Button>
            <Button onClick={handleSaveResponse} disabled={saving}>
              {saving ? "Guardando..." : markResolved ? "Resolver" : "Guardar respuesta"}
            </Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Fecha</div>
                <div>{new Date(selected.created_at).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Tipo</div>
                <div className="capitalize">{selected.complaint_type}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Prioridad</div>
                <div className="capitalize">{selected.priority}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Estado</div>
                <div>
                  {STATUS_LABEL[selected.status as ComplaintStatus] ??
                    selected.status}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Usuario</div>
                <div>
                  {selected.user
                    ? `${selected.user.first_name} ${selected.user.last_name}`
                    : "—"}
                </div>
                {selected.user?.email && (
                  <div className="text-xs text-slate-500">
                    {selected.user.email}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs text-slate-500">Tipo de usuario</div>
                <div className="capitalize">{selected.user_type}</div>
              </div>
              {selected.booking_id && (
                <div className="col-span-2">
                  <div className="text-xs text-slate-500">Reserva asociada</div>
                  <div className="font-mono text-xs">{selected.booking_id}</div>
                </div>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">Asunto</div>
              <div className="font-medium">{selected.subject}</div>
            </div>

            <div>
              <div className="text-xs text-slate-500 mb-1">Descripción</div>
              <div className="whitespace-pre-wrap text-sm bg-slate-50 rounded-lg p-3 border border-slate-200">
                {selected.body}
              </div>
            </div>

            {ComplaintsService.parseEvidenceUrls(selected.evidence_urls).length >
              0 && (
              <div>
                <div className="text-xs text-slate-500 mb-1">Evidencias</div>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  {ComplaintsService.parseEvidenceUrls(
                    selected.evidence_urls
                  ).map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-600 hover:underline break-all"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <label className="block text-sm text-slate-600 mb-1">
                Respuesta del administrador
              </label>
              <textarea
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                rows={4}
                placeholder="Escribe la respuesta para el usuario..."
                className="w-full border border-slate-300 rounded-lg p-2 text-sm"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={markResolved}
                onChange={(e) => setMarkResolved(e.target.checked)}
              />
              Marcar como resuelta al guardar
            </label>

            {selected.resolved_at && (
              <div className="text-xs text-slate-500">
                Resuelta el{" "}
                {new Date(selected.resolved_at).toLocaleString()}
                {selected.resolved_by ? ` por admin ${selected.resolved_by}` : ""}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
