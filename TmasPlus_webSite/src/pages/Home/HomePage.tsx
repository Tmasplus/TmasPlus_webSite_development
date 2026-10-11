import { classNames } from "@/utils/classNames";
import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarClock,
  CalendarPlus,
  CarFront,
  CheckCircle2,
  Clock3,
  Gauge,
  Hourglass,
  IdCard,
  ImageOff,
  MessageSquareWarning,
  Navigation,
  Pencil,
  Plus,
  RefreshCw,
  Route,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { CreateCategoryModal } from "./CreateCategoryModal";
import { CarTypesService } from "@/services/carTypes.service";
import { BookingsService } from "@/services/bookings.service";
import { ComplaintsService } from "@/services/complaints.service";
import { useAuth } from "@/hooks/useAuth";
import type { CarTypeRow } from "@/config/database.types";

// Mismos grupos que el filtro de estado del historial (BookingHistoryPage → STATUS_GROUPS).
const IN_PROGRESS_STATUSES = ["STARTED", "ARRIVED_DESTINATION"];
const DONE_STATUSES = ["COMPLETED", "PAID"];

const money = (v: number | null | undefined) =>
  v == null || Number.isNaN(Number(v))
    ? "—"
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(Number(v));

/** YYYY-MM-DD local, desplazado `offsetDays` días. */
const localDate = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString("en-CA");
};

const historyLink = (params: Record<string, string>) => `/bookingHistory?${new URLSearchParams(params).toString()}`;

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches";
}

type Kpis = {
  today: number | null;
  active: number | null;
  pending: number | null;
  completedToday: number | null;
  complaints: number | null;
};

const EMPTY_KPIS: Kpis = { today: null, active: null, pending: null, completedToday: null, complaints: null };

const settle = (p: Promise<number>) => p.catch(() => null);

