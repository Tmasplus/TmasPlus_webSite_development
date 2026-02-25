import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";

export default function AddComplainForm() {
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !email || !firstName) {
      alert("Por favor completa todos los campos.");
      return;
    }
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setDescription("");
      setEmail("");
      setFirstName("");
    }, 2000);
  };

  return (
    <div className="p-6">
      <Card className="p-6 max-w-lg mx-auto">
        <h1 className="text-2xl font-semibold text-slate-900 mb-4">
          Añadir Nueva Queja
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-600 mb-1">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              placeholder="Describe tu queja..."
              className="w-full border border-slate-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ejemplo@correo.com"
              className="w-full border border-slate-300 rounded-lg p-2"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-600 mb-1">Nombre</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Tu nombre"
              className="w-full border border-slate-300 rounded-lg p-2"
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit">Enviar Queja</Button>
          </div>
        </form>
      </Card>

      {/* Modal de éxito */}
      {success && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl p-6 text-center max-w-sm"
          >
            <h2 className="text-xl font-semibold text-slate-800 mb-2">
              ¡Queja enviada!
            </h2>
            <p className="text-slate-600 mb-4">
              Tu queja fue registrada exitosamente.
            </p>
            <Button onClick={() => setSuccess(false)}>Cerrar</Button>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
