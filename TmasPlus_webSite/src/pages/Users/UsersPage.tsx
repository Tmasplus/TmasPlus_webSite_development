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
import {
  UsersSecondaryService,
  type SecondaryUser,
  type UpdateUserInput,
} from "@/services/usersSecondary.service";
import UserEditModal from "./UserEditModal";

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

  return (
    <Page
      title="Listado de Usuarios"
      actions={
        <>
          <Button variant="secondary" onClick={load}>
            {loading ? "Cargando..." : "Refrescar"}
          </Button>
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
                              onClick={() => setEditing(u)}
                              className="!px-3 !py-1.5 !text-xs"
                            >
                              Editar
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
    </Page>
  );
};

export default UsersPage;
