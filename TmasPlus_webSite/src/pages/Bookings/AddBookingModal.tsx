import React, { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FloatingInput, FloatingSelect, Checkbox } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { classNames } from "@/utils/classNames";
import { FaCarSide, FaShuttleVan, FaMotorcycle } from "react-icons/fa";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => void; // ajusta al tipo real
};

type ReservaTipo = "inmediato" | "programado";
type RecorridoTipo = "solo_ida" | "ida_y_regreso" | "solo_ida_checkout";
type VehiculoTipo = "auto" | "moto" | "van";

export const AddBookingModal: React.FC<Props> = ({ open, onClose, onSubmit }) => {
  const [form, setForm] = useState({
    usuarioId: "",
    vehiculo: "" as VehiculoTipo | "",
    origen: "",
    destino: "",
    tipoReserva: "inmediato" as ReservaTipo,
    fechaProgramada: "", // datetime-local
    tipoRecorrido: "solo_ida" as RecorridoTipo,
    horasEspera: "", // solo si ida_y_regreso
    metodoPago: "efectivo",
    observaciones: "",
    addObservaciones: false,
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  const vehiculos = useMemo(
    () => ([
      { id: "auto", icon: <FaCarSide />,  label: "Auto" },
      { id: "moto", icon: <FaMotorcycle />, label: "Moto" },
      { id: "van",  icon: <FaShuttleVan />, label: "Van" },
    ] as const),
    []
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Añadir Reserva"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" onClick={handleSubmit}>Solicitar</Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* fila 1: usuario + tipo de vehículo (iconos) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Usuario (en tu app real será un select o autocomplete) */}
          <FloatingSelect
            id="usuario"
            label="Seleccionar usuario"
            value={form.usuarioId}
            onChange={(e) => update("usuarioId", e.target.value)}
          >
            <option value="U-001">Cliente 001</option>
            <option value="U-002">Cliente 002</option>
          </FloatingSelect>

          {/* Vehículo como tarjetas con animación */}
          <div className="flex flex-col">
            <p className="text-xs text-slate-500 mb-2">Tipo de vehículo</p>
            <div className="flex items-stretch gap-3">
              {vehiculos.map((v) => {
                const active = form.vehiculo === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => update("vehiculo", v.id)}
                    className={classNames(
                      "flex-1 select-none rounded-xl border px-4 py-3 grid place-items-center gap-1",
                      "transition-all duration-150",
                      active
                        ? "border-primary ring-2 ring-primary/50 scale-[1.02] bg-primary/5"
                        : "border-slate-300 hover:border-primary/60 hover:bg-primary/5"
                    )}
                  >
                    <span
                      className={classNames(
                        "text-2xl",
                        active ? "text-primary-dark" : "text-slate-600"
                      )}
                    >
                      {v.icon}
                    </span>
                    <span
                      className={classNames(
                        "text-xs",
                        active ? "text-primary-dark font-medium" : "text-slate-600"
                      )}
                    >
                      {v.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* fila 2: origen / destino */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FloatingInput
            id="origen"
            label="Dirección de origen"
            value={form.origen}
            onChange={(e) => update("origen", e.target.value)}
          />
          <FloatingInput
            id="destino"
            label="Dirección de destino"
            value={form.destino}
            onChange={(e) => update("destino", e.target.value)}
          />
        </div>

        {/* fila 3: tipo reserva / tipo recorrido */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Tipo de reserva */}
          <FloatingSelect
            id="tipoReserva"
            label="Tipo de reserva"
            value={form.tipoReserva}
            onChange={(e) => update("tipoReserva", e.target.value as ReservaTipo)}
          >
            <option value="inmediato">Inmediato</option>
            <option value="programado">Programado</option>
          </FloatingSelect>

          {/* Tipo de recorrido */}
          <FloatingSelect
            id="tipoRecorrido"
            label="Tipo de recorrido"
            value={form.tipoRecorrido}
            onChange={(e) => update("tipoRecorrido", e.target.value as RecorridoTipo)}
          >
            <option value="solo_ida">Solo ida</option>
            <option value="ida_y_regreso">Ida y regreso</option>
            <option value="solo_ida_checkout">Solo ida (checkout)</option>
          </FloatingSelect>
        </div>

        {/* Condicional: fecha programada */}
        {form.tipoReserva === "programado" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="fechaProgramada"
              label="Fecha y hora"
              type="datetime-local"
              value={form.fechaProgramada}
              onChange={(e) => update("fechaProgramada", e.target.value)}
            />
          </div>
        )}

        {/* Condicional: horas espera para ida y regreso */}
        {form.tipoRecorrido === "ida_y_regreso" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FloatingInput
              id="horasEspera"
              label="Horas de espera (regreso)"
              type="number"
              min={0}
              step={0.5}
              value={form.horasEspera}
              onChange={(e) => update("horasEspera", e.target.value)}
            />
          </div>
        )}

        {/* fila 4: método de pago + observaciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FloatingSelect
            id="metodoPago"
            label="Método de pago"
            value={form.metodoPago}
            onChange={(e) => update("metodoPago", e.target.value)}
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="transferencia">Transferencia</option>
          </FloatingSelect>

          <div className="flex items-end">
            <Checkbox
              checked={form.addObservaciones}
              onChange={(e) => update("addObservaciones", e.target.checked)}
              label="Observaciones"
            />
          </div>
        </div>

        {form.addObservaciones && (
          <FloatingInput
            id="observaciones"
            label="Observaciones"
            value={form.observaciones}
            onChange={(e) => update("observaciones", e.target.value)}
          />
        )}
      </form>
    </Modal>
  );
};

export default AddBookingModal;