export default function HomePage() {
  const { profile } = useAuth();
  const [openCategory, setOpenCategory] = useState(false);
  const [categories, setCategories] = useState<CarTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<CarTypeRow | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [kpis, setKpis] = useState<Kpis>(EMPTY_KPIS);
  const [statsLoading, setStatsLoading] = useState(true);
  const today = localDate();
  const yesterday = localDate(-1);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CarTypesService.getAll();
      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    const today = localDate();
    const [todayCount, active, pending, completedToday, complaints] = await Promise.all([
      settle(BookingsService.count({ dateFrom: today, dateTo: today })),
      // Solo viajes con pasajero a bordo y servicio desde ayer: las reservas viejas que quedaron
      // "aceptadas" o "iniciadas" sin cerrarse no son viajes en curso reales.
      settle(BookingsService.count({ statuses: IN_PROGRESS_STATUSES, dateFrom: localDate(-1) })),
      settle(BookingsService.count({ status: "PENDING" })),
      settle(BookingsService.count({ statuses: DONE_STATUSES, dateFrom: today, dateTo: today })),
      settle(ComplaintsService.countOpen()),
    ]);
    setKpis({ today: todayCount, active, pending, completedToday, complaints });
    setStatsLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
    fetchStats();
  }, [fetchCategories, fetchStats]);

  function handleEdit(cat: CarTypeRow) {
    setEditItem(cat);
    setOpenCategory(true);
  }

  async function handleDelete(cat: CarTypeRow) {
    if (!confirm(`¿Eliminar "${cat.name}"?`)) return;
    await CarTypesService.remove(cat.id);
    fetchCategories();
  }

  async function handleToggleActive(cat: CarTypeRow) {
    setTogglingId(cat.id);
    try {
      await CarTypesService.update(cat.id, { is_active: !cat.is_active });
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: !c.is_active } : c)));
    } catch (e: any) {
      alert(e?.message || "No fue posible cambiar el estado");
    } finally {
      setTogglingId(null);
    }
  }

  function handleCloseModal() {
    setOpenCategory(false);
    setEditItem(null);
  }

  const firstName = profile?.nombre?.split(" ")[0] ?? "";
  const activeCount = categories.filter((c) => c.is_active).length;

  return (
    <div className="space-y-8 p-6">
      {/* Bienvenida */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-sky-500 via-sky-600 to-blue-700 p-6 text-white shadow-lg shadow-sky-900/10 md:p-8"
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-24 right-32 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm capitalize text-white/80">
              {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">
              {greeting()}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 max-w-xl text-sm text-white/85">
              Este es el resumen de la operación de T+Plus. Gestiona reservas, usuarios y tipos de servicio desde aquí.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuickAction to="/addbooking" icon={CalendarPlus} label="Nueva reserva" primary />
            <QuickAction to="/bookingHistory" icon={CalendarClock} label="Historial" />
            <QuickAction to="/users" icon={Users} label="Usuarios" />
            <QuickAction to="/app-drivers" icon={IdCard} label="Conductores" />
          </div>
        </div>
      </motion.section>

      {/* Indicadores */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Operación en tiempo real</h2>
          <button
            type="button"
            onClick={fetchStats}
            disabled={statsLoading}
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
          >
            <RefreshCw size={14} className={statsLoading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <KpiCard
            to={historyLink({ from: today, to: today })}
            icon={CalendarClock}
            label="Reservas de hoy"
            hint="Servicios programados para hoy"
            value={kpis.today}
            loading={statsLoading}
            tone="sky"
          />
          <KpiCard
            to={historyLink({ status: "IN_PROGRESS", from: yesterday })}
            icon={Navigation}
            label="Viajes en curso"
            hint="Pasajero a bordo (iniciado o llegando a destino)"
            value={kpis.active}
            loading={statsLoading}
            tone="indigo"
            pulse
          />
          <KpiCard
            to={historyLink({ status: "PENDING" })}
            icon={Hourglass}
            label="Pendientes por asignar"
            hint="Reservas sin conductor asignado"
            value={kpis.pending}
            loading={statsLoading}
            tone="amber"
          />
          <KpiCard
            to={historyLink({ status: "DONE", from: today, to: today })}
            icon={CheckCircle2}
            label="Completadas hoy"
            hint="Completadas o pagadas, con servicio hoy"
            value={kpis.completedToday}
            loading={statsLoading}
            tone="emerald"
          />
          <KpiCard
            to="/complaints"
            icon={MessageSquareWarning}
            label="Quejas sin atender"
            hint="Pendientes o en revisión"
            value={kpis.complaints}
            loading={statsLoading}
            tone="rose"
          />
        </div>
      </section>

      {/* Tipos de servicio */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tipos de servicio</h2>
            <p className="text-sm text-slate-500">
              {loading ? "Cargando…" : `${activeCount} activas de ${categories.length} categorías · tarifas vigentes`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setEditItem(null); setOpenCategory(true); }}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-sky-600"
          >
            <Plus size={16} />
            Nueva categoría
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[360px] animate-pulse rounded-2xl border border-slate-200 bg-white" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {categories.map((cat, i) => (
              <ServiceCard
                key={cat.id}
                cat={cat}
                index={i}
                toggling={togglingId === cat.id}
                onEdit={() => handleEdit(cat)}
                onDelete={() => handleDelete(cat)}
                onToggle={() => handleToggleActive(cat)}
              />
            ))}
            <button
              type="button"
              onClick={() => { setEditItem(null); setOpenCategory(true); }}
              className="group flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 text-slate-500 transition-colors hover:border-sky-400 hover:bg-sky-50/50 hover:text-sky-600"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 transition-colors group-hover:bg-sky-100">
                <Plus size={26} />
              </span>
              <span className="font-semibold">Crear nueva categoría</span>
              <span className="max-w-[200px] text-center text-xs text-slate-400">Define tarifas, imagen y descripción de un nuevo servicio</span>
            </button>
          </div>
        )}
      </section>

      <CreateCategoryModal open={openCategory} onClose={handleCloseModal} onSaved={fetchCategories} editData={editItem} />

      <footer className="pb-2 text-center text-xs text-slate-400">
        Copyright © {new Date().getFullYear()} T+PLUS — Todos los derechos reservados.
      </footer>
    </div>
  );
}

