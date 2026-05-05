import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate } from "@/utils/formatDate";
import { classNames } from "@/utils/classNames";
import { toast } from "@/utils/toast";
import {
  MembershipsService,
  type MembershipWithUser,
} from "@/services/memberships.service";
import CreateMembershipModal from "./CreateMembershipModal";
import EditMembershipModal from "./EditMembershipModal";

const formatCOP = (value: string | number) => {
  const n = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });
};

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    ACTIVA: "bg-emerald-100 text-emerald-700 border-emerald-200",
    INACTIVA: "bg-slate-100 text-slate-700 border-slate-200",
    CANCELADA: "bg-red-100 text-red-700 border-red-200",
    VENCIDA: "bg-amber-100 text-amber-700 border-amber-200",
  };
  const cls = map[status] || "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        cls
      )}
    >
      {status}
    </span>
  );
};

export default function MembershipsPage() {
  const [memberships, setMemberships] = useState<MembershipWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedMembership, setSelectedMembership] = useState<MembershipWithUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await MembershipsService.list();
      setMemberships(data);
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar las membresías");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleEdit = (membership: MembershipWithUser) => {
    console.log("Editing membership:", membership);
    setSelectedMembership(membership);
    setEditModalOpen(true);
  };

  const handleDelete = async (membership: MembershipWithUser) => {
    const confirmed = window.confirm(
      `¿Estás seguro de que quieres eliminar la membresía de ${membership.user?.first_name} ${membership.user?.last_name}? Esta acción no se puede deshacer.`
    );

    if (!confirmed) return;

    try {
      await MembershipsService.delete(membership.uid);
      toast.success("Membresía eliminada exitosamente");
      load(); // Recargar la lista
    } catch (e: any) {
      toast.error(e?.message || "Error al eliminar la membresía");
    }
  };

  return (
    <Page
      title="Membresías"
      actions={
        <Button onClick={() => setModalOpen(true)}>+ Nueva Membresía</Button>
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card>
          {!loading && memberships.length > 0 && (
            <div className="mb-4">
              <Button
                variant="ghost"
                onClick={() => handleEdit(memberships[0])}
                className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 px-3 py-1 text-xs"
              >
                Editar
              </Button>
            </div>
          )}

          {loading ? (
            <div className="py-16 flex items-center justify-center text-slate-500">
              Cargando membresías...
            </div>
          ) : memberships.length === 0 ? (
            <EmptyState
              title="Sin membresías"
              subtitle="Crea la primera membresía para comenzar"
            />
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">#</th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Conductor
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Estado
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Costo
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Inicio
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Fin
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Periodo
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Creada
                    </th>
                    <th className="px-3 py-2 font-medium whitespace-nowrap">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {memberships.map((m, idx) => (
                    <tr
                      key={m.uid}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-3 py-3 text-slate-500">{idx}</td>
                      <td className="px-3 py-3">
                        {m.user ? (
                          <div className="flex items-center gap-3">
                            <img
                              src={
                                m.user.profile_image ||
                                "https://ui-avatars.com/api/?name=" +
                                  encodeURIComponent(
                                    `${m.user.first_name} ${m.user.last_name}`
                                  )
                              }
                              alt={m.user.first_name}
                              className="w-8 h-8 rounded-full object-cover"
                            />
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">
                                {m.user.first_name} {m.user.last_name}
                              </div>
                              <div className="text-xs text-slate-500 truncate">
                                {m.user.email}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 break-all">
                            {m.conductor}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={String(m.status)} />
                      </td>
                      <td className="px-3 py-3 font-medium text-slate-800">
                        {formatCOP(m.costo)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatDate(m.fecha_inicio)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatDate(m.fecha_terminada)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {m.periodo} días
                      </td>
                      <td className="px-3 py-3 text-slate-500">
                        {formatDate(m.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          variant="ghost"
                          onClick={() => handleDelete(m)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1 text-xs"
                        >
                          Eliminar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      <CreateMembershipModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={load}
      />

      <EditMembershipModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onUpdated={load}
        membership={selectedMembership}
      />
    </Page>
  );
}
