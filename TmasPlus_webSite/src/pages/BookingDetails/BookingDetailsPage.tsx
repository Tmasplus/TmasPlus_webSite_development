import React, { useState } from "react";
import { FloatingInput } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

export default function BookingDetailsPage() {
  const [reference, setReference] = useState("");
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSearched(true);

    // const res = await fetch(`/api/bookings/${reference}`);
    // const data = await res.json();
    // setBooking(data);

    // 🔹 Mock temporal — simula búsqueda
    setTimeout(() => {
      if (reference === "TPLUS123") {
        setBooking({
          id: "TPLUS123",
          usuario: "Juan Pérez",
          origen: "Calle 12 #5-32",
          destino: "Centro Comercial Gran Plaza",
          estado: "Completado",
          fecha: "2025-10-10 15:40",
          costo: "$23.000",
        });
      } else {
        setBooking(null);
      }
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">
          Resumen del Servicio
        </h1>
        <h4>(buscar TPLUS123)</h4>

        <form
          onSubmit={handleSearch}
          className="flex items-center gap-2 w-full md:w-auto"
        >
          <FloatingInput
            id="referencia"
            label="Referencia de reserva"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Button
            type="submit"
            disabled={!reference.trim() || loading}
            className="whitespace-nowrap px-6 py-3"
          >
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </form>
      </div>

      {/* Resultado */}
      <div className="mt-6">
        {!searched ? (
          <p className="text-slate-500 text-center mt-10">
            Ingresa una referencia para buscar una reserva.
          </p>
        ) : loading ? (
          <p className="text-slate-500 text-center mt-10">Buscando...</p>
        ) : booking ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md p-6 space-y-4"
          >
            <h2 className="text-xl font-semibold text-primary-dark">
              Detalles de la reserva
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-slate-700">
              <Detail label="ID de Reserva" value={booking.id} />
              <Detail label="Usuario" value={booking.usuario} />
              <Detail label="Dirección de Origen" value={booking.origen} />
              <Detail label="Dirección de Destino" value={booking.destino} />
              <Detail label="Estado" value={booking.estado} />
              <Detail label="Fecha" value={booking.fecha} />
              <Detail label="Costo" value={booking.costo} />
            </div>
          </motion.div>
        ) : (
          <p className="text-slate-500 text-center mt-10">
            No se encontraron reservas con esa referencia.
          </p>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="font-medium text-slate-800">{value}</p>
    </div>
  );
}
