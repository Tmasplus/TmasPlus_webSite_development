import { useState } from "react";
import { motion } from "framer-motion";
import { FaEye, FaEyeSlash, FaEdit, FaTrash } from "react-icons/fa";
import defaultAvatar from "@/assets/react.svg";
import { Button } from "@/components/ui/Button";

export default function SubUserCard({
  subuser,
  onDelete,
  onChangePassword,
}: {
  subuser: {
    id: string;
    name: string;
    email: string;
    inTurn: boolean;
    password: string;
  };
  onDelete: (id: string) => void;
  onChangePassword: (id: string, newPassword: string) => void;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [newPassword, setNewPassword] = useState("");

  const togglePassword = () => setShowPassword(!showPassword);

  const handleChangePassword = () => {
    if (newPassword.trim().length < 4) {
      alert("La nueva contraseña debe tener al menos 4 caracteres.");
      return;
    }
    onChangePassword(subuser.id, newPassword);
    setNewPassword("");
    setIsEditing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-200 rounded-2xl p-5 shadow-md hover:shadow-lg transition-all relative"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <img
            src={defaultAvatar}
            alt={subuser.name}
            className="w-14 h-14 rounded-full border border-slate-300"
          />
          <div>
            <h3 className="font-semibold text-slate-800">{subuser.name}</h3>
            <p className="text-sm text-slate-500">{subuser.email}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsEditing(!isEditing)}
            className="text-yellow-600 hover:text-yellow-700"
            title="Editar contraseña"
          >
            <FaEdit />
          </button>
          <button
            onClick={() => alert("¿Seguro de eliminar este funcionaro?")} // onDelete(subuser.id)
            className="text-red-600 hover:text-red-700"
            title="Eliminar funcionario"
          >
            <FaTrash />
          </button>
        </div>
      </div>

      {/* Estado */}
      <div className="flex items-center mb-2">
        <div
          className={`w-3 h-3 rounded-full mr-2 ${
            subuser.inTurn ? "bg-green-500" : "bg-red-500"
          }`}
        ></div>
        <p className="text-sm text-slate-600">
          {subuser.inTurn ? "Activo" : "Inactivo"}
        </p>
      </div>

      {/* Contraseña */}
      <div className="relative mt-2">
        <p className="text-sm text-slate-600">
          Contraseña:{" "}
          <span className="font-mono">
            {showPassword ? subuser.password : "••••••••"}
          </span>
        </p>
        <button
          onClick={togglePassword}
          className="absolute right-0 top-0 text-slate-400 hover:text-slate-600"
        >
          {showPassword ? <FaEyeSlash /> : <FaEye />}
        </button>
      </div>

      {/* Edición */}
      {isEditing && (
        <div className="mt-3 space-y-2">
          <input
            type="password"
            value={newPassword}
            placeholder="Nueva contraseña"
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full border border-slate-300 rounded-lg p-2 text-sm"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              Cancelar
            </Button>
            <Button onClick={handleChangePassword}>Guardar</Button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
