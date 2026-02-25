import React, { useState } from "react";
import { FloatingInput } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

type Props = {
  onSave: (data: { nombre: string; correo: string; password: string }) => void;
  onCancel: () => void;
};

export const CreateEmployeeForm: React.FC<Props> = ({ onSave, onCancel }) => {
  const [form, setForm] = useState({
    nombre: "",
    correo: "",
    password: "",
  });

  const update = (k: keyof typeof form, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
      className="bg-white/80 backdrop-blur-md rounded-2xl shadow-lg p-6 w-full max-w-md"
    >
      <h2 className="text-xl font-semibold text-slate-800 mb-6 text-center">
        Crear Nuevo Empleado
      </h2>

      <form onSubmit={handleSubmit} className="space-y-5">
        <FloatingInput
          id="nombre"
          label="Nombre"
          value={form.nombre}
          onChange={(e) => update("nombre", e.target.value)}
        />
        <FloatingInput
          id="correo"
          label="Correo Electrónico"
          type="email"
          value={form.correo}
          onChange={(e) => update("correo", e.target.value)}
        />
        <FloatingInput
          id="password"
          label="Contraseña"
          type="password"
          value={form.password}
          onChange={(e) => update("password", e.target.value)}
        />

        <div className="flex gap-3 justify-end pt-3">
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit">Guardar Empleado</Button>
        </div>
      </form>
    </motion.div>
  );
};
