import React, { useMemo, useReducer, useState } from "react";
import { USERS_MOCK, type User } from "@/data/mockUsers";
import { useDebounced } from "@/hooks/useDebounced";
import { formatDate } from "@/utils/formatDate";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { classNames } from "@/utils/classNames";
import AddUserModal from "./AddUserModal";

type UsersState = {
  query: string;
  status: "todos" | User["status"];
  page: number;
  pageSize: number;
};

type UsersAction =
  | { type: "query"; value: string }
  | { type: "status"; value: UsersState["status"] }
  | { type: "page"; value: number };

function usersReducer(state: UsersState, action: UsersAction): UsersState {
  switch (action.type) {
    case "query":
      return { ...state, query: action.value, page: 1 };
    case "status":
      return { ...state, status: action.value, page: 1 };
    case "page":
      return { ...state, page: action.value };
    default:
      return state;
  }
}

export const UsersPage: React.FC = () => {
  const [state, dispatch] = useReducer(usersReducer, {
    query: "",
    status: "todos",
    page: 1,
    pageSize: 10,
  });

  const debouncedQuery = useDebounced(state.query);
  const [openAdd, setOpenAdd] = useState(false);

  const filtered = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    return USERS_MOCK.filter((u) => {
      const matchesQuery = q
        ? [u.name, u.email, u.phone, u.id].some((v) =>
            v.toLowerCase().includes(q)
          )
        : true;
      const matchesStatus = state.status === "todos" ? true : u.status === state.status;
      return matchesQuery && matchesStatus;
    });
  }, [debouncedQuery, state.status]);

  const columns: Column<User>[] = [
    { header: "ID", accessor: (r) => r.id, width: "w-16" },
    { header: "Nombre", accessor: (r) => r.name, width: "w-56" },
    { header: "Correo", accessor: (r) => r.email, width: "w-64" },
    { header: "Teléfono", accessor: (r) => r.phone, width: "w-40" },
    {
      header: "Estado",
      accessor: (r) => (
        <span
          className={classNames(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs capitalize",
            r.status === "activo" && "bg-green-50 text-green-700 border border-green-200",
            r.status === "inactivo" && "bg-slate-50 text-slate-700 border border-slate-200",
            r.status === "pendiente" && "bg-amber-50 text-amber-700 border border-amber-200"
          )}
        >
          {r.status}
        </span>
      ),
      width: "w-28",
    },
    { header: "Alta", accessor: (r) => formatDate(r.joinedAt), width: "w-28" },
  ];

  return (
    <Page
      title="Listado de Usuarios"
      actions={
        <>
          <Button onClick={() => setOpenAdd(true)}>Añadir Usuario</Button>
          <Button variant="secondary" onClick={() => alert("Exportar Usuarios")}>
            Exportar Usuarios
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
        <div className="flex items-center gap-2 w-full md:w-96">
          <Input
            placeholder="Buscar..."
            value={state.query}
            onChange={(e) => dispatch({ type: "query", value: e.target.value })}
            aria-label="Buscar usuarios"
          />
          <select
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm bg-white"
            value={state.status}
            onChange={(e) =>
              dispatch({ type: "status", value: e.target.value as UsersState["status"] })
            }
            aria-label="Filtrar por estado"
          >
            <option value="todos">Todos</option>
            <option value="activo">Activos</option>
            <option value="pendiente">Pendientes</option>
            <option value="inactivo">Inactivos</option>
          </select>
        </div>
      </div>

      <div className="mt-4">
        <Card title="Clientes">
          {filtered.length === 0 ? (
            <EmptyState
              title="Sin resultados"
              subtitle="Ajusta los filtros o crea un nuevo usuario."
              action={<Button onClick={() => alert("Añadir Usuario")}>Añadir Usuario</Button>}
            />
          ) : (
            <DataTable
              rows={filtered}
              edit={() => setOpenAdd(true) }
              columns={columns}
              page={state.page}
              pageSize={state.pageSize}
              onPageChange={(p) => dispatch({ type: "page", value: p })}
            />
          )}
        </Card>
      </div>
      <AddUserModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={(payload) => {
          console.log("Guardar:", payload);
          setOpenAdd(false);
        }}
      />
    </Page>
  );
};

export default UsersPage;
