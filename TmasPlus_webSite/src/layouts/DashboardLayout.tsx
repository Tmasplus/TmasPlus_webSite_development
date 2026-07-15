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
    usertype: profile.user_type,
    profile_image: profile.profile_image,
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
          getDisplayName={() => [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")}
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
