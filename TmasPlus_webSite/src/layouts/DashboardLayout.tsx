import { useState, useMemo } from "react";
import { Outlet } from "react-router-dom";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import defaultProfileImage from "@/assets/perfil.png";

// 👇 Simulación: trae tu usuario real desde contexto o API
const mockUser = {
  usertype: "admin", // "company" | "driver" | ...
  profile_image: undefined,
  subusers: [{ InTurn: true, Name: "Administrador" }],
};

function getDisplayName(u: any) {
  return "Alejandro"; // ajusta a tu lógica real
}

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Ejemplo: regla para company (ajusta a tu cálculo real)
  const isAnySubuserInTurn = useMemo(
    () => !!mockUser?.subusers?.some((s: any) => s.InTurn),
    []
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="relative">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((s) => !s)}
          onClose={() => setSidebarOpen(false)}
          user={mockUser as any}
          isAnySubuserInTurn={isAnySubuserInTurn}
          getDisplayName={getDisplayName as any}
          defaultProfileImage={defaultProfileImage}
          handleLogout={() => { localStorage.removeItem("tplus_auth"); location.href = "/login"; }}
        />
        <main className="md:pl-64">
          {/* Aquí se renderiza cada página hija */}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
