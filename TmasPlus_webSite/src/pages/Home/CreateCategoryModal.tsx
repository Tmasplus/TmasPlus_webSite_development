import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { FloatingInput, FloatingSelect } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: any) => void;
};

export const CreateCategoryModal: React.FC<Props> = ({
  open,
  onClose,
  onSubmit,
}) => {
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    nombre: "",
    tarifaBase: "",
    tarifaMinima: "",
    tipoServicio: "",
    tarifaHora: "",
    tarifaDistancia: "",
    comisionConveniencia: "",
    tipoComision: "percentage",
    valorIntermunicipal: "",
    opcionInmediato: "",
    opcionProgramado: "",
    opcionAeroProg: "",
    opcionAeropuerto: "",
  });

  function update<K extends keyof typeof form>(key: K, val: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  function handleImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Crear Nueva Categoría de Servicio"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" onClick={handleSubmit}>
            Guardar Categoría
          </Button>
        </>
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-6 max-h-[80vh] overflow-y-auto pr-2"
      >
        {/* Imagen */}
        <div className="flex flex-col items-center text-center space-y-3">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="w-28 h-28 rounded-full bg-slate-100 border-2 border-slate-300 grid place-items-center overflow-hidden"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="object-cover w-full h-full"
              />
            ) : (
              <span className="text-slate-500 text-sm">Sin imagen</span>
            )}
          </motion.div>

          <label className="text-sm text-slate-600 font-medium">
            Imagen del tipo de vehículo
          </label>
          <input
            type="file"
            accept="image/*"
            onChange={handleImage}
            className="block w-full max-w-xs text-sm text-slate-600
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-semibold
                       file:bg-primary/10 file:text-primary-dark
                       hover:file:bg-primary/20"
          />
        </div>

        {/* Campos principales */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FloatingInput
            id="nombre"
            label="Nombre"
            value={form.nombre}
            onChange={(e) => update("nombre", e.target.value)}
          />
          <FloatingInput
            id="tarifaBase"
            label="Tarifa Base"
            type="number"
            value={form.tarifaBase}
            onChange={(e) => update("tarifaBase", e.target.value)}
          />

          <FloatingInput
            id="tarifaMinima"
            label="Tarifa Mínima"
            type="number"
            value={form.tarifaMinima}
            onChange={(e) => update("tarifaMinima", e.target.value)}
          />
          <FloatingInput
            id="tipoServicio"
            label="Tipo de Servicio"
            value={form.tipoServicio}
            onChange={(e) => update("tipoServicio", e.target.value)}
          />

          <FloatingInput
            id="tarifaHora"
            label="Tarifa por Hora"
            type="number"
            value={form.tarifaHora}
            onChange={(e) => update("tarifaHora", e.target.value)}
          />
          <FloatingInput
            id="tarifaDistancia"
            label="Tarifa por Unidad de Distancia"
            type="number"
            value={form.tarifaDistancia}
            onChange={(e) => update("tarifaDistancia", e.target.value)}
          />

          <FloatingInput
            id="comisionConveniencia"
            label="Comisión por Conveniencia"
            type="number"
            value={form.comisionConveniencia}
            onChange={(e) => update("comisionConveniencia", e.target.value)}
          />
          <FloatingSelect
            id="tipoComision"
            label="Tipo de Comisión"
            value={form.tipoComision}
            onChange={(e) => update("tipoComision", e.target.value)}
          >
            <option value="percentage">Porcentaje</option>
            <option value="fixed">Fija</option>
          </FloatingSelect>

          <FloatingInput
            id="valorIntermunicipal"
            label="Valor Intermunicipal"
            type="number"
            value={form.valorIntermunicipal}
            onChange={(e) => update("valorIntermunicipal", e.target.value)}
          />
          <FloatingInput
            id="opcionInmediato"
            label="Opción Inmediato"
            value={form.opcionInmediato}
            onChange={(e) => update("opcionInmediato", e.target.value)}
          />

          <FloatingInput
            id="opcionProgramado"
            label="Opción Programado"
            value={form.opcionProgramado}
            onChange={(e) => update("opcionProgramado", e.target.value)}
          />
          <FloatingInput
            id="opcionAeroProg"
            label="Opción Aeropuerto y Programado"
            value={form.opcionAeroProg}
            onChange={(e) => update("opcionAeroProg", e.target.value)}
          />

          <FloatingInput
            id="opcionAeropuerto"
            label="Opción Aeropuerto"
            value={form.opcionAeropuerto}
            onChange={(e) => update("opcionAeropuerto", e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
};
