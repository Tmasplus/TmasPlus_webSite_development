import { useState, useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import { BookingModal } from "./BookingModal";

export default function BookingHistoryPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [filteredBookings, setFilteredBookings] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState<any>(null);

  // 🔹 Datos simulados temporalmente
  useEffect(() => {
    const mock = [
      {
        id: 1,
        createdAt: "2025-10-28T09:00:00",
        scheduledAt: "2025-10-28T10:00:00",
        client: "Carlos Ruiz",
        driver: "Juan Pérez",
        plate: "ABC-123",
        type: "Estandar",
        otp: "9854",
        cost: 25000,
        commission: 3000,
        status: "COMPLETADO",
      },
      {
        id: 2,
        createdAt: "2025-10-27T14:00:00",
        scheduledAt: "2025-10-27T15:30:00",
        client: "Laura Gómez",
        driver: "Pedro Torres",
        plate: "XYZ-987",
        type: "Premium",
        otp: "4561",
        cost: 42000,
        commission: 4000,
        status: "PENDIENTE",
      },
    ];
    setBookings(mock);
    setFilteredBookings(mock);
  }, []);

  // 🔍 Buscar
  const handleSearch = () => {
    const term = searchTerm.toLowerCase();
    const filtered = bookings.filter(
      (b) =>
        b.client.toLowerCase().includes(term) ||
        b.driver.toLowerCase().includes(term) ||
        b.plate.toLowerCase().includes(term)
    );
    setFilteredBookings(filtered);
  };

  // 📤 Exportar CSV puro JS
  const exportToCSV = () => {
    if (filteredBookings.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const headers = [
      "Fecha creación",
      "Fecha servicio",
      "Cliente",
      "Conductor",
      "Placa",
      "Tipo",
      "Costo",
      "Comisión",
      "Estado",
      "OTP",
    ];

    const rows = filteredBookings.map((b) => [
      new Date(b.createdAt).toLocaleString(),
      new Date(b.scheduledAt).toLocaleString(),
      b.client,
      b.driver,
      b.plate,
      b.type,
      b.cost,
      b.commission,
      b.status,
      b.otp,
    ]);

    const csvContent =
      [headers, ...rows]
        .map((row) =>
          row
            .map((value) =>
              typeof value === "string"
                ? `"${value.replace(/"/g, '""')}"`
                : value
            )
            .join(",")
        )
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "historial_reservas.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const openBookingModal = (booking: any) => {
    setSelectedBooking(booking);
    setOpenModal(true);
  };

  const closeBookingModal = () => {
    setSelectedBooking(null);
    setOpenModal(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Historial de reservas
        </h1>
        <Button onClick={exportToCSV}>Exportar CSV</Button>
      </div>

      {/* Buscador */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Buscar por cliente, conductor o placa..."
          className="p-2 border border-slate-300 rounded-lg flex-1 focus:outline-none focus:ring-2 focus:ring-primary/40"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSearch()}
        />
        <Button onClick={handleSearch}>Buscar</Button>
      </div>

      {/* Tabla */}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="p-3">Fecha creación</th>
              <th className="p-3">Fecha servicio</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Conductor</th>
              <th className="p-3">Placa</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Costo</th>
              <th className="p-3">Estado</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredBookings.length > 0 ? (
              filteredBookings.map((b) => (
                <motion.tr
                  key={b.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-b hover:bg-slate-50"
                >
                  <td className="p-3">
                    {new Date(b.createdAt).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {new Date(b.scheduledAt).toLocaleString()}
                  </td>
                  <td className="p-3">{b.client}</td>
                  <td className="p-3">{b.driver}</td>
                  <td className="p-3">{b.plate}</td>
                  <td className="p-3">{b.type}</td>
                  <td className="p-3">${b.cost.toLocaleString()}</td>
                  <td className="p-3">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        b.status === "COMPLETADO"
                          ? "bg-green-100 text-green-800"
                          : b.status === "PENDIENTE"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="secondary"
                      onClick={() => openBookingModal(b)}
                    >
                      Ver
                    </Button>
                  </td>
                </motion.tr>
              ))
            ) : (
              <tr>
                <td colSpan={9} className="text-center py-6 text-slate-400">
                  No hay reservas registradas.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Modal */}
      <BookingModal
        open={openModal}
        onClose={closeBookingModal}
        booking={selectedBooking}
      />
    </div>
  );
}
