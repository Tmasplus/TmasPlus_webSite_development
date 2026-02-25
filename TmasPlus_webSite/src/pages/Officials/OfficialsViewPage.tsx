import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";
import SubUserCard from "./SubUserCard";

export default function OfficialsViewPage() {
  // 🔹 Datos simulados
  const [subusers, setSubusers] = useState([
    {
      id: "USR001",
      name: "Carlos Ruiz",
      email: "carlos@empresa.com",
      inTurn: true,
      password: "123456",
    },
    {
      id: "USR002",
      name: "Laura Gómez",
      email: "laura@empresa.com",
      inTurn: false,
      password: "abcdef",
    },
    {
      id: "USR003",
      name: "Andrés Pérez",
      email: "andres@empresa.com",
      inTurn: true,
      password: "treas2025",
    },
  ]);

  const handleDelete = (id: string) => {
    setSubusers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleChangePassword = (id: string, newPassword: string) => {
    setSubusers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, password: newPassword } : s))
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Funcionarios de la empresa
        </h1>
        <Button onClick={() => alert("Agregar funcionario (pendiente)")}>
          Añadir funcionario
        </Button>
      </div>

      {subusers.length > 0 ? (
        <motion.div
          layout
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {subusers.map((user) => (
            <SubUserCard
              key={user.id}
              subuser={user}
              onDelete={handleDelete}
              onChangePassword={handleChangePassword}
            />
          ))}
        </motion.div>
      ) : (
        <Card className="p-6 text-center text-slate-500">
          No hay funcionarios registrados.
        </Card>
      )}
    </div>
  );
}
