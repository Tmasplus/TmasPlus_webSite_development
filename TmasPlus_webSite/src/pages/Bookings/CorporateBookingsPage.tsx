import React, { useMemo, useReducer, useState } from "react";
import { Page } from "@/components/layout/Page";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { classNames } from "@/utils/classNames";
import { useDebounced } from "@/hooks/useDebounced";
import AddBookingModal from "./AddBookingModal";
import AddUserModal from "../Users/AddUserModal";

// ====== Tipos y mock ======
type CorpStatus = "pendiente" | "confirmada" | "en_progreso" | "completada" | "cancelada";

type CorporateBooking = {
  id: string;
  empresa: string;
  solicitante: string;   // cliente/contacto
  fecha: string;         // ISO
  monto: number;
  estado: CorpStatus;
};

const MOCK: CorporateBooking[] = Array.from({ length: 0 }).map(() => ({} as CorporateBooking));
// ↑ deja 0 para ver el empty state. Pon 35 y genera tú, o cambia por tus datos reales.

function formatMoney(v: number) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(v);
}
function formatDate(iso: string) {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString();
}

// ====== Estado UI ======
type State = {
  q: string;
  status: "todos" | CorpStatus;
  page: number;
  pageSize: number;
};
type Action =
  | { type: "q"; value: string }
  | { type: "status"; value: State["status"] }
  | { type: "page"; value: number }
  | { type: "more" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "q": return { ...s, q: a.value, page: 1 };
    case "status": return { ...s, status: a.value, page: 1 };
    case "page": return { ...s, page: a.value };
    case "more": return { ...s, pageSize: s.pageSize + 10 };
    default: return s;
  }
}

// ====== Componente ======
export const CorporateBookingsPage: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, { q: "", status: "todos", page: 1, pageSize: 10 });
  const dq = useDebounced(state.q, 300);
  const [openAdd, setOpenAdd] = useState(false);
  const [openAddUser, setOpenAddUser] = useState(false);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    return MOCK.filter((r) => {
      const matchesQ = q
        ? [r.id, r.empresa, r.solicitante].some((t) => t.toLowerCase().includes(q))
        : true;
      const matchesS = state.status === "todos" ? true : r.estado === state.status;
      return matchesQ && matchesS;
    });
  }, [dq, state.status]);

  const statusClass = (s: CorpStatus) =>
    classNames(
      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize",
      s === "pendiente"   && "bg-amber-50  text-amber-700  border-amber-200",
      s === "confirmada"  && "bg-primary/10 text-primary-dark border-primary/30",
      s === "en_progreso" && "bg-secondary-soft/20 text-secondary-soft border-secondary-soft/30",
      s === "completada"  && "bg-green-50 text-green-700 border-green-200",
      s === "cancelada"   && "bg-rose-50  text-rose-700  border-rose-200",
    );

  const cols: Column<CorporateBooking>[] = [
    { header: "ID", accessor: (r) => r.id, width: "w-24" },
    { header: "Empresa", accessor: (r) => r.empresa, width: "w-64" },
    { header: "Solicitante", accessor: (r) => r.solicitante, width: "w-56" },
    { header: "Fecha", accessor: (r) => formatDate(r.fecha), width: "w-48" },
    { header: "Monto", accessor: (r) => formatMoney(r.monto), width: "w-32" },
    { header: "Estado", accessor: (r) => <span className={statusClass(r.estado)}>{r.estado.replace("_", " ")}</span>, width: "w-40" },
  ];
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);

  const exportToCSV = () => {
    if (filteredBookings.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const headers = [
      "Fecha creación",
      "Fecha servicio",
      "Cliente",
      "Conductor",
      "Placa",
      "Tipo",
      "Costo",
      "Comisión",
      "Estado",
      "OTP",
    ];

    const rows = filteredBookings.map((b) => [
      new Date(b.createdAt).toLocaleString(),
      new Date(b.scheduledAt).toLocaleString(),
      b.client,
      b.driver,
      b.plate,
      b.type,
      b.cost,
      b.commission,
      b.status,
      b.otp,
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((value) =>
              typeof value === "string"
                ? `"${value.replace(/"/g, '""')}"`
                : value
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historial_reservas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page
      title="Reservas Corporativas"
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenAdd(true)}>Crear nueva reserva</Button>
          <Button onClick={() => setOpenAddUser(true)}>Añadir Usuario</Button>
          <Button variant="secondary" onClick={exportToCSV} >Exportar CSV</Button>
        </div>
      }
    >
      {/* Filtros */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={state.status}
            onChange={(e) => dispatch({ type: "status", value: e.target.value as State["status"] })}
          >
            <option value="todos">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="confirmada">Confirmada</option>
            <option value="en_progreso">En progreso</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>

          <div className="w-56">
            <Input
              placeholder="Buscar…"
              value={state.q}
              onChange={(e) => dispatch({ type: "q", value: e.target.value })}
            />
          </div>
          <Button onClick={() => { /* opcional: trigger búsqueda server */ }}>Buscar</Button>
        </div>
      </div>

      {/* Lista */}
      <div className="mt-4">
        <Card>
          {filtered.length === 0 ? (
            <EmptyState
              title="Aún no hay reservas corporativas"
              subtitle="Crea tu primera reserva para comenzar."
            />
          ) : (
            <>
              <DataTable
                rows={filtered}
                columns={cols}
                page={state.page}
                pageSize={state.pageSize}
                onPageChange={(p) => dispatch({ type: "page", value: p })}
              />
              <div className="mt-3">
                <Button variant="secondary" onClick={() => dispatch({ type: "more" })}>
                  Cargar más
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
      <AddBookingModal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        onSubmit={(payload) => {
            console.log("Nueva reserva:", payload);
            setOpenAdd(false);
        }}
        />
      <AddUserModal
        open={openAddUser}
        onClose={() => setOpenAddUser(false)}
        onSubmit={(payload) => {
          console.log("Guardar:", payload);
          setOpenAddUser(false);
        }}
      />
    </Page>
  );
};

export default CorporateBookingsPage;
