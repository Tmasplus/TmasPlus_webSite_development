import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bell,
  Briefcase,
  Building,
  Building2,
  CalendarClock,
  CalendarPlus,
  Car,
  FileSignature,
  FileText,
  House,
  IdCard,
  MapPinned,
  MessageSquareWarning,
  Milestone,
  Receipt,
  Repeat,
  Settings,
  Tag,
  UserRound,
  Users,
} from "lucide-react";

export type Portal = "admin" | "company";

export type NavPage = {
  to: string;
  label: string;
  section: string;
  icon: LucideIcon;
  portal: Portal;
  /** Palabras extra para el buscador del header. */
  keywords?: string;
};

export const NAV_PAGES: NavPage[] = [
  { to: "/home", label: "Inicio", section: "Principal", icon: House, portal: "admin", keywords: "dashboard panel resumen" },
  { to: "/bookingHistory", label: "Historial de reservas", section: "Reservas", icon: CalendarClock, portal: "admin", keywords: "viajes servicios" },
  { to: "/addbooking", label: "Añadir reserva", section: "Reservas", icon: CalendarPlus, portal: "admin", keywords: "nueva crear viaje" },
  { to: "/bookingCorp", label: "Reservas corporativas", section: "Reservas", icon: Building2, portal: "admin", keywords: "empresas" },
  { to: "/bookingdetails", label: "Detalle de reserva", section: "Reservas", icon: FileText, portal: "admin", keywords: "referencia" },
  { to: "/users", label: "Usuarios App", section: "Usuarios", icon: Users, portal: "admin", keywords: "clientes pasajeros" },
  { to: "/app-drivers", label: "Conductores App", section: "Usuarios", icon: IdCard, portal: "admin", keywords: "choferes" },
  { to: "/empresas", label: "Empresas", section: "Usuarios", icon: Building, portal: "admin", keywords: "corporativo nit colaboradores viajes empresariales" },
  { to: "/memberships", label: "Membresías", section: "Gestión", icon: BadgeCheck, portal: "admin", keywords: "planes pagos" },
  { to: "/notifications", label: "Notificaciones", section: "Gestión", icon: Bell, portal: "admin", keywords: "push avisos" },
  { to: "/billing", label: "Módulo de facturación", section: "Gestión", icon: Receipt, portal: "admin", keywords: "facturas" },
  { to: "/shiftchanger", label: "Cambiar turno", section: "Gestión", icon: Repeat, portal: "admin" },
  { to: "/officialview", label: "Funcionarios", section: "Gestión", icon: Briefcase, portal: "admin" },
  { to: "/complaints", label: "Quejas", section: "Gestión", icon: MessageSquareWarning, portal: "admin", keywords: "reclamos pqr soporte" },
  { to: "/vehicle-map", label: "Mapa de vehículos", section: "Operación", icon: MapPinned, portal: "admin", keywords: "flota ubicación" },
  { to: "/treasoffers", label: "Ofertas TREAS", section: "Operación", icon: Tag, portal: "admin" },
  { to: "/contracts", label: "Contratos", section: "Operación", icon: FileSignature, portal: "admin" },
  { to: "/car-brands", label: "Marcas de vehículos", section: "Operación", icon: Car, portal: "admin", keywords: "modelos" },
  { to: "/tolls", label: "Peajes", section: "Operación", icon: Milestone, portal: "admin" },
  { to: "/userprofile", label: "Perfil", section: "Cuenta", icon: UserRound, portal: "admin", keywords: "mi cuenta" },
  { to: "/settings", label: "Configuración", section: "Cuenta", icon: Settings, portal: "admin", keywords: "ajustes tarifas" },

  { to: "/empresa/inicio", label: "Inicio", section: "Principal", icon: House, portal: "company", keywords: "resumen panel" },
  { to: "/empresa/reservar", label: "Solicitar viaje", section: "Viajes", icon: CalendarPlus, portal: "company", keywords: "nueva reserva pedir servicio" },
  { to: "/empresa/reservas", label: "Historial de viajes", section: "Viajes", icon: CalendarClock, portal: "company", keywords: "reservas servicios cancelar" },
  { to: "/empresa/colaboradores", label: "Colaboradores", section: "Equipo", icon: Users, portal: "company", keywords: "empleados trabajadores personal" },
  { to: "/empresa/perfil", label: "Perfil de la empresa", section: "Cuenta", icon: Building, portal: "company", keywords: "mi cuenta datos nit" },
];

export function navPagesFor(portal: Portal): NavPage[] {
  return NAV_PAGES.filter((p) => p.portal === portal);
}

/** Páginas del portal agrupadas por sección, en el orden de NAV_PAGES. */
export function navSectionsFor(portal: Portal): { title: string; items: NavPage[] }[] {
  const sections: { title: string; items: NavPage[] }[] = [];
  for (const page of navPagesFor(portal)) {
    const section = sections.find((s) => s.title === page.section);
    if (section) section.items.push(page);
    else sections.push({ title: page.section, items: [page] });
  }
  return sections;
}

export function pageForPath(pathname: string): NavPage | null {
  return NAV_PAGES.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`)) ?? null;
}
