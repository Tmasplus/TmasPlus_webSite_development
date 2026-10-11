import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { SIDEBAR_COLLAPSED_PX, SIDEBAR_EXPANDED_PX, Sidebar } from "@/components/layout/Sidebar";
import defaultProfileImage from "@/assets/perfil.png";
import { useAuth } from "@/hooks/useAuth";

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
  const { logout, profile, user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pinned, setPinned] = useState(readPinned);
  const sidebarUser = profile ? {
    usertype: profile.es_admin ? 'admin' : (profile.es_conductor ? 'driver' : 'customer'),
    profile_image: profile.imagen_perfil,
    subusers: [{ InTurn: true, Name: "Administrador" }],
  } : null;

  const handleLogout = async () => {
    await logout();
    window.location.href = "/login";
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
        onToggleSidebar={() => setMobileOpen((s) => !s)}
        account={user || profile ? {
          name: [profile?.nombre, profile?.apellido].filter(Boolean).join(" "),
          email: user?.email ?? "",
          roleLabel: profile?.es_admin ? "Administrador" : profile?.es_conductor ? "Conductor" : "Usuario",
          canOpenSettings: !!profile?.es_admin,
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
          user={sidebarUser}
          isAnySubuserInTurn={true}
          getDisplayName={() => [profile?.nombre, profile?.apellido].filter(Boolean).join(" ")}
          defaultProfileImage={defaultProfileImage}
          handleLogout={handleLogout}
          navigateToWhatsApp={() => {}}
        />
        <main className="transition-[padding] duration-200 md:pl-[var(--sidebar-offset)]">
          {/* Aquí se renderiza cada página hija */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
