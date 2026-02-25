import React, { useState } from "react";
import { FloatingSelect, FloatingInput } from "@/components/ui/FloatingField";
import { Button } from "@/components/ui/Button";
import { Eye, EyeOff } from "lucide-react";
import { motion } from "framer-motion";
import { Page } from "@/components/layout/Page";
import { CreateEmployeeForm } from "./CreateEmployeeForm";

export default function ShiftChangerPage() {
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleStartShift = () => {
    console.log("Iniciar turno:", selectedEmployee, password);
  };

  const handleEndShift = () => {
    console.log("Cerrar turno:", selectedEmployee, password);
  };

  const handleCreateEmployee = () => {
    alert("Crear empleado (modal próximamente)");
  };

  return (
    <Page
    title="Cambiar Turno"
    >
        <div className="p-6 flex flex-col items-center">
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-2xl shadow-lg p-8"
        >
            <h2 className="text-xl font-medium text-center text-slate-800 mb-6">
            Iniciar Turno en
            </h2>

            <form className="space-y-6">
            <FloatingSelect
                id="empleado"
                label="Empleado"
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
            >
                <option value="">Seleccionar empleado</option>
                <option value="juan">Juan Pérez</option>
                <option value="maria">María Gómez</option>
                <option value="carlos">Carlos Ruiz</option>
            </FloatingSelect>

            <div className="relative">
                <FloatingInput
                id="password"
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                />
                <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-slate-500 hover:text-primary-dark"
                >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>

            <div className="flex gap-3 justify-between pt-3">
                <Button
                type="button"
                onClick={handleStartShift}
                className="flex-1 py-2"
                disabled={!selectedEmployee || !password}
                >
                Iniciar Turno
                </Button>
                <Button
                type="button"
                variant="secondary"
                onClick={handleEndShift}
                className="flex-1 py-2"
                >
                Cerrar Turno
                </Button>
            </div>

            <div className="pt-4">
                {/* Si está creando un empleado, mostramos el formulario */}
                {creating ? (
                <CreateEmployeeForm
                    onSave={(data) => {
                    console.log("Nuevo empleado:", data);
                    setCreating(false);
                    }}
                    onCancel={() => setCreating(false)}
                />
                ) : (
                <div className="pt-4">
                    <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreating(true)}
                    className="w-full py-2"
                    >
                    Crear Empleados
                    </Button>
                </div>
                )}
            </div>

            <p className="text-center text-sm text-slate-500 mt-2">
                Por favor crea funcionarios.
            </p>
            </form>
        </motion.div>
        </div>
    </Page>
  );
}
