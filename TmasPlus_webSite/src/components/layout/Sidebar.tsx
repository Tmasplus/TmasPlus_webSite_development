import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarPlus,
  Car,
  ChevronDown,
  ChevronUp,
  FileSignature,
  FileText,
  House,
  IdCard,
  LogOut,
  MapPinned,
  MessageSquareWarning,
  Milestone,
  Pin,
  PinOff,
  Receipt,
  Repeat,
  Settings,
  Tag,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { classNames } from "@/utils/classNames";

type Subuser = {
  InTurn: boolean;
  Name: string;
};

type AppUser = {
  usertype: "admin" | "company" | "driver" | string;
  profile_image?: string | null;
  subusers?: Subuser[];
};

type Props = {
  /** Menú abierto en móvil (drawer). */
  open: boolean;
  onToggle: () => void;
  onClose?: () => void;
  /** Escritorio: menú fijado expandido (si no, se expande al pasar el mouse). */
  pinned?: boolean;
  onTogglePin?: () => void;
  user: AppUser | null | undefined;
  isAnySubuserInTurn: boolean;
  getDisplayName: (u: AppUser) => string;
  defaultProfileImage: string;
  handleLogout: () => void;
  navigateToWhatsApp: () => void;
};

/** Ancho del menú contraído / expandido (px). El layout usa estos valores para el padding. */
export const SIDEBAR_COLLAPSED_PX = 72;
export const SIDEBAR_EXPANDED_PX = 256;

type NavEntry = { to: string; label: string; icon: React.ReactNode; show: boolean };
type NavSection = { title: string; items: NavEntry[] };

const ICON = 19;

