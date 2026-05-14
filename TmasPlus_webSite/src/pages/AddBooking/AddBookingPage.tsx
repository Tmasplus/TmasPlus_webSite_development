import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import BookingMapView, { type Location, type RouteInfo } from "@/components/maps/MapboxAddressPicker";
import { CarTypesService } from "@/services/carTypes.service";
import type { CarTypeRow } from "@/config/database.types";
import {
  BookingsService,
  type CustomerLite,
} from "@/services/bookings.service";

const PAYMENT_LABEL_TO_DB: Record<string, string> = {
  Efectivo: "cash",
  Tarjeta: "card",
  Empresarial: "corporate",
  Daviplata: "daviplata",
};

const TRIP_LABEL_TO_DB: Record<string, string> = {
  "Solo ida": "Ida",
  "Ida y regreso": "Ida y regreso",
};

function customerFullName(c: CustomerLite) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.id;
}

export default function AddBookingPage() {
  const [originLoc, setOriginLoc] = useState<Location | null>(null);
  const [destLoc, setDestLoc] = useState<Location | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Customer picker
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerLite[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerLite | null>(
    null
  );
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Categories from DB
  const [categories, setCategories] = useState<CarTypeRow[]>([]);

  useEffect(() => {
    CarTypesService.getActive().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCustomer && customerFullName(selectedCustomer) === customerQuery) {
      return;
    }
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(async () => {
      setSearchingCustomer(true);
      try {
        const res = await BookingsService.searchCustomers(customerQuery, 8);
        setCustomerResults(res);
        setShowResults(true);
      } catch {
        setCustomerResults([]);
      } finally {
        setSearchingCustomer(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [customerQuery, selectedCustomer]);

  const origin = originLoc?.title || "";
  const destination = destLoc?.title || "";

  const handleOriginChange = useCallback((loc: Location | null) => {
    setOriginLoc(loc);
  }, []);

  const handleDestinationChange = useCallback((loc: Location | null) => {
    setDestLoc(loc);
  }, []);

  const handleRouteInfo = useCallback((info: RouteInfo | null) => {
    setRouteInfo(info);
  }, []);

  const pickCustomer = (c: CustomerLite) => {
    setSelectedCustomer(c);
    setCustomerQuery(customerFullName(c));
    setShowResults(false);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
  };

  const handleCalculate = () => {
    if (!origin || !destination || !vehicleType) {
      alert("Por favor completa origen, destino y tipo de vehículo.");
      return;
    }

    const cat = categories.find((c) => c.id === vehicleType);
    if (!cat) return;

    const distKm = routeInfo?.distanceKm ?? 0;
    const durationHrs = (routeInfo?.durationMin ?? 0) / 60;

    let total = cat.base_price + cat.price_per_km * distKm + cat.rate_per_hour * durationHrs;

    if (tripType === "Ida y regreso") {
      total += total * 0.8 + cat.valor_hora * hours;
    }

    if (isScheduled) {
      total += cat.delta_aeropuerto_prog;
    }

    total = Math.max(total, cat.min_fare);

    if (cat.convenience_fee > 0) {
      total +=
        cat.convenience_fee_type === "percentage"
          ? total * (cat.convenience_fee / 100)
          : cat.convenience_fee;
    }

    setFare(Math.round(total));
  };

  const handleSubmit = async () => {
    setSubmitError(null);

    if (!selectedCustomer) {
      setSubmitError("Selecciona un cliente.");
      return;
    }
    if (!originLoc || !destLoc) {
      setSubmitError("Falta origen o destino.");
      return;
    }
    if (!vehicleType) {
      setSubmitError("Selecciona un tipo de vehículo.");
      return;
    }
    if (fare === null) {
      setSubmitError("Calcula la tarifa antes de confirmar.");
      return;
    }
    if (isScheduled && !dateTime) {
      setSubmitError("Indica la fecha y hora programada.");
      return;
    }

    const cat = categories.find((c) => c.id === vehicleType);
    if (!cat) {
      setSubmitError("Tipo de vehículo inválido.");
      return;
    }

    const bookingDate = isScheduled
      ? new Date(dateTime).toISOString()
      : new Date().toISOString();

    const driverSharePct = 0.8;
    const conveniencePct =
      cat.convenience_fee_type === "percentage" ? cat.convenience_fee : 0;
    const convenience_fees =
      cat.convenience_fee_type === "percentage"
        ? Math.round(fare * (conveniencePct / 100))
        : cat.convenience_fee;

    setSubmitting(true);
    try {
      await BookingsService.create({
        customer_id: selectedCustomer.id,
        customer_name: customerFullName(selectedCustomer),
        customer_email: selectedCustomer.email,
        customer_contact: selectedCustomer.mobile || "",
        pickup: {
          lat: originLoc.latitude,
          lng: originLoc.longitude,
          address: originLoc.title,
        },
        destination: {
          lat: destLoc.latitude,
          lng: destLoc.longitude,
          address: destLoc.title,
        },
        distance_km: Number((routeInfo?.distanceKm ?? 0).toFixed(2)),
        duration_min: Math.round(routeInfo?.durationMin ?? 0),
        car_type: cat.name,
        car_type_id: cat.id,
        trip_type: TRIP_LABEL_TO_DB[tripType] || tripType,
        booking_type: isScheduled ? "reservation" : "immediate",
        booking_date: bookingDate,
        payment_mode: PAYMENT_LABEL_TO_DB[paymentMethod] || "cash",
        estimate: fare,
        total_cost: fare,
        driver_share: Math.round(fare * driverSharePct),
        convenience_fees,
        discount: 0,
        observations: observationsEnabled ? observations : null,
      });
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        resetForm();
      }, 2500);
    } catch (e: any) {
      setSubmitError(e?.message || "Error al crear la reserva");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setOriginLoc(null);
    setDestLoc(null);
    setRouteInfo(null);
    setTripType("Solo ida");
    setVehicleType("");
    setPaymentMethod("Efectivo");
    setIsScheduled(false);
    setDateTime("");
    setHours(0);
    setFare(null);
    setObservationsEnabled(false);
    setObservations("");
    clearCustomer();
    setSubmitError(null);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-slate-900 mb-6">
        Añadir nueva reserva
      </h1>

      <Card className="p-6 space-y-6">
        {/* ── Cliente ── */}
        <div>
          <label className="block text-sm text-slate-600 mb-1">Cliente</label>
          <div className="relative">
            <div className="flex gap-2">
              <input
                type="text"
                value={customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  if (selectedCustomer) setSelectedCustomer(null);
                }}
                onFocus={() => customerResults.length > 0 && setShowResults(true)}
                placeholder="Buscar cliente por nombre, email o teléfono..."
                className="flex-1 p-2 border border-slate-300 rounded-lg"
              />
              {selectedCustomer && (
                <Button variant="secondary" onClick={clearCustomer}>
                  Quitar
                </Button>
              )}
            </div>
            {showResults && customerResults.length > 0 && !selectedCustomer && (
              <div className="absolute z-10 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                {customerResults.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => pickCustomer(c)}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
                  >
                    <div className="text-sm font-medium text-slate-800">
                      {customerFullName(c)}
                    </div>
                    <div className="text-xs text-slate-500">
                      {c.email || "sin email"} · {c.mobile || "sin teléfono"}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {searchingCustomer && (
              <div className="absolute right-3 top-3 text-xs text-slate-400">
                Buscando...
              </div>
            )}
          </div>
          {selectedCustomer && (
            <div className="mt-2 text-xs text-slate-500">
              ID: <span className="font-mono">{selectedCustomer.id}</span> ·{" "}
              {selectedCustomer.email || "sin email"} ·{" "}
              {selectedCustomer.mobile || "sin teléfono"}
            </div>
          )}
        </div>

        {/* ── Mapa con búsqueda de direcciones ── */}
        <BookingMapView
          origin={originLoc}
          destination={destLoc}
          onOriginChange={handleOriginChange}
          onDestinationChange={handleDestinationChange}
          onRouteInfo={handleRouteInfo}
        />

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
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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

        {submitError && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
            {submitError}
          </div>
        )}

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
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "Creando..." : "Confirmar reserva"}
            </Button>
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
              Tu reserva fue registrada exitosamente en la base de datos.
            </p>
            <Button onClick={() => setSuccess(false)}>Cerrar</Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
