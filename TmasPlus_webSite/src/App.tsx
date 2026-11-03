import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { navSectionsFor } from "@/components/layout/navigation";
import { UsersPage } from "@/pages/Users/UsersPage";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="relative">
        <Sidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen((s) => !s)}
          onClose={() => setSidebarOpen(false)}
          sections={navSectionsFor("admin")}
          displayName="Usuario"
          roleLabel="Administrador"
          defaultProfileImage=""
          handleLogout={() => {}}
        />
        <main className="md:pl-24">
          <UsersPage />
        </main>
      </div>
    </div>
  );
}