function NavItem({
  to,
  icon,
  label,
  expanded,
  onNavigate,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
  expanded: boolean;
  onNavigate?: () => void;
}) {
  const { pathname } = useLocation();
  const isActive = pathname === to || pathname.startsWith(`${to}/`);

  return (
    <li>
      <Link
        to={to}
        onClick={onNavigate}
        title={expanded ? undefined : label}
        aria-current={isActive ? "page" : undefined}
        className={classNames(
          "group relative flex h-10 items-center gap-3 rounded-xl px-[17px] text-sm transition-colors",
          isActive ? "bg-sky-50 font-semibold text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        )}
      >
        {isActive && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-sky-500" />}
        <span className={classNames("shrink-0", isActive ? "text-sky-600" : "text-sky-500 group-hover:text-sky-600")}>{icon}</span>
        <span
          className={classNames(
            "truncate whitespace-nowrap transition-all duration-200",
            expanded ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-1 opacity-0"
          )}
        >
          {label}
        </span>
      </Link>
    </li>
  );
}

/** Indica con sombra (y flecha) que hay más opciones arriba o abajo, sin barra de scroll visible. */
function useScrollHints() {
  const ref = useRef<HTMLElement>(null);
  const [hints, setHints] = useState({ up: false, down: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const up = el.scrollTop > 2;
    const down = el.scrollTop + el.clientHeight < el.scrollHeight - 2;
    setHints((prev) => (prev.up === up && prev.down === down ? prev : { up, down }));
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    Array.from(el.children).forEach((child) => observer.observe(child));
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  const scrollBy = (dy: number) => ref.current?.scrollBy({ top: dy, behavior: "smooth" });

  return { ref, hints, update, scrollBy };
}

export const Sidebar: React.FC<Props> = ({
  open,
  onClose,
  pinned = false,
  onTogglePin,
  user,
  isAnySubuserInTurn,
  getDisplayName,
  defaultProfileImage,
  handleLogout,
}) => {
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered || open;
  const scroll = useScrollHints();

  const isAdmin = user?.usertype === "admin";
  // const isCompany = user?.usertype === "company";
  const isCompany = user?.usertype === "admin";
  // const isDriver = user?.usertype === "driver";
  const isDriver = user?.usertype === "admin";
  const hasAdminSubuserInTurn = !!user?.subusers?.some((s) => s.InTurn && s.Name === "Administrador");
  const adminOrCompany = isAdmin || (isCompany && isAnySubuserInTurn);

  const sections: NavSection[] = [
    {
      title: "Principal",
      items: [{ to: "/home", label: "Inicio", icon: <House size={ICON} />, show: true }],
    },
    {
      title: "Reservas",
      items: [
        { to: "/bookingHistory", label: "Historial de reservas", icon: <CalendarClock size={ICON} />, show: isAdmin },
        { to: "/addbooking", label: "Añadir reserva", icon: <CalendarPlus size={ICON} />, show: isAdmin },
        { to: "/bookingCorp", label: "Reservas corporativas", icon: <Building2 size={ICON} />, show: adminOrCompany },
        { to: "/bookingdetails", label: "Detalle de reserva", icon: <FileText size={ICON} />, show: adminOrCompany },
      ],
    },
    {
      title: "Usuarios",
      items: [
        { to: "/users", label: "Usuarios App", icon: <Users size={ICON} />, show: adminOrCompany },
        { to: "/app-drivers", label: "Conductores App", icon: <IdCard size={ICON} />, show: adminOrCompany },
        // Conductores Web: oculto, ya no se usa. La ruta /drivers sigue disponible.
        // { to: "/drivers", label: "Conductores Web", icon: <Car size={ICON} />, show: adminOrCompany },
      ],
    },
    {
      title: "Gestión",
      items: [
        { to: "/memberships", label: "Membresías", icon: <BadgeCheck size={ICON} />, show: isAdmin },
        { to: "/notifications", label: "Notificaciones", icon: <Bell size={ICON} />, show: isAdmin },
        { to: "/billing", label: "Módulo de facturación", icon: <Receipt size={ICON} />, show: isAdmin },
        { to: "/shiftchanger", label: "Cambiar turno", icon: <Repeat size={ICON} />, show: isCompany },
        {
          to: "/officialview",
          label: "Funcionarios",
          icon: <Briefcase size={ICON} />,
          show: isCompany && isAnySubuserInTurn && hasAdminSubuserInTurn,
        },
        { to: "/complaints", label: "Quejas", icon: <MessageSquareWarning size={ICON} />, show: true },
      ],
    },
    {
      title: "Operación",
      items: [
        { to: "/vehicle-map", label: "Mapa de vehículos", icon: <MapPinned size={ICON} />, show: isAdmin },
        { to: "/treasoffers", label: "Ofertas TREAS", icon: <Tag size={ICON} />, show: isAdmin },
        { to: "/contracts", label: "Contratos", icon: <FileSignature size={ICON} />, show: isDriver },
        { to: "/car-brands", label: "Marcas de vehículos", icon: <Car size={ICON} />, show: isAdmin },
        { to: "/tolls", label: "Peajes", icon: <Milestone size={ICON} />, show: isAdmin },
      ],
    },
    {
      title: "Cuenta",
      items: [
        { to: "/userprofile", label: "Perfil", icon: <UserRound size={ICON} />, show: user?.usertype !== "company" },
        { to: "/settings", label: "Configuración", icon: <Settings size={ICON} />, show: isAdmin },
      ],
    },
  ];

  const displayName = user ? getDisplayName(user) : "";
  const roleLabel = isAdmin ? "Administrador" : user?.usertype === "company" ? "Empresa" : "Usuario";
  const closeMobile = () => onClose?.();

  return (
    <>
      {/* Fondo en móvil */}
      <div
        className={classNames(
          "fixed inset-0 top-14 z-20 bg-slate-900/40 backdrop-blur-[1px] transition-opacity md:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={closeMobile}
        aria-hidden
      />

      <aside
        aria-label="Barra lateral"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{ width: expanded ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX }}
        className={classNames(
          "fixed bottom-3 left-0 top-14 z-30 flex flex-col overflow-hidden rounded-br-2xl border-b border-r border-slate-200/80 bg-white",
          "transition-[width,transform,box-shadow] duration-200 ease-out",
          expanded && !pinned ? "shadow-2xl shadow-slate-900/15" : "shadow-lg shadow-slate-900/5",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Perfil */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-[13px] py-4">
          <img
            src={user?.profile_image || defaultProfileImage}
            alt="Foto de perfil"
            className="h-11 w-11 shrink-0 rounded-full border-2 border-white object-cover shadow-md ring-2 ring-sky-100"
          />
          <div
            className={classNames(
              "min-w-0 flex-1 transition-opacity duration-200",
              expanded ? "opacity-100" : "pointer-events-none opacity-0"
            )}
          >
            <p className="text-xs font-medium text-slate-400">¡Hola!</p>
            <p className="truncate text-sm font-bold leading-tight text-slate-800" title={displayName}>
              {displayName || "—"}
            </p>
            <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-sky-600">{roleLabel}</p>
          </div>
          {expanded && (
            <>
              {onTogglePin && (
                <button
                  type="button"
                  onClick={onTogglePin}
                  className="hidden shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 md:block"
                  title={pinned ? "Contraer menú (expandir al pasar el mouse)" : "Fijar menú expandido"}
                  aria-label={pinned ? "Contraer menú" : "Fijar menú"}
                >
                  {pinned ? <PinOff size={16} /> : <Pin size={16} />}
                </button>
              )}
              <button
                type="button"
                onClick={closeMobile}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 md:hidden"
                aria-label="Cerrar menú"
              >
                <X size={16} />
              </button>
            </>
          )}
        </div>

        {/* Navegación */}
        <div className="relative min-h-0 flex-1">
          <nav
            ref={scroll.ref}
            onScroll={scroll.update}
            className="h-full overflow-y-auto overflow-x-hidden px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {sections.map((section, i) => {
              const items = section.items.filter((item) => item.show);
              if (!items.length) return null;
              return (
                <div key={section.title} className={i > 0 ? "mt-3" : ""}>
                  <div className="relative mb-1 flex h-5 items-center px-[14px]">
                    <span
                      className={classNames(
                        "whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 transition-opacity duration-200",
                        expanded ? "opacity-100" : "opacity-0"
                      )}
                    >
                      {section.title}
                    </span>
                    {!expanded && i > 0 && <span className="absolute inset-x-3 top-1/2 h-px bg-slate-100" />}
                  </div>
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <NavItem key={item.to} to={item.to} icon={item.icon} label={item.label} expanded={expanded} onNavigate={closeMobile} />
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Sombras que indican que hay más opciones */}
          <div
            className={classNames(
              "pointer-events-none absolute inset-x-0 top-0 flex h-10 justify-center bg-gradient-to-b from-slate-900/10 via-white/60 to-transparent transition-opacity duration-200",
              scroll.hints.up ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => scroll.scrollBy(-160)}
              className={classNames("mt-0.5 h-5 rounded-full px-2 text-slate-500 hover:text-slate-800", scroll.hints.up && "pointer-events-auto")}
            >
              <ChevronUp size={16} />
            </button>
          </div>
          <div
            className={classNames(
              "pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-slate-900/10 via-white/60 to-transparent transition-opacity duration-200",
              scroll.hints.down ? "opacity-100" : "opacity-0"
            )}
          >
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => scroll.scrollBy(160)}
              className={classNames(
                "mb-0.5 h-5 animate-bounce rounded-full px-2 text-slate-500 hover:text-slate-800",
                scroll.hints.down && "pointer-events-auto"
              )}
            >
              <ChevronDown size={16} />
            </button>
          </div>
        </div>

        {/* Cerrar sesión */}
        <div className="border-t border-slate-100 p-2">
          <button
            type="button"
            onClick={handleLogout}
            title={expanded ? undefined : "Cerrar sesión"}
            className="group flex h-10 w-full items-center gap-3 rounded-xl px-[17px] text-sm text-slate-600 transition-colors hover:bg-rose-50 hover:text-rose-700"
          >
            <LogOut size={ICON} className="shrink-0 text-rose-400 group-hover:text-rose-500" />
            <span className={classNames("whitespace-nowrap transition-opacity duration-200", expanded ? "opacity-100" : "opacity-0")}>
              Cerrar sesión
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
