import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import defaultAvatar from "@/assets/react.svg";

export default function ProfilePage() {
  // 🔹 Datos simulados (mock temporal)
  const [formData, setFormData] = useState({
    firstName: "Carlos",
    lastName: "Ruiz",
    email: "carlos@empresa.com",
    mobile: "3101234567",
    city: "Bogotá",
    docType: "CC",
    verifyId: "1234567890",
    bussinesName: "T+ Solutions",
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSecurityCheck = async () => {
    setIsVerifying(true);
    await new Promise((r) => setTimeout(r, 1500)); // Simulación de carga
    setIsVerifying(false);
    alert("Verificación de antecedentes completada exitosamente.");
  };

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise((r) => setTimeout(r, 1200)); // Simulación de guardado
    setIsSaving(false);
    alert("Perfil actualizado correctamente.");
  };

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-8"
      >
        {/* Header */}
        <div className="flex items-center gap-6 mb-8">
          <img
            src={defaultAvatar}
            alt="Foto de perfil"
            className="w-28 h-28 rounded-full border border-slate-300 shadow-sm"
          />
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              Perfil del Usuario
            </h1>
            <p className="text-slate-500 text-sm">
              Actualiza tu información personal y verifica tus datos.
            </p>
          </div>
        </div>

        {/* Formulario */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ProfileInput
            label="Primer Nombre"
            name="firstName"
            value={formData.firstName}
            onChange={handleChange}
          />
          <ProfileInput
            label="Apellidos"
            name="lastName"
            value={formData.lastName}
            onChange={handleChange}
          />
          <ProfileInput
            label="Correo Electrónico"
            name="email"
            type="email"
            value={formData.email}
            onChange={handleChange}
          />
          <ProfileInput
            label="Celular"
            name="mobile"
            value={formData.mobile}
            onChange={handleChange}
          />
          <ProfileInput
            label="Ciudad"
            name="city"
            value={formData.city}
            onChange={handleChange}
          />
          <ProfileInput
            label="Tipo de Documento"
            name="docType"
            value={formData.docType}
            onChange={handleChange}
          />
          <ProfileInput
            label="Número de Documento"
            name="verifyId"
            value={formData.verifyId}
            onChange={handleChange}
          />
          <ProfileInput
            label="Empresa / Razón Social"
            name="bussinesName"
            value={formData.bussinesName}
            onChange={handleChange}
          />
        </div>

        {/* Acciones */}
        <div className="flex flex-col sm:flex-row justify-end gap-4 mt-8">
          <Button
            variant="secondary"
            onClick={handleSecurityCheck}
            disabled={isVerifying}
          >
            {isVerifying ? "Verificando..." : "Verificar Seguridad"}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Guardando..." : "Guardar Cambios"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ProfileInput({
  label,
  name,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <label className="block text-slate-700 text-sm font-medium mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
      />
    </div>
  );
}
