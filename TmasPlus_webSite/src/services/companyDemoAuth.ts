import type { PerfilDashboard } from "@/config/domain.types";
import { COMPANIES_BACKEND_READY, type Company } from "./companies.service";
import { CompaniesMock } from "./companies.mock";

// Acceso de prueba al portal de empresas, sin Supabase. Solo existe en `npm run dev`
// y mientras el módulo use datos de demostración: en el build de producción
// import.meta.env.DEV es false y estas credenciales no se incluyen.
const DEMO_EMAIL = import.meta.env.DEV ? (import.meta.env.VITE_DEMO_COMPANY_EMAIL ?? "").trim().toLowerCase() : "";
const DEMO_PASSWORD = import.meta.env.DEV ? import.meta.env.VITE_DEMO_COMPANY_PASSWORD ?? "" : "";
const SESSION_KEY = "tplus_demo_company_session";

export const DEMO_COMPANY_LOGIN_ENABLED = !COMPANIES_BACKEND_READY && !!DEMO_EMAIL && !!DEMO_PASSWORD;
export const DEMO_COMPANY_EMAIL = DEMO_COMPANY_LOGIN_ENABLED ? DEMO_EMAIL : "";

export function isDemoCompanyCredentials(email: string, password: string): boolean {
  return DEMO_COMPANY_LOGIN_ENABLED && email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}

export function isDemoCompanySessionActive(): boolean {
  try {
    return DEMO_COMPANY_LOGIN_ENABLED && localStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function endDemoCompanySession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* sin localStorage */
  }
}

function profileFromCompany(c: Company): PerfilDashboard {
  return {
    id: c.id,
    auth_id: null,
    nombre: c.nombre_comercial || c.razon_social,
    apellido: null,
    telefono: c.telefono,
    email: c.acceso_email,
    imagen_perfil: c.logo_url,
    ciudad: c.ciudad,
    codigo_referido_usado: null,
    bloqueado: !c.activo,
    verificado: true,
    roles: ["empresa"],
    es_admin: false,
    es_conductor: false,
    es_cliente: false,
    aprobado: false,
  };
}

export async function startDemoCompanySession(): Promise<PerfilDashboard> {
  const company = await CompaniesMock.ensureDemoCompany(DEMO_EMAIL);
  if (!company.activo) throw new Error("La empresa de prueba está inactiva. Actívala desde Empresas.");
  localStorage.setItem(SESSION_KEY, "1");
  return profileFromCompany(company);
}

/** Perfil de la sesión de prueba guardada, o null si no hay una válida. */
export async function restoreDemoCompanySession(): Promise<PerfilDashboard | null> {
  if (!isDemoCompanySessionActive()) return null;
  const company = await CompaniesMock.findByAccessEmail(DEMO_EMAIL);
  if (!company || !company.activo) {
    endDemoCompanySession();
    return null;
  }
  return profileFromCompany(company);
}
