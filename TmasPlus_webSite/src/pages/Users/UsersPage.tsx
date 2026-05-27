import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { useDebounced } from "@/hooks/useDebounced";
import { classNames } from "@/utils/classNames";
import { toast } from "@/utils/toast";
import { exportToCsv } from "@/utils/exportCsv";
import { supabase, supabaseSecondary } from "@/config/supabase";
import {
  UsersSecondaryService,
  type SecondaryUser,
  type UpdateUserInput,
} from "@/services/usersSecondary.service";
import { DriversService } from "@/services/drivers.service";
import UserEditModal from "./UserEditModal";
import AddUserModal from "./AddUserModal";
import DriverReviewModal, { type EnrichedDriverProfile } from "./DriverReviewModal";

type StatusFilter = "todos" | "activos" | "congelados";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString();
}

function fullName(u: SecondaryUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
}

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<SecondaryUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [typeFilter, setTypeFilter] = useState<string>("todos");
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<SecondaryUser | null>(null);
  const [openAdd, setOpenAdd] = useState<null | "cliente" | "conductor">(null);
  const [selectedDriver, setSelectedDriver] = useState<EnrichedDriverProfile | null>(null);
  const [selectedDriverSource, setSelectedDriverSource] = useState<"primary" | "secondary">("primary");
  const [loadingProfileId, setLoadingProfileId] = useState<string | null>(null);

  const debouncedQuery = useDebounced(query);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await UsersSecondaryService.list();
      setUsers(data);
    } catch (e: any) {
      setError(e?.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const userTypes = useMemo(() => {
    const set = new Set<string>();
    users.forEach((u) => u.user_type && set.add(u.user_type));
    return Array.from(set).sort();
  }, [users]);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return users.filter((u) => {
      const matchesQ = q
        ? [u.id, u.first_name, u.last_name, u.email, u.mobile, u.city]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true;
      const matchesStatus =
        status === "todos"
          ? true
          : status === "congelados"
          ? !!u.blocked
          : !u.blocked;
      const matchesType =
        typeFilter === "todos" ? true : u.user_type === typeFilter;
      return matchesQ && matchesStatus && matchesType;
    });
  }, [users, debouncedQuery, status, typeFilter]);

  const handleToggleBlock = async (u: SecondaryUser) => {
    const willBlock = !u.blocked;
    if (
      !confirm(
        willBlock
          ? `¿Congelar a ${fullName(u)}? No podrá iniciar sesión.`
          : `¿Reactivar a ${fullName(u)}?`
      )
    )
      return;
    setActionLoadingId(u.id);
    try {
      const updated = await UsersSecondaryService.toggleBlock(u.id, willBlock);
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, ...updated } : x))
      );
    } catch (e: any) {
      alert(e?.message || "Error al cambiar estado");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDelete = async (u: SecondaryUser) => {
    if (
      !confirm(
        `¿Eliminar definitivamente a ${fullName(u)}? Esta acción no se puede deshacer.`
      )
    )
      return;
    setActionLoadingId(u.id);
    try {
      await UsersSecondaryService.delete(u.id);
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e: any) {
      alert(e?.message || "Error al eliminar usuario");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleSaveEdit = async (id: string, payload: UpdateUserInput) => {
    const updated = await UsersSecondaryService.update(id, payload);
    setUsers((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...updated } : x))
    );
  };

  const loadSecondaryDriverProfile = async (
    u: SecondaryUser
  ): Promise<EnrichedDriverProfile | null> => {
    if (!supabaseSecondary) return null;
    const sb = supabaseSecondary as any;

    const { data: userRow, error: userErr } = await sb
      .from("users")
      .select("*")
      .eq("id", u.id)
      .maybeSingle();
    if (userErr || !userRow) return null;

    const { data: cars } = await sb
      .from("cars")
      .select("*")
      .eq("driver_id", u.id)
      .limit(1);
    const activeVehicle = cars && cars[0] ? cars[0] : undefined;

    let companyData: any;
    if (activeVehicle?.features) {
      companyData = (activeVehicle.features as Record<string, any>).companyData;
    }

    return {
      ...(userRow as any),
      vehicle: activeVehicle,
      serviceType: (activeVehicle?.service_type as any) || "particular",
      companyData,
      referrerName: "Sin referencia",
    } as EnrichedDriverProfile;
  };

  const handleOpenExpediente = async (u: SecondaryUser) => {
    setLoadingProfileId(u.id);
    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("id", u.id)
        .maybeSingle();

      if (!existing) {
        const secondaryProfile = await loadSecondaryDriverProfile(u);
        if (!secondaryProfile) {
          toast.error(
            `${fullName(u)} no tiene expediente de conductor en ninguna BD.`
          );
          setEditing(u);
          return;
        }
        setSelectedDriverSource("secondary");
        setSelectedDriver(secondaryProfile);
        return;
      }

      const profile = await DriversService.getDriverProfile(u.id);
      if (!profile) {
        const secondaryProfile = await loadSecondaryDriverProfile(u);
        if (!secondaryProfile) {
          toast.error(
            `${fullName(u)} no tiene expediente de conductor.`
          );
          setEditing(u);
          return;
        }
        setSelectedDriverSource("secondary");
        setSelectedDriver(secondaryProfile);
        return;
      }

      let referrerName = "Sin referencia";
      if (profile.referral_id && profile.referral_id.trim() !== "") {
        const { data: refCodes } = await supabase
          .from("referral_codes")
          .select("driver_id")
          .eq("referral_code", profile.referral_id)
          .limit(1);
        const refCode = refCodes?.[0];
        if (refCode?.driver_id) {
          const { data: referrers } = await supabase
            .from("users")
            .select("first_name, last_name")
            .eq("id", refCode.driver_id)
            .limit(1);
          const referrer = referrers?.[0];
          if (referrer) {
            referrerName = `${referrer.first_name} ${referrer.last_name}`;
          }
        }
      }

      setSelectedDriverSource("primary");
      setSelectedDriver({ ...profile, referrerName });
    } catch (e: any) {
      toast.error(e?.message || "Error al cargar el expediente");
    } finally {
      setLoadingProfileId(null);
    }
  };

  const handleApproveDriver = async (id: string) => {
    if (selectedDriverSource === "secondary") {
      await UsersSecondaryService.update(id, { approved: true });
    } else {
      await DriversService.approveDriver(id, "admin-dashboard");
    }
    toast.success("Conductor aprobado exitosamente.");
  };

  const handleRejectDriver = async (id: string) => {
    if (selectedDriverSource === "secondary") {
      await UsersSecondaryService.update(id, { approved: false });
    } else {
      await DriversService.rejectDriver(id, "Documentos inválidos", "admin-dashboard");
    }
    toast.success("Conductor rechazado.");
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) {
      toast.error("No hay usuarios para exportar.");
      return;
    }
    const dateStamp = new Date().toISOString().slice(0, 10);
    exportToCsv(`usuarios_${dateStamp}`, filtered, [
      { header: "ID", value: (u) => u.id },
      { header: "Nombre", value: (u) => u.first_name || "" },
      { header: "Apellido", value: (u) => u.last_name || "" },
      { header: "Correo", value: (u) => u.email || "" },
      { header: "Teléfono", value: (u) => u.mobile || "" },
      { header: "Ciudad", value: (u) => u.city || "" },
      { header: "Tipo", value: (u) => u.user_type || "" },
      { header: "Estado", value: (u) => (u.blocked ? "Congelado" : "Activo") },
      { header: "Alta", value: (u) => formatDate(u.created_at) },
    ]);
  };

  return (
    <Page
      title="Listado de Usuarios"
      actions={
        <>
          <Button variant="secondary" onClick={handleExportCsv}>
            Exportar CSV
          </Button>
          <Button variant="secondary" onClick={load}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
          <Button variant="secondary" onClick={() => setOpenAdd("conductor")}>Añadir conductor</Button>
          <Button onClick={() => setOpenAdd("cliente")}>Añadir cliente</Button>
        </>
      }
    >
      {/* Filtros superiores */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs
          tabs={[{ value: "clientes", label: "Clientes" }]}
          value="clientes"
          onChange={() => {}}
        />
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <Input
            placeholder="Buscar por nombre, email, teléfono..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar usuarios"
          />
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
          >
            <option value="todos">Todos</option>
            <option value="activos">Activos</option>
            <option value="congelados">Congelados</option>
          </select>
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="todos">Todos los tipos</option>
            {userTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
          {error}
        </div>
      )}

      <div className="mt-4">
        <Card title="Clientes">
          {loading ? (
            <div className="p-6 text-center text-slate-500 text-sm">
              Cargando usuarios...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              subtitle="Ajusta los filtros o espera a que se registren usuarios."
            />
          ) : (
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 font-medium">Usuario</th>
                    <th className="px-3 py-2 font-medium">Correo</th>
                    <th className="px-3 py-2 font-medium">Teléfono</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Estado</th>
                    <th className="px-3 py-2 font-medium">Alta</th>
                    <th className="px-3 py-2 font-medium text-center">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => {
                    const busy = actionLoadingId === u.id;
                    const blocked = !!u.blocked;
                    return (
                      <motion.tr
                        key={u.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.15 }}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            {u.profile_image ? (
                              <img
                                src={u.profile_image}
                                alt="avatar"
                                className="w-9 h-9 rounded-full object-cover border border-slate-200"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs font-semibold">
                                {(u.first_name?.[0] || "?").toUpperCase()}
                              </div>
                            )}
                            <div>
                              <div className="font-medium text-slate-800">
                                {fullName(u)}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">
                                {u.id.slice(0, 8)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">{u.email || "—"}</td>
                        <td className="px-3 py-3">{u.mobile || "—"}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-slate-100 text-slate-700 border border-slate-200">
                            {u.user_type || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={classNames(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                              blocked
                                ? "bg-sky-50 text-sky-700 border-sky-200"
                                : "bg-green-50 text-green-700 border-green-200"
                            )}
                          >
                            {blocked ? "Congelado" : "Activo"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {formatDate(u.created_at)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-2 flex-wrap">
                            <Button
                              variant="secondary"
                              onClick={() => handleOpenExpediente(u)}
                              disabled={loadingProfileId === u.id}
                              className="!px-3 !py-1.5 !text-xs"
                            >
                              {loadingProfileId === u.id ? "Cargando..." : "Editar"}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handleToggleBlock(u)}
                              disabled={busy}
                              className={classNames(
                                "!px-3 !py-1.5 !text-xs",
                                blocked
                                  ? "!text-green-700 !border-green-300"
                                  : "!text-sky-700 !border-sky-300"
                              )}
                            >
                              {busy
                                ? "..."
                                : blocked
                                ? "Reactivar"
                                : "Congelar"}
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => handleDelete(u)}
                              disabled={busy}
                              className="!px-3 !py-1.5 !text-xs !text-rose-700 !border-rose-300"
                            >
                              {busy ? "..." : "Eliminar"}
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <UserEditModal
        open={!!editing}
        user={editing}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />

      <DriverReviewModal
        open={!!selectedDriver}
        driver={selectedDriver}
        source={selectedDriverSource}
        onClose={() => setSelectedDriver(null)}
        onApprove={handleApproveDriver}
        onReject={handleRejectDriver}
        onRefresh={load}
      />

      <AddUserModal
        open={openAdd !== null}
        lockedType={openAdd ?? undefined}
        onClose={() => setOpenAdd(null)}
        onSubmit={() => {
          setOpenAdd(null);
          load();
        }}
      />
    </Page>
  );
};

export default UsersPage;
