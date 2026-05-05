import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";

export default function AddBookingPage() {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [tripType, setTripType] = useState("Solo ida");
  const [vehicleType, setVehicleType] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Efectivo");
  const [isScheduled, setIsScheduled] = useState(false);
  const [dateTime, setDateTime] = useState("");
  const [hours, setHours] = useState(0);
  const [fare, setFare] = useState<number | null>(null);
  const [observationsEnabled, setObservationsEnabled] = useState(false);
  const [observations, setObservations] = useState("");
  const [success, setSuccess] = useState(false);

  const vehicles = [
    { id: "car", name: "Estandar", base: 10000 },
    { id: "premium", name: "Premium", base: 18000 },
    { id: "van", name: "Van", base: 25000 },
  ];

  const handleCalculate = () => {
    if (!origin || !destination || !vehicleType) {
      alert("Por favor completa origen, destino y tipo de vehículo.");
      return;
    }

    const baseFare = vehicles.find((v) => v.id === vehicleType)?.base || 0;
    let total = baseFare + (tripType === "Ida y regreso" ? baseFare * 0.8 : 0);
    total += isScheduled ? 3000 : 0;
    total += hours * 1500;

    setFare(total);
  };

  const handleSubmit = () => {
    if (!origin || !destination || !vehicleType) {
      alert("Faltan campos obligatorios.");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      resetForm();
    }, 2500);
  };

  const resetForm = () => {
    setOrigin("");
    setDestination("");
    setTripType("Solo ida");
    setVehicleType("");
    setPaymentMethod("Efectivo");
    setIsScheduled(false);
    setDateTime("");
    setHours(0);
    setFare(null);
    setObservationsEnabled(false);
    setObservations("");
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">
        Añadir nueva reserva
      </h1>

      <Card className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Dirección de origen
            </label>
            <input
              type="text"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
              placeholder="Ej: Calle 100 #15-30"
              className="w-full p-2 border border-slate-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Dirección de destino
            </label>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Ej: Av. Boyacá #80-10"
              className="w-full p-2 border border-slate-300 rounded-lg"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Tipo de vehículo
            </label>
            <select
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg"
            >
              <option value="">Seleccionar...</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Método de pago
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg"
            >
              <option>Efectivo</option>
              <option>Tarjeta</option>
              <option>Empresarial</option>
              <option>Daviplata</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Tipo de recorrido
            </label>
            <select
              value={tripType}
              onChange={(e) => setTripType(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg"
            >
              <option>Solo ida</option>
              <option>Ida y regreso</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Tipo de reserva
            </label>
            <select
              value={isScheduled ? "Programado" : "Inmediato"}
              onChange={(e) => setIsScheduled(e.target.value === "Programado")}
              className="w-full p-2 border border-slate-300 rounded-lg"
            >
              <option>Inmediato</option>
              <option>Programado</option>
            </select>
          </div>
        </div>

        {isScheduled && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Fecha y hora programada
            </label>
            <input
              type="datetime-local"
              value={dateTime}
              onChange={(e) => setDateTime(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-lg"
            />
          </div>
        )}

        {tripType === "Ida y regreso" && (
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Horas estimadas de espera
            </label>
            <input
              type="number"
              min={0}
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full p-2 border border-slate-300 rounded-lg"
            />
          </div>
        )}

        {/* Observaciones */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <input
              type="checkbox"
              checked={observationsEnabled}
              onChange={() => setObservationsEnabled(!observationsEnabled)}
            />
            <label className="text-slate-700">Agregar observaciones</label>
          </div>

          {observationsEnabled && (
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Ej: El cliente requiere aire acondicionado..."
              className="w-full p-2 border border-slate-300 rounded-lg"
            />
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={resetForm}>
            Cancelar
          </Button>
          <Button onClick={handleCalculate}>Calcular tarifa</Button>
        </div>

        {fare !== null && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-right text-lg font-semibold text-primary"
          >
            Tarifa estimada: ${fare.toLocaleString("es-CO")}
          </motion.div>
        )}

        {fare !== null && (
          <div className="flex justify-end mt-4">
            <Button onClick={handleSubmit}>Confirmar reserva</Button>
          </div>
        )}
      </Card>

      {/* Modal de éxito */}
      {success && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl p-6 text-center max-w-sm"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              ¡Reserva creada!
            </h2>
            <p className="text-slate-600 mb-4">
              Tu reserva fue registrada exitosamente.
            </p>
            <Button onClick={() => setSuccess(false)}>Cerrar</Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
