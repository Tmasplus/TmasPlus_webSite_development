import { useState } from "react";
import { Topbar } from "@/components/layout/Topbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { UsersPage } from "@/pages/Users/UsersPage";

export default function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <Topbar onToggleSidebar={() => setSidebarOpen((s) => !s)} />
      <div className="relative">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="md:pl-64">
          <UsersPage />
        </main>
      </div>
    </div>
  );
}
