import React, { useEffect, useMemo, useReducer, useState } from "react";
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
import {
  BookingsService,
  serviceTotal,
  type BookingRecord,
} from "@/services/bookings.service";

type StatusFilter =
  | "TODOS"
  | "PENDING"
  | "ACCEPTED"
  | "STARTED"
  | "ARRIVED"
  | "PICKED_UP"
  | "COMPLETED"
  | "CANCELLED";

type State = {
  q: string;
  status: StatusFilter;
  page: number;
  pageSize: number;
};

type Action =
  | { type: "q"; value: string }
  | { type: "status"; value: StatusFilter }
  | { type: "page"; value: number }
  | { type: "more" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "q":
      return { ...s, q: a.value, page: 1 };
    case "status":
      return { ...s, status: a.value, page: 1 };
    case "page":
      return { ...s, page: a.value };
    case "more":
      return { ...s, pageSize: s.pageSize + 10 };
    default:
      return s;
  }
}

function formatMoney(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const num = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(num) || num === 0) return "—";
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleString("es-CO");
}

function statusBadgeClass(status?: string | null) {
  const s = (status || "").toUpperCase();
  return classNames(
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize",
    s === "PENDING" && "bg-amber-50 text-amber-700 border-amber-200",
    (s === "ACCEPTED" || s === "STARTED" || s === "ARRIVED" || s === "PICKED_UP") &&
      "bg-sky-50 text-sky-700 border-sky-200",
    s === "COMPLETED" && "bg-green-50 text-green-700 border-green-200",
    s === "CANCELLED" && "bg-rose-50 text-rose-700 border-rose-200",
    !s && "bg-slate-50 text-slate-700 border-slate-200"
  );
}

export const CorporateBookingsPage: React.FC = () => {
  const [state, dispatch] = useReducer(reducer, {
    q: "",
    status: "TODOS",
    page: 1,
    pageSize: 10,
  });
  const dq = useDebounced(state.q, 300);
  const [openAdd, setOpenAdd] = useState(false);
  const [openAddUser, setOpenAddUser] = useState(false);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadBookings = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await BookingsService.list();
      setBookings(data);
    } catch (e: any) {
      setError(e?.message || "Error al cargar las reservas corporativas");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadBookings();
    // Refresco en vivo: el OTP se genera al crear la reserva (trigger en la DB)
    // y debe aparecer solo, sin pulsar "Actualizar".
    const pollId = window.setInterval(() => loadBookings(true), 5000);
    return () => window.clearInterval(pollId);
  }, []);

  const filtered = useMemo(() => {
    const q = dq.trim().toLowerCase();
    return bookings.filter((r) => {
      const status = (r.status || "").toUpperCase();
      const matchesStatus = state.status === "TODOS" || status === state.status;
      const matchesQ = q
        ? [
            r.id,
            r.reference,
            r.customer_name,
            r.customer_email,
            r.customer_contact,
            r.driver_name,
            r.driver_contact,
            r.plate_number,
            r.car_type,
            r.pickup_address,
            r.drop_address,
          ]
            .filter(Boolean)
            .some((t) => String(t).toLowerCase().includes(q))
        : true;
      return matchesStatus && matchesQ;
    });
  }, [bookings, dq, state.status]);

  const cols: Column<BookingRecord>[] = [
    { header: "Referencia", accessor: (r) => r.reference || r.id, width: "w-40" },
    { header: "Cliente", accessor: (r) => r.customer_name || r.customer_email || "—", width: "w-56" },
    { header: "Contacto", accessor: (r) => r.customer_contact || "—", width: "w-40" },
    { header: "Fecha", accessor: (r) => formatDate(r.booking_date || r.created_at), width: "w-48" },
    { header: "Origen", accessor: (r) => r.pickup_address || "—", width: "w-64" },
    { header: "Destino", accessor: (r) => r.drop_address || "—", width: "w-64" },
    { header: "Monto", accessor: (r) => formatMoney(serviceTotal(r)), width: "w-32" },
    {
      header: "Estado",
      accessor: (r) => <span className={statusBadgeClass(r.status)}>{r.status || "—"}</span>,
      width: "w-40",
    },
    {
      header: "OTP",
      accessor: (r) =>
        r.otp ? (
          <span className="inline-block px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 font-mono font-bold text-sm tracking-widest border border-emerald-300">
            {r.otp}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
      width: "w-32",
    },
  ];

  const exportToCSV = () => {
    if (filtered.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const headers = [
      "Referencia",
      "Fecha creación",
      "Fecha servicio",
      "Cliente",
      "Email cliente",
      "Contacto cliente",
      "Conductor",
      "Placa",
      "Tipo",
      "Origen",
      "Destino",
      "Costo total",
      "Estado",
      "OTP",
    ];

    const rows = filtered.map((b) => [
      b.reference || b.id,
      formatDate(b.created_at),
      formatDate(b.booking_date),
      b.customer_name || "",
      b.customer_email || "",
      b.customer_contact || "",
      b.driver_name || "",
      b.plate_number || "",
      b.car_type || "",
      b.pickup_address || "",
      b.drop_address || "",
      serviceTotal(b) ?? "",
      b.status || "",
      b.otp || "",
    ]);

    const csvContent = [headers, ...rows]
      .map((row) =>
        row
          .map((value) =>
            typeof value === "string" ? `"${value.replace(/"/g, '""')}"` : value
          )
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reservas_corporativas.csv";
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
          <Button variant="secondary" onClick={exportToCSV}>
            Exportar CSV
          </Button>
          <Button variant="secondary" onClick={loadBookings} disabled={loading}>
            {loading ? "Cargando..." : "Actualizar"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            value={state.status}
            onChange={(e) => dispatch({ type: "status", value: e.target.value as StatusFilter })}
          >
            <option value="TODOS">Todos</option>
            <option value="PENDING">Pendiente</option>
            <option value="ACCEPTED">Aceptada</option>
            <option value="STARTED">Iniciada</option>
            <option value="ARRIVED">Llegó</option>
            <option value="PICKED_UP">Recogido</option>
            <option value="COMPLETED">Completada</option>
            <option value="CANCELLED">Cancelada</option>
          </select>

          <div className="w-72">
            <Input
              placeholder="Buscar por ref, cliente, placa…"
              value={state.q}
              onChange={(e) => dispatch({ type: "q", value: e.target.value })}
            />
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Card>
          {error ? (
            <EmptyState title="No se pudieron cargar las reservas" subtitle={error} />
          ) : loading && bookings.length === 0 ? (
            <EmptyState title="Cargando reservas..." subtitle="Consultando Supabase." />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No hay reservas para mostrar"
              subtitle="Crea una reserva o ajusta los filtros de búsqueda."
            />
          ) : (
            <>
              <DataTable
                rows={filtered}
                columns={cols}
                page={state.page}
                pageSize={state.pageSize}
                onPageChange={(p) => dispatch({ type: "page", value: p })}
                rowActions={(r) => (
                  <Button
                    variant="secondary"
                    onClick={() => window.open(`/bookingdetails?reference=${encodeURIComponent(r.reference || r.id)}`, "_self")}
                  >
                    Ver detalle
                  </Button>
                )}
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
        onSubmit={() => {
          setOpenAdd(false);
          loadBookings();
        }}
      />
      <AddUserModal
        open={openAddUser}
        onClose={() => setOpenAddUser(false)}
        onSubmit={() => {
          setOpenAddUser(false);
        }}
      />
    </Page>
  );
};

export default CorporateBookingsPage;
