import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Bell } from "lucide-react";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([
    {
      id: "1",
      title: "Mantenimiento programado",
      body: "El sistema estará en mantenimiento el 1 de noviembre a las 10 p.m.",
      usertype: "driver",
      devicetype: "ALL",
      createdAt: Date.now(),
    },
    {
      id: "2",
      title: "Actualización disponible",
      body: "Nueva versión disponible en Play Store y App Store.",
      usertype: "customer",
      devicetype: "ANDROID",
      createdAt: Date.now() - 86400000,
    },
  ]);

  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [usertype, setUsertype] = useState("driver");
  const [devicetype, setDevicetype] = useState("ALL");

  const handleAdd = () => {
    if (!title.trim() || !body.trim()) return;
    const newNotification = {
      id: crypto.randomUUID(),
      title,
      body,
      usertype,
      devicetype,
      createdAt: Date.now(),
    };
    setNotifications([newNotification, ...notifications]);
    setShowModal(false);
    setTitle("");
    setBody("");
  };

  const handleDelete = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-6xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm p-6"
      >
        <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-6">
          <h1 className="text-2xl font-semibold text-slate-900 flex items-center gap-2">
            <Bell className="text-primary-dark" />
            Notificaciones
          </h1>
          <Button onClick={() => setShowModal(true)}>Nueva Notificación</Button>
        </div>

        {/* Listado */}
        {notifications.length === 0 ? (
          <div className="text-center text-slate-500 py-16">
            <Bell className="mx-auto w-10 h-10 mb-3 text-slate-400" />
            No hay notificaciones aún.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {notifications.map((n) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-slate-800 text-lg">
                    {n.title}
                  </h3>
                  <button
                    onClick={() => handleDelete(n.id)}
                    className="text-slate-400 hover:text-red-600 transition"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-slate-600 text-sm mb-4">{n.body}</p>
                <div className="flex flex-wrap text-xs text-slate-500 gap-2">
                  <span className="bg-slate-100 px-2 py-1 rounded-lg">
                    {n.usertype === "driver" ? "Conductor" : "Cliente"}
                  </span>
                  <span className="bg-slate-100 px-2 py-1 rounded-lg">
                    {n.devicetype}
                  </span>
                  <span>{new Date(n.createdAt).toLocaleString()}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl p-6 w-96 border border-slate-200"
          >
            <h2 className="text-lg font-semibold text-slate-800 mb-4 text-center">
              Crear Notificación
            </h2>

            <label className="block text-sm text-slate-600 mb-1">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-primary/40"
              placeholder="Ej: Actualización disponible"
            />

            <label className="block text-sm text-slate-600 mb-1">Mensaje</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-primary/40"
              rows={3}
              placeholder="Describe el contenido de la notificación..."
            />

            <label className="block text-sm text-slate-600 mb-1">
              Tipo de Usuario
            </label>
            <select
              value={usertype}
              onChange={(e) => setUsertype(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-3 focus:ring-2 focus:ring-primary/40"
            >
              <option value="driver">Conductor</option>
              <option value="customer">Cliente</option>
            </select>

            <label className="block text-sm text-slate-600 mb-1">
              Tipo de Dispositivo
            </label>
            <select
              value={devicetype}
              onChange={(e) => setDevicetype(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm mb-5 focus:ring-2 focus:ring-primary/40"
            >
              <option value="ALL">Todos</option>
              <option value="ANDROID">Android</option>
              <option value="IOS">iOS</option>
            </select>

            <div className="flex gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                className="w-1/2"
              >
                Cancelar
              </Button>
              <Button onClick={handleAdd} className="w-1/2">
                Enviar
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
