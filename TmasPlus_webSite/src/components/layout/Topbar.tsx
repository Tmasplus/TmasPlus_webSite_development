import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronRight,
  Globe,
  LogOut,
  Menu,
  MessageSquareWarning,
  Plus,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import logo from "@/assets/Logo-v3.png";
import { SIDEBAR_COLLAPSED_PX } from "@/components/layout/Sidebar";
import { ComplaintsService } from "@/services/complaints.service";
import { CommandPalette } from "./CommandPalette";
import { pageForPath } from "./navigation";

export type TopbarAccount = {
  name: string;
  email: string;
  roleLabel?: string;
  canOpenSettings?: boolean;
};

type Props = {
  onToggleSidebar?: () => void;
  account?: TopbarAccount | null;
  onLogout?: () => void;
};

function AccountMenu({ account, onLogout }: { account: TopbarAccount; onLogout?: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Configuración de la cuenta"
        title="Configuración de la cuenta"
        className={`flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 ${
          open ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
        }`}
      >
        <Settings size={19} className={`transition-transform duration-300 ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-700 shadow-xl shadow-slate-900/15"
        >
          <div className="border-b border-slate-100 px-4 py-3">
            {account.name && <p className="truncate text-sm font-semibold text-slate-800">{account.name}</p>}
            <p className="truncate text-xs text-slate-500" title={account.email}>
              {account.email}
            </p>
            {account.roleLabel && (
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-600">{account.roleLabel}</p>
            )}
          </div>

          <div className="p-1.5">
            <Link to="/userprofile" role="menuitem" onClick={() => setOpen(false)} className={item}>
              <UserRound size={16} className="text-sky-500" />
              Mi cuenta
            </Link>
            {account.canOpenSettings && (
              <Link to="/settings" role="menuitem" onClick={() => setOpen(false)} className={item}>
                <Settings size={16} className="text-sky-500" />
                Configuración
              </Link>
            )}
          </div>

          <div className="border-t border-slate-100 p-1.5">
            <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-600">
              <Globe size={16} className="text-sky-500" />
              <div className="min-w-0 flex-1">
                <p>Zona horaria</p>
                <p className="truncate text-xs text-slate-400">Automática ({timeZone})</p>
              </div>
              <ChevronRight size={14} className="text-slate-300" />
            </div>
          </div>

          {onLogout && (
            <div className="border-t border-slate-100 p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className={`${item} hover:!bg-rose-50 hover:!text-rose-700`}
              >
                <LogOut size={16} className="text-rose-400" />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Clock() {
  const now = useNow();
  return (
    <div className="hidden select-none flex-col items-end leading-tight xl:flex" title={now.toLocaleString("es-CO")}>
      <span className="text-sm font-semibold tabular-nums">
        {now.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
      </span>
      <span className="text-[11px] capitalize text-white/80">
        {now.toLocaleDateString("es-CO", { weekday: "short", day: "2-digit", month: "short" })}
      </span>
    </div>
  );
}

/** Acceso directo a Quejas con contador de quejas sin atender (pendientes + en revisión). */
function ComplaintsShortcut() {
  const { pathname } = useLocation();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      ComplaintsService.countOpen()
        .then((n) => !cancelled && setCount(n))
        .catch(() => !cancelled && setCount(null));
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pathname]);

  const active = pathname.startsWith("/complaints");
  return (
    <Link
      to="/complaints"
      title={count ? `Quejas: ${count} sin atender` : "Quejas"}
      aria-label="Quejas"
      className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-white/70 ${
        active ? "bg-white/25" : "bg-white/10 hover:bg-white/20"
      }`}
    >
      <MessageSquareWarning size={18} />
      {!!count && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-sky-500">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}

export const Topbar: React.FC<Props> = ({ onToggleSidebar, account, onLogout }) => {
  const { pathname } = useLocation();
  const page = pageForPath(pathname);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
  <header className="sticky top-0 z-40 flex h-14 items-center gap-3 bg-sky-500 pr-3 text-white shadow md:pr-4">
    <div className="flex h-full min-w-0 items-center">
      {/* Recuadro blanco del mismo ancho que el menú contraído para que coincidan. */}
      <div
        className="flex h-full shrink-0 items-center justify-center bg-white"
        style={{ width: SIDEBAR_COLLAPSED_PX }}
      >
        {/* El PNG trae margen blanco y el texto "Tplus": se encuadra solo el ícono T+. */}
        <div className="relative h-10 w-10 overflow-hidden" title="T+Plus">
          <img
            src={logo}
            alt="T+Plus"
            className="absolute max-w-none"
            style={{ width: 76, height: 76, left: -19, top: -13 }}
          />
        </div>
      </div>
      <button
        type="button"
        aria-label="Abrir menú"
        onClick={onToggleSidebar}
        className="ml-2 rounded-lg p-2 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/70 md:hidden"
      >
        <Menu size={20} />
      </button>
      {page && (
        <div className="ml-3 hidden min-w-0 flex-col leading-tight sm:flex md:ml-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">{page.section}</span>
          <span className="truncate text-[15px] font-semibold">{page.label}</span>
        </div>
      )}
    </div>

    <div className="flex flex-1 justify-center">
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 w-full max-w-md items-center gap-2 rounded-xl bg-white/15 px-3 text-sm text-white/85 ring-1 ring-white/20 transition-colors hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white/70"
        aria-label="Abrir buscador"
      >
        <Search size={16} className="shrink-0" />
        <span className="hidden truncate sm:inline">Buscar módulos, reservas, placas…</span>
        <kbd className="ml-auto hidden rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold md:inline">Ctrl K</kbd>
      </button>
    </div>

    <div className="flex shrink-0 items-center gap-2">
      <Link
        to="/addbooking"
        className="hidden h-9 items-center gap-1.5 rounded-xl bg-white px-3 text-sm font-semibold text-sky-600 shadow-sm transition-colors hover:bg-sky-50 sm:flex"
        title="Añadir reserva"
      >
        <Plus size={16} />
        <span className="hidden lg:inline">Nueva reserva</span>
      </Link>
      <ComplaintsShortcut />
      <Clock />
      <span className="mx-1 hidden h-7 w-px bg-white/25 xl:block" />
      {account && <AccountMenu account={account} onLogout={onLogout} />}
    </div>

    <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
  </header>
  );
};
