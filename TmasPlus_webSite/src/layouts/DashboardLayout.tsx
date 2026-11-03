import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Eye, X } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { SIDEBAR_COLLAPSED_PX, SIDEBAR_EXPANDED_PX, Sidebar } from "@/components/layout/Sidebar";
import { navSectionsFor, type Portal } from "@/components/layout/navigation";
import defaultProfileImage from "@/assets/perfil.png";
import { useAuth } from "@/hooks/useAuth";
import { useCompanyScope } from "@/hooks/useCompanyScope";
import { stopCompanyPreview } from "@/utils/companyPreview";

const PIN_STORAGE_KEY = "tplus_sidebar_pinned";
// Separación entre el menú (pegado al borde izquierdo) y el contenido.
const SIDEBAR_GUTTER_PX = 16;

function readPinned() {
  try {
    return localStorage.getItem(PIN_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export default function DashboardLayout() {
  const { logout, profile, user, mode } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scope = useCompanyScope();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState(readPinned);

  const portal: Portal = mode === "company" || pathname.startsWith("/empresa/") ? "company" : "admin";
  const isCompanyAccount = mode === "company";
  const displayName = [profile?.nombre, profile?.apellido].filter(Boolean).join(" ");
  const roleLabel = profile?.es_admin
    ? "Administrador"
    : isCompanyAccount
    ? "Empresa"
    : profile?.es_conductor
    ? "Conductor"
    : "Usuario";

  const handleLogout = async () => {
    stopCompanyPreview();
    await logout();
    window.location.href = isCompanyAccount ? "/empresas/login" : "/login";
  };

  const exitPreview = () => {
    const id = scope.companyId;
    stopCompanyPreview();
    navigate(id ? `/empresas/${id}` : "/empresas");
  };

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PIN_STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* sin localStorage: solo en memoria */
      }
      return next;
    });
  };

  const contentOffset = (pinned ? SIDEBAR_EXPANDED_PX : SIDEBAR_COLLAPSED_PX) + SIDEBAR_GUTTER_PX;

  return (
    <div className="min-h-screen bg-slate-50" style={{ ["--sidebar-offset" as string]: `${contentOffset}px` }}>
      <Topbar
        portal={portal}
        onToggleSidebar={() => setMobileOpen((s) => !s)}
        account={user || profile ? {
          name: displayName,
          email: user?.email ?? profile?.email ?? "",
          roleLabel,
          canOpenSettings: !!profile?.es_admin && portal === "admin",
          profileTo: portal === "company" ? "/empresa/perfil" : "/userprofile",
        } : null}
        onLogout={handleLogout}
      />
      <div className="relative">
        <Sidebar
          open={mobileOpen}
          onToggle={() => setMobileOpen((s) => !s)}
          onClose={() => setMobileOpen(false)}
          pinned={pinned}
          onTogglePin={togglePin}
          sections={navSectionsFor(portal)}
          displayName={displayName}
          roleLabel={roleLabel}
          profileImage={profile?.imagen_perfil}
          defaultProfileImage={defaultProfileImage}
          handleLogout={handleLogout}
        />
        <main className="transition-[padding] duration-200 md:pl-[var(--sidebar-offset)]">
          {portal === "company" && !isCompanyAccount && (
            <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800 md:mx-6">
              <Eye size={16} className="shrink-0" />
              <span className="min-w-0 flex-1">
                {scope.companyId ? (
                  <>Estás viendo el portal de <strong>{scope.companyName || "la empresa"}</strong> como administrador.</>
                ) : (
                  <>Elige una empresa en <Link to="/empresas" className="font-semibold underline">Empresas</Link> para ver su portal.</>
                )}
              </span>
              <button
                type="button"
                onClick={exitPreview}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-sky-100"
              >
                <X size={14} />
                Salir de la vista de empresa
              </button>
            </div>
          )}
          {/* Aquí se renderiza cada página hija */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
