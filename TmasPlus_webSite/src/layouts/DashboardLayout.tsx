import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import defaultProfileImage from "@/assets/perfil.png";
import { useAuth } from "@/hooks/useAuth";

export default function DashboardLayout() {
  const { logout, profile } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const sidebarUser = profile ? {
    usertype: profile.es_admin ? 'admin' : (profile.es_conductor ? 'driver' : 'customer'),
    profile_image: profile.imagen_perfil,
    subusers: [{ InTurn: true, Name: "Administrador" }],
  } : null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="relative">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((s) => !s)}
          onClose={() => setSidebarOpen(false)}
          user={sidebarUser}
          isAnySubuserInTurn={true}
          getDisplayName={() => [profile?.nombre, profile?.apellido].filter(Boolean).join(" ")}
          defaultProfileImage={defaultProfileImage}
          handleLogout={async () => {
            await logout();
            window.location.href = "/login";
          }}
          navigateToWhatsApp={() => {}}
        />
        <main className="md:pl-64">
          {/* Aquí se renderiza cada página hija */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
