import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import AddComplainForm from "./AddComplainForm";

export default function ComplaintsViewPage() {
  const [userType, setUserType] = useState<"admin" | "user">("admin"); // simula el tipo de usuario
  const [complains, setComplains] = useState([
    {
      id: 1,
      complainDate: "2025-10-25T12:00:00",
      subject: "Demora en el servicio",
      body: "El conductor llegó 30 minutos tarde.",
      email: "cliente1@correo.com",
      firstName: "Carlos Ruiz",
      check: false,
      imageResponse: "",
      details: "",
      fromResponse: "",
    },
    {
      id: 2,
      complainDate: "2025-10-24T15:00:00",
      subject: "Error en el cobro",
      body: "El valor del viaje fue superior al estimado.",
      email: "cliente2@correo.com",
      firstName: "Laura Gómez",
      check: true,
      imageResponse: "",
      details: "Se revisó el caso, reembolso aprobado.",
      fromResponse: "Correo",
    },
  ]);

  const [selectedComplain, setSelectedComplain] = useState<any>(null);
  const [details, setDetails] = useState("");
  const [fromResponse, setFromResponse] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🔹 Exportar CSV (JS puro)
  const exportToCSV = () => {
    const headers = [
      "Fecha de la Queja",
      "Asunto",
      "Descripción",
      "Usuario",
      "Nombre",
      "Estado",
    ];

    const rows = complains.map((c) => [
      new Date(c.complainDate).toLocaleString(),
      c.subject,
      c.body,
      c.email,
      c.firstName,
      c.check ? "Resuelto" : "Pendiente",
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((v) =>
              typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "quejas.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const toggleResolved = (id: number) => {
    setComplains((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, check: !c.check } : c
      )
    );
  };

  const openModal = (complain: any) => {
    setSelectedComplain(complain);
    setDetails(complain.details || "");
    setFromResponse(complain.fromResponse || "");
    setIsModalOpen(true);
  };

  const handleDetailsSubmit = () => {
    setComplains((prev) =>
      prev.map((c) =>
        c.id === selectedComplain.id
          ? { ...c, details, fromResponse }
          : c
      )
    );
    setIsModalOpen(false);
  };

  if (userType !== "admin") {
    return <AddComplainForm />;
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Historial de Quejas
        </h1>
        <Button onClick={exportToCSV}>Exportar CSV</Button>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Fecha</th>
              <th className="p-3">Asunto</th>
              <th className="p-3">Descripción</th>
              <th className="p-3">Usuario</th>
              <th className="p-3">Nombre</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {complains.map((c) => (
              <motion.tr
                key={c.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="border-b hover:bg-slate-50"
              >
                <td className="p-3">{new Date(c.complainDate).toLocaleString()}</td>
                <td className="p-3">{c.subject}</td>
                <td className="p-3">{c.body}</td>
                <td className="p-3">{c.email}</td>
                <td className="p-3">{c.firstName}</td>
                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      c.check
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {c.check ? "Resuelto" : "Pendiente"}
                  </span>
                </td>
                <td className="p-3 text-center space-x-2">
                  <Button
                    variant="secondary"
                    onClick={() => toggleResolved(c.id)}
                  >
                    {c.check ? "Marcar pendiente" : "Marcar resuelto"}
                  </Button>
                  <Button onClick={() => openModal(c)}>Detalles</Button>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl"
          >
            <h2 className="text-xl font-semibold mb-4 text-slate-800">
              Detalles de la Queja
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Detalles de respuesta
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  className="w-full border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block text-sm text-slate-600 mb-1">
                  Modo de contacto
                </label>
                <select
                  value={fromResponse}
                  onChange={(e) => setFromResponse(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-2"
                >
                  <option value="">Seleccionar</option>
                  <option value="Correo">Correo</option>
                  <option value="Whatsapp">Whatsapp</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleDetailsSubmit}>Guardar</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