function QuickAction({ to, icon: Icon, label, primary }: { to: string; icon: LucideIcon; label: string; primary?: boolean }) {
  return (
    <Link
      to={to}
      className={classNames(
        "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
        primary ? "bg-white text-sky-700 shadow-md hover:bg-sky-50" : "bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25"
      )}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

const TONES = {
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  amber: "bg-amber-50 text-amber-600",
  emerald: "bg-emerald-50 text-emerald-600",
  rose: "bg-rose-50 text-rose-600",
} as const;

function KpiCard({
  to,
  icon: Icon,
  label,
  hint,
  value,
  loading,
  tone,
  pulse,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  hint: string;
  value: number | null;
  loading: boolean;
  tone: keyof typeof TONES;
  pulse?: boolean;
}) {
  return (
    <Link
      to={to}
      title={`${hint}. Clic para ver el detalle.`}
      className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-sky-200 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className={classNames("flex h-10 w-10 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon size={19} />
        </span>
        {pulse && !!value && (
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-500" />
          </span>
        )}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums text-slate-900">
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-slate-100" /> : value ?? "—"}
      </p>
      <p className="flex items-center justify-between text-xs font-medium text-slate-600">
        {label}
        <ArrowRight size={12} className="text-sky-500 opacity-0 transition-opacity group-hover:opacity-100" />
      </p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</p>
    </Link>
  );
}

function ServiceCard({
  cat,
  index,
  toggling,
  onEdit,
  onDelete,
  onToggle,
}: {
  cat: CarTypeRow;
  index: number;
  toggling: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const tariffs: { icon: LucideIcon; label: string; value: number }[] = [
    { icon: Wallet, label: "Tarifa base", value: cat.base_price },
    { icon: Gauge, label: "Tarifa mínima", value: cat.min_fare },
    { icon: Route, label: "Por km", value: cat.price_per_km },
    { icon: Clock3, label: "Por hora", value: cat.rate_per_hour },
  ];

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={classNames(
        "group flex flex-col overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-900/5",
        cat.is_active ? "border-slate-200" : "border-slate-200 opacity-75"
      )}
    >
      {/* Imagen completa (object-contain) sobre un fondo tipo "estudio" */}
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-sky-50 via-white to-slate-100">
        <div className="absolute inset-x-6 bottom-4 h-6 rounded-[100%] bg-slate-900/10 blur-md" />
        {cat.image && !broken ? (
          <img
            src={cat.image}
            alt={cat.name}
            onError={() => setBroken(true)}
            className="relative h-full w-full object-contain p-4 drop-shadow-xl transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="relative flex h-full flex-col items-center justify-center gap-2 text-slate-400">
            {cat.image ? <ImageOff size={28} /> : <CarFront size={34} />}
            <span className="text-xs">{cat.image ? "No se pudo cargar la imagen" : "Sin imagen"}</span>
          </div>
        )}
        <span
          className={classNames(
            "absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur",
            cat.is_active ? "bg-emerald-500/90 text-white" : "bg-slate-500/80 text-white"
          )}
        >
          <span className={classNames("h-1.5 w-1.5 rounded-full", cat.is_active ? "bg-white" : "bg-slate-200")} />
          {cat.is_active ? "Activa" : "Inactiva"}
        </span>
        <div className="absolute right-3 top-3 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <IconAction icon={Pencil} label="Editar" ariaLabel={`Editar ${cat.name}`} onClick={onEdit} className="text-sky-600" />
          <IconAction icon={Trash2} label="Eliminar" ariaLabel={`Eliminar ${cat.name}`} onClick={onDelete} className="text-rose-500" />
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-base font-bold text-slate-900">{cat.name}</h3>
        <p className="truncate text-xs text-slate-500" title={cat.description ?? ""}>
          {cat.description || "Sin descripción"}
        </p>

        <div className="mb-4 mt-4 grid grid-cols-2 gap-2">
          {tariffs.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-xl bg-slate-50 px-3 py-2">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                <Icon size={11} />
                {label}
              </p>
              <p className="text-sm font-bold tabular-nums text-slate-800">{money(value)}</p>
            </div>
          ))}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-slate-100 pt-3">
          <div
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-600"
            title="Activa la categoría (Activa) o desactívala (Inactiva). Las inactivas no se ofrecen a los clientes en la app."
          >
            <button
              type="button"
              role="switch"
              aria-checked={cat.is_active}
              aria-label={cat.is_active ? `Desactivar ${cat.name}` : `Activar ${cat.name}`}
              disabled={toggling}
              onClick={onToggle}
              className={classNames(
                "relative h-5 w-9 rounded-full transition-colors disabled:opacity-50",
                cat.is_active ? "bg-emerald-500" : "bg-slate-300"
              )}
            >
              <span
                className={classNames(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                  cat.is_active ? "left-[18px]" : "left-0.5"
                )}
              />
            </button>
            {toggling ? "Guardando…" : cat.is_active ? "Activa · visible en la app" : "Inactiva · oculta en la app"}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/** Botón de solo icono con etiqueta flotante al pasar el mouse. */
function IconAction({
  icon: Icon,
  label,
  ariaLabel,
  onClick,
  className,
}: {
  icon: LucideIcon;
  label: string;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={classNames(
        "group/action relative flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur transition-colors hover:bg-white",
        className
      )}
    >
      <Icon size={14} />
      <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-lg transition-opacity group-hover/action:opacity-100 group-focus-visible/action:opacity-100">
        {label}
      </span>
    </button>
  );
}
