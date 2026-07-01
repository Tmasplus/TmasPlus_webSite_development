import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import BookingMapView, { type Location, type RouteInfo } from "@/components/maps/GoogleMapsAddressPicker";
import { CarTypesService } from "@/services/carTypes.service";
import type { CarTypeRow } from "@/config/database.types";
import {
  BookingsService,
  type CustomerLite,
} from "@/services/bookings.service";
import { isNearAirport } from "@/utils/airports";
import {
  DELTA_AEROPUERTO,
  DELTA_PROGRAMADO,
  MARGEN_CLIENTE,
} from "@/utils/fareConstants";

const PAYMENT_LABEL_TO_DB: Record<string, string> = {
  Efectivo: "cash",
  Nequi: "nequi",
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
  const [fareBreakdown, setFareBreakdown] = useState<{
    isInter: boolean;
    base: number;
    perKm: number;
    perHour: number;
    waiting: number;
    returnLeg: number;
    schedulingSurcharge: number;
    airportSurcharge: number;
    airportName: string | null;
    convenience: number;
    minApplied: boolean;
    totalConductor: number;   // ROUNDUP centena, lo que recibe el conductor
    valorCliente: number;     // total_conductor × 1.25 ROUNDUP, lo que paga el cliente
  } | null>(null);
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
    if (!routeInfo) {
      alert("Aún no se ha calculado la ruta en el mapa.");
      return;
    }

    const cat = categories.find((c) => c.id === vehicleType);
    if (!cat) return;

    const distKm = routeInfo.distanceKm;
    const durationSec = routeInfo.durationMin * 60;

    const umbral = cat.umbral_intermunicipal_km ?? 29;
    const isInter = distKm > umbral;

    const basePrice = isInter ? cat.base_price_inter : cat.base_price;
    const perKm = isInter ? cat.price_per_km_inter : cat.price_per_km;
    const minFare = isInter ? cat.min_fare_inter : cat.min_fare;

    // Alineado con Agente/backendRemoto y sistema_calculo: el precio por minuto
    // se deriva de `valor_hora / 60`, NO del campo legacy `rate_per_hour` que
    // en BD puede estar desincronizado. Si es intermunicipal, se aplica el
    // factor inter (/0.5 = ×2) sobre el valor por minuto.
    const valorHora = Number(cat.valor_hora) || 0;
    const ratePerMinuteUrban = valorHora / 60;
    const ratePerMinute = isInter ? ratePerMinuteUrban / 0.5 : ratePerMinuteUrban;

    const baseComponent = basePrice;
    const distComponent = perKm * distKm;
    const timeComponent = ratePerMinute * (durationSec / 60);

    let oneWay = baseComponent + distComponent + timeComponent;

    const returnLeg = tripType === "Ida y regreso" ? oneWay * 0.8 : 0;
    const waiting = tripType === "Ida y regreso" ? cat.valor_hora * hours : 0;

    // Detección automática de aeropuerto por coordenadas (Haversine, radio 1 km).
    // Portado de Agente/backendRemoto. Cero UI: si origen o destino cae en la
    // zona de un aeropuerto conocido, se aplica el delta.
    const originAirport =
      originLoc && isNearAirport(originLoc.latitude, originLoc.longitude);
    const destAirport =
      destLoc && isNearAirport(destLoc.latitude, destLoc.longitude);
    const airportName = originAirport || destAirport || null;
    const isAirport = airportName !== null;

    // Conceptos independientes. Se SUMAN naturalmente cuando ambos aplican.
    // Sin lógica condicional aero+prog (que en BD vive pre-sumado bajo
    // `delta_aeropuerto_prog` y obliga a ramas confusas). Constantes oficiales
    // alineadas con Excel `Tabla Tarifas` y Agente/backendRemoto.
    const airportSurcharge = isAirport ? DELTA_AEROPUERTO : 0;      // 12 000
    const schedulingSurcharge = isScheduled ? DELTA_PROGRAMADO : 0; //  4 800

    const sumaComponentes =
      oneWay + returnLeg + waiting + airportSurcharge + schedulingSurcharge;

    // ROUNDUP centena (alineado con backendRemoto / Excel J25)
    let totalConductor = Math.ceil(sumaComponentes / 100) * 100;

    // Aplicar piso min_fare DESPUÉS de roundup, como hace backendRemoto
    const minApplied = totalConductor < minFare;
    if (minApplied) totalConductor = minFare;

    // Margen Erixon (Tapa!F13-F14 del Excel oficial) sobre total_conductor
    const valorCliente =
      Math.ceil((totalConductor * (1 + MARGEN_CLIENTE)) / 100) * 100;

    // Convenience fee (porcentaje o flat). Se aplica sobre el valor cliente
    // como cobro adicional, NO sustituye el margen.
    let convenience = 0;
    if (cat.convenience_fee > 0) {
      convenience =
        cat.convenience_fee_type === "percentage"
          ? valorCliente * (cat.convenience_fee / 100)
          : cat.convenience_fee;
    }

    // Lo que paga el cliente = valor_cliente + convenience
    const total = Math.round(valorCliente + convenience);

    setFare(total);
    setFareBreakdown({
      isInter,
      base: Math.round(baseComponent),
      perKm: Math.round(distComponent),
      perHour: Math.round(timeComponent),
      waiting: Math.round(waiting),
      returnLeg: Math.round(returnLeg),
      schedulingSurcharge: Math.round(schedulingSurcharge),
      airportSurcharge: Math.round(airportSurcharge),
      airportName,
      convenience: Math.round(convenience),
      minApplied,
      totalConductor,
      valorCliente,
    });
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

    // Cobro inicial = mínimo del rango (totalConductor). El máximo (valorCliente)
    // queda como estimación superior; puede ajustarse al finalizar el servicio
    // real según distancia/tiempo efectivos.
    const minCharge = fareBreakdown?.totalConductor ?? fare;
    const maxCharge = fareBreakdown?.valorCliente ?? fare;

    const conveniencePct =
      cat.convenience_fee_type === "percentage" ? cat.convenience_fee : 0;
    const convenience_fees =
      cat.convenience_fee_type === "percentage"
        ? Math.round(minCharge * (conveniencePct / 100))
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
        estimate: maxCharge,        // estimación superior (referencia)
        total_cost: minCharge,      // cobro inicial = mínimo del rango
        driver_share: minCharge,    // conductor recibe el valor conductor íntegro
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
    setFareBreakdown(null);
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
              <option>Nequi</option>
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

        {fare !== null && fareBreakdown && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-700">
                Desglose ({fareBreakdown.isInter ? "Intermunicipal" : "Urbano"})
              </span>
              <span className="text-xs text-slate-500">
                {routeInfo?.distanceKm} km · {routeInfo?.durationMin} min
              </span>
            </div>
            <ul className="text-sm text-slate-600 space-y-1">
              <li className="flex justify-between"><span>Tarifa base</span><span>${fareBreakdown.base.toLocaleString("es-CO")}</span></li>
              <li className="flex justify-between"><span>Distancia</span><span>${fareBreakdown.perKm.toLocaleString("es-CO")}</span></li>
              <li className="flex justify-between"><span>Tiempo de viaje</span><span>${fareBreakdown.perHour.toLocaleString("es-CO")}</span></li>
              {fareBreakdown.returnLeg > 0 && (
                <li className="flex justify-between"><span>Regreso (80%)</span><span>${fareBreakdown.returnLeg.toLocaleString("es-CO")}</span></li>
              )}
              {fareBreakdown.waiting > 0 && (
                <li className="flex justify-between"><span>Espera ({hours}h)</span><span>${fareBreakdown.waiting.toLocaleString("es-CO")}</span></li>
              )}
              {fareBreakdown.airportSurcharge > 0 && (
                <li className="flex justify-between">
                  <span title={fareBreakdown.airportName ?? ""}>
                    Aeropuerto{fareBreakdown.airportName ? ` (${fareBreakdown.airportName})` : ""}
                  </span>
                  <span>${fareBreakdown.airportSurcharge.toLocaleString("es-CO")}</span>
                </li>
              )}
              {fareBreakdown.schedulingSurcharge > 0 && (
                <li className="flex justify-between"><span>Recargo programado</span><span>${fareBreakdown.schedulingSurcharge.toLocaleString("es-CO")}</span></li>
              )}
              {fareBreakdown.minApplied && (
                <li className="text-xs text-amber-600">Se aplicó la tarifa mínima.</li>
              )}
              {fareBreakdown.convenience > 0 && (
                <li className="flex justify-between"><span>Conveniencia</span><span>${fareBreakdown.convenience.toLocaleString("es-CO")}</span></li>
              )}
            </ul>
            <div className="mt-3 pt-3 border-t border-slate-200 space-y-1 text-sm text-slate-600">
              <div className="flex justify-between">
                <span>Valor Conductor</span>
                <span>${fareBreakdown.totalConductor.toLocaleString("es-CO")}</span>
              </div>
              <div className="flex justify-between">
                <span>Valor Cliente (+25%)</span>
                <span>${fareBreakdown.valorCliente.toLocaleString("es-CO")}</span>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-slate-200 flex justify-between text-lg font-semibold text-primary">
              <span>Total a cobrar</span>
              <span>${fareBreakdown.totalConductor.toLocaleString("es-CO")}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500 italic">
              Cobro inicial estimado. Puede ajustarse al finalizar el servicio según la ruta real.
            </p>
            <div className="mt-2 flex justify-between text-sm text-slate-600">
              <span>Rango estimado</span>
              <span>
                ${fareBreakdown.totalConductor.toLocaleString("es-CO")} – $
                {fare.toLocaleString("es-CO")}
              </span>
            </div>
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
