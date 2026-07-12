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
import { chunk } from "@/utils/chunk";
import { vehicleCategoryLabel } from "@/utils/vehicleCategory";
import { supabase, supabaseSecondary } from "@/config/supabase";
import {
  UsersSecondaryService,
  type SecondaryUser,
  type UpdateUserInput,
} from "@/services/usersSecondary.service";
import { DriversService } from "@/services/drivers.service";
import {
  MembershipsService,
  type MembershipStatus,
} from "@/services/memberships.service";
import UserEditModal from "./UserEditModal";
import AddUserModal from "./AddUserModal";
import DriverReviewModal, { type EnrichedDriverProfile } from "./DriverReviewModal";

type StatusFilter = "todos" | "activos" | "bloqueados";

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString();
}

function fullName(u: SecondaryUser) {
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || "—";
}

const MEMBERSHIP_STYLES: Record<string, string> = {
  ACTIVA: "bg-emerald-50 text-emerald-700 border-emerald-200",
  INACTIVA: "bg-slate-100 text-slate-600 border-slate-200",
  CANCELADA: "bg-rose-50 text-rose-700 border-rose-200",
  VENCIDA: "bg-amber-50 text-amber-700 border-amber-200",
};

function MembershipBadge({ status }: { status?: MembershipStatus | string }) {
  if (!status) {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-slate-50 text-slate-400 border-slate-200">
        Sin membresía
      </span>
    );
  }
  const cls =
    MEMBERSHIP_STYLES[String(status)] ||
    "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <span
      className={classNames(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs border font-medium",
        cls
      )}
    >
      {String(status)}
    </span>
  );
}

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<SecondaryUser[]>([]);
  const [membershipMap, setMembershipMap] = useState<
    Record<string, MembershipStatus | string>
  >({});
  // Categoría (service_type) del vehículo activo, resuelta por user.id.
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  // Cuántos conductores ha referido cada usuario (referral_codes.total_referrals,
  // proyecto primario), mapeado por users.id.
  const [referralCountMap, setReferralCountMap] = useState<Record<string, number>>({});
  // Cédula tomada de la BD primaria, solo como respaldo cuando la secundaria
  // no la tiene; keyed por user.id.
  const [cedulaFallbackMap, setCedulaFallbackMap] = useState<Record<string, string>>({});
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
      const [data, memberships] = await Promise.all([
        UsersSecondaryService.list(),
        MembershipsService.statusByConductor().catch(() => ({})),
      ]);
      setUsers(data);
      setMembershipMap(memberships);
      // No bloqueamos la tabla por la cédula/categoría: se enriquece aparte.
      enrich(data);
    } catch (e: any) {
      setError(e?.message || "Error al cargar usuarios");
    } finally {
      setLoading(false);
    }
  };

  // Resuelve la categoría del vehículo activo y la cédula de respaldo (primaria)
  // para la lista actual. La categoría se busca primero en la App (secundaria) y,
  // si falta, en el registro web (primaria). La cédula secundaria ya viene en la
  // fila; aquí solo cubrimos las que no la tengan.
  const enrich = async (rows: SecondaryUser[]) => {
    if (rows.length === 0) {
      setCategoryMap({});
      setCedulaFallbackMap({});
      return;
    }

    // ids (users.id + auth_id) usados como driver_id en la tabla cars.
    const idPairs = rows.map((u) => ({ id: u.id, authId: u.auth_id }));
    const allDriverIds = idPairs.flatMap((p) =>
      [p.id, p.authId].filter(Boolean) as string[]
    );

    // 1) Categoría desde la App (secundaria).
    const secCats = await UsersSecondaryService.categoriesByDriver(
      allDriverIds
    ).catch(() => ({} as Record<string, string>));

    const catByUser: Record<string, string> = {};
    for (const { id, authId } of idPairs) {
      const c = secCats[id] || (authId ? secCats[authId] : undefined);
      if (c) catByUser[id] = c;
    }

    // 2) Respaldo de categoría desde la primaria para los que falten.
    const missingCat = idPairs.filter(({ id }) => !catByUser[id]);
    if (missingCat.length > 0) {
      const missingDriverIds = missingCat.flatMap(({ id, authId }) =>
        [id, authId].filter(Boolean) as string[]
      );
      // Un solo `.in()` con cientos de UUIDs genera una URL que supera el
      // límite del gateway (~25KB) y responde 400 Bad Request; se parte en bloques.
      const primaryByDriver: Record<string, string> = {};
      for (const idsChunk of chunk(missingDriverIds)) {
        const { data: primaryCars } = await supabase
          .from("cars")
          .select("driver_id, service_type, is_active, updated_at")
          .in("driver_id", idsChunk)
          .order("is_active", { ascending: false })
          .order("updated_at", { ascending: false });
        for (const row of (primaryCars || []) as Array<{
          driver_id: string;
          service_type: string | null;
        }>) {
          if (row.driver_id && row.service_type && !primaryByDriver[row.driver_id]) {
            primaryByDriver[row.driver_id] = row.service_type;
          }
        }
      }
      for (const { id, authId } of missingCat) {
        const c = primaryByDriver[id] || (authId ? primaryByDriver[authId] : undefined);
        if (c) catByUser[id] = c;
      }
    }
    setCategoryMap(catByUser);

    // 3) Cédula de respaldo (primaria/App) para usuarios sin document_number en
    // la BD del Dashboard. En la App la cédula se guarda en `license_number`
    // (esa tabla NO tiene columna `document_number`).
    const missingCedulaIds = rows
      .filter((u) => !u.document_number)
      .map((u) => u.id);
    if (missingCedulaIds.length > 0) {
      const cedulaByUser: Record<string, string> = {};
      for (const idsChunk of chunk(missingCedulaIds)) {
        const { data: primaryUsers } = await supabase
          .from("users")
          .select("id, license_number")
          .in("id", idsChunk);
        for (const row of (primaryUsers || []) as Array<{
          id: string;
          license_number: string | null;
        }>) {
          if (row.license_number) cedulaByUser[row.id] = row.license_number;
        }
      }
      setCedulaFallbackMap(cedulaByUser);
    } else {
      setCedulaFallbackMap({});
    }

    // 4) Cuántos ha referido cada usuario: referral_codes.total_referrals (BD
    // primaria), buscando por driver_id (users.id o auth_id en filas heredadas).
    // Igual que arriba: se parte en bloques para no superar el límite de URL.
    const refByDriver: Record<string, number> = {};
    for (const idsChunk of chunk(allDriverIds)) {
      const { data: refCodes } = await supabase
        .from("referral_codes")
        .select("driver_id, total_referrals")
        .in("driver_id", idsChunk);
      for (const row of (refCodes || []) as Array<{
        driver_id: string;
        total_referrals: number | null;
      }>) {
        if (row.driver_id) refByDriver[row.driver_id] = row.total_referrals ?? 0;
      }
    }
    const refByUser: Record<string, number> = {};
    for (const { id, authId } of idPairs) {
      const count = refByDriver[id] ?? (authId ? refByDriver[authId] : undefined);
      if (count !== undefined) refByUser[id] = count;
    }
    setReferralCountMap(refByUser);
  };

  const cedulaFor = (u: SecondaryUser): string =>
    u.document_number || cedulaFallbackMap[u.id] || "";

  // La App guarda la categoría tanto denormalizada en users.car_type
  // ("T+Plus Taxi"…) como en cars.service_type. Priorizamos car_type por ser el
  // dato propio de la App; si falta, usamos el mapa (cars secundaria → primaria).
  const categoryFor = (u: SecondaryUser): string | undefined =>
    (u.car_type as string | undefined) || categoryMap[u.id];

  // Cuántos conductores ha referido este usuario (0 si no tiene código propio aún).
  const referralsFor = (u: SecondaryUser): number => referralCountMap[u.id] ?? 0;

  // memberships.conductor guarda users.auth_id (o users.id en filas heredadas),
  // así que probamos ambos identificadores del usuario.
  const membershipFor = (u: SecondaryUser): MembershipStatus | string | undefined =>
    (u.auth_id && membershipMap[u.auth_id]) || membershipMap[u.id];

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
        ? [u.id, u.first_name, u.last_name, u.email, u.mobile, u.city, cedulaFor(u)]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q))
        : true;
      const matchesStatus =
        status === "todos"
          ? true
          : status === "bloqueados"
          ? !!u.blocked
          : !u.blocked;
      const matchesType =
        typeFilter === "todos" ? true : u.user_type === typeFilter;
      return matchesQ && matchesStatus && matchesType;
    });
  }, [users, debouncedQuery, status, typeFilter, cedulaFallbackMap]);

  const handleToggleBlock = async (u: SecondaryUser) => {
    const willBlock = !u.blocked;
    if (
      !confirm(
        willBlock
          ? `¿Quitar la aprobación a ${fullName(u)}? No podrá iniciar sesión.`
          : `¿Aprobar a ${fullName(u)}? Podrá iniciar sesión en la app.`
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

    // Usa el servicio (sincroniza la sesión) para que el RLS deje leer users y cars.
    const { user: userRow, car: activeVehicle } =
      await UsersSecondaryService.getUserWithVehicle(u.id, u.auth_id);
    if (!userRow) return null;

    let companyData: any;
    if (activeVehicle?.features) {
      companyData = (activeVehicle.features as Record<string, any>).companyData;
    }

    return {
      ...(userRow as any),
      vehicle: activeVehicle ?? undefined,
      serviceType: (activeVehicle?.service_type as any) || "particular",
      companyData,
      referrerName: "Sin referencia",
    } as EnrichedDriverProfile;
  };

  const handleOpenExpediente = async (u: SecondaryUser) => {
    setLoadingProfileId(u.id);
    try {
      // /users lista la base secundaria (App), así que el expediente —y en
      // particular el vehículo— debe leerse de la secundaria como fuente de
      // verdad. La primaria solo se usa como respaldo si no hay fila secundaria.
      const secondaryProfile = await loadSecondaryDriverProfile(u);
      if (secondaryProfile) {
        // Respaldo: si no hay vehículo en la secundaria pero sí en la primaria
        // (conductores importados antes de sincronizar el vehículo), lo adjuntamos.
        if (!secondaryProfile.vehicle) {
          const driverIds = [u.id, u.auth_id].filter(Boolean) as string[];
          const { data: primaryCars } = await supabase
            .from("cars")
            .select("*")
            .in("driver_id", driverIds)
            .limit(1);
          const primaryCar = primaryCars?.[0];
          if (primaryCar) {
            secondaryProfile.vehicle = primaryCar as any;
            secondaryProfile.serviceType = (primaryCar.service_type as any) || "particular";
          }
        }
        // La cédula puede vivir solo en la App (license_number). Inyectamos el
        // valor ya resuelto (incluye el respaldo) para que el modal lo muestre y
        // permita editarlo, tanto en clientes (document_number) como conductores.
        const cedulaResuelta = cedulaFor(u) || null;
        (secondaryProfile as any).document_number =
          (secondaryProfile as any).document_number || cedulaResuelta;
        (secondaryProfile as any).license_number =
          (secondaryProfile as any).license_number || cedulaResuelta;
        setSelectedDriverSource("secondary");
        setSelectedDriver(secondaryProfile);
        return;
      }

      const profile = await DriversService.getDriverProfile(u.id);
      if (!profile) {
        toast.error(
          `${fullName(u)} no tiene expediente de conductor en ninguna BD.`
        );
        setEditing(u);
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
      await UsersSecondaryService.setApproved(id, true);
    } else {
      await DriversService.approveDriver(id, "admin-dashboard");
    }
    toast.success("Conductor aprobado exitosamente.");
  };

  const handleRejectDriver = async (id: string) => {
    if (selectedDriverSource === "secondary") {
      await UsersSecondaryService.setApproved(id, false);
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
      { header: "Cédula", value: (u) => cedulaFor(u) },
      { header: "Correo", value: (u) => u.email || "" },
      { header: "Teléfono", value: (u) => u.mobile || "" },
      { header: "Referidos", value: (u) => String(referralsFor(u)) },
      { header: "Ciudad", value: (u) => u.city || "" },
      { header: "Categoría", value: (u) => (categoryFor(u) ? vehicleCategoryLabel(categoryFor(u)) : "") },
      { header: "Tipo", value: (u) => u.user_type || "" },
      { header: "Membresía", value: (u) => (membershipFor(u) ? String(membershipFor(u)) : "Sin membresía") },
      { header: "Estado", value: (u) => (u.blocked ? "No aprobado" : "Aprobado") },
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
            <option value="activos">Aprobados</option>
            <option value="bloqueados">No aprobados</option>
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
                    <th className="px-3 py-2 font-medium">Cédula</th>
                    <th className="px-3 py-2 font-medium">Correo</th>
                    <th className="px-3 py-2 font-medium">Teléfono</th>
                    <th className="px-3 py-2 font-medium text-center">Referidos</th>
                    <th className="px-3 py-2 font-medium">Categoría</th>
                    <th className="px-3 py-2 font-medium">Tipo</th>
                    <th className="px-3 py-2 font-medium">Membresía</th>
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
                    // Estado único: aprobado = no bloqueado (bloquear = quitar
                    // aprobación, aprobar = desbloquear; es el mismo eje).
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
                        <td className="px-3 py-3 font-mono text-xs text-slate-700">
                          {cedulaFor(u) || "—"}
                        </td>
                        <td className="px-3 py-3">{u.email || "—"}</td>
                        <td className="px-3 py-3">{u.mobile || "—"}</td>
                        <td className="px-3 py-3 text-center">
                          {referralsFor(u) > 0 ? (
                            <span className="inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              {referralsFor(u)}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">0</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {categoryFor(u) ? (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs border bg-indigo-50 text-indigo-700 border-indigo-200 font-medium">
                              {vehicleCategoryLabel(categoryFor(u))}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs bg-slate-100 text-slate-700 border border-slate-200">
                            {u.user_type || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <MembershipBadge status={membershipFor(u)} />
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={classNames(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-xs border",
                              blocked
                                ? "bg-red-50 text-red-700 border-red-200"
                                : "bg-green-50 text-green-700 border-green-200"
                            )}
                          >
                            {blocked ? "No aprobado" : "Aprobado"}
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
                                  : "!text-red-700 !border-red-300"
                              )}
                            >
                              {busy
                                ? "..."
                                : blocked
                                ? "Aprobar"
                                : "Desaprobar"}
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
