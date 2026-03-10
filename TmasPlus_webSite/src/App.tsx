import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { UsersPage } from "@/pages/Users/UsersPage";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mocks para resolver los type errors de TypeScript en el componente Sidebar
  const mockUser = {
    usertype: "admin",
    profile_image: undefined,
    subusers: [{ InTurn: true, Name: "Administrador" }],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="relative">
        <Sidebar 
          open={sidebarOpen} 
          onToggle={() => setSidebarOpen((s) => !s)}
          onClose={() => setSidebarOpen(false)} 
          user={mockUser as any}
          isAnySubuserInTurn={true}
          getDisplayName={() => "Usuario"}
          defaultProfileImage=""
          handleLogout={() => {}}
          navigateToWhatsApp={() => {}}
        />
        <main className="md:pl-64">
          <UsersPage />
        </main>
      </div>
    </div>
  );
}
