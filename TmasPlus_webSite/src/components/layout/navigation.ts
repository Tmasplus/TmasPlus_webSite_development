import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Bell,
  Briefcase,
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

export type NavPage = {
  to: string;
  label: string;
  section: string;
  icon: LucideIcon;
  /** Palabras extra para el buscador del header. */
  keywords?: string;
};

export const NAV_PAGES: NavPage[] = [
  { to: "/home", label: "Inicio", section: "Principal", icon: House, keywords: "dashboard panel resumen" },
  { to: "/bookingHistory", label: "Historial de reservas", section: "Reservas", icon: CalendarClock, keywords: "viajes servicios" },
  { to: "/addbooking", label: "Añadir reserva", section: "Reservas", icon: CalendarPlus, keywords: "nueva crear viaje" },
  { to: "/bookingCorp", label: "Reservas corporativas", section: "Reservas", icon: Building2, keywords: "empresas" },
  { to: "/bookingdetails", label: "Detalle de reserva", section: "Reservas", icon: FileText, keywords: "referencia" },
  { to: "/users", label: "Usuarios App", section: "Usuarios", icon: Users, keywords: "clientes pasajeros" },
  { to: "/app-drivers", label: "Conductores App", section: "Usuarios", icon: IdCard, keywords: "choferes" },
  { to: "/memberships", label: "Membresías", section: "Gestión", icon: BadgeCheck, keywords: "planes pagos" },
  { to: "/notifications", label: "Notificaciones", section: "Gestión", icon: Bell, keywords: "push avisos" },
  { to: "/billing", label: "Módulo de facturación", section: "Gestión", icon: Receipt, keywords: "facturas" },
  { to: "/shiftchanger", label: "Cambiar turno", section: "Gestión", icon: Repeat },
  { to: "/officialview", label: "Funcionarios", section: "Gestión", icon: Briefcase },
  { to: "/complaints", label: "Quejas", section: "Gestión", icon: MessageSquareWarning, keywords: "reclamos pqr soporte" },
  { to: "/vehicle-map", label: "Mapa de vehículos", section: "Operación", icon: MapPinned, keywords: "flota ubicación" },
  { to: "/treasoffers", label: "Ofertas TREAS", section: "Operación", icon: Tag },
  { to: "/contracts", label: "Contratos", section: "Operación", icon: FileSignature },
  { to: "/car-brands", label: "Marcas de vehículos", section: "Operación", icon: Car, keywords: "modelos" },
  { to: "/tolls", label: "Peajes", section: "Operación", icon: Milestone },
  { to: "/userprofile", label: "Perfil", section: "Cuenta", icon: UserRound, keywords: "mi cuenta" },
  { to: "/settings", label: "Configuración", section: "Cuenta", icon: Settings, keywords: "ajustes tarifas" },
];

export function pageForPath(pathname: string): NavPage | null {
  return NAV_PAGES.find((p) => pathname === p.to || pathname.startsWith(`${p.to}/`)) ?? null;
}
