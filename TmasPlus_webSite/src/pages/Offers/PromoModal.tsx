import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { motion } from "framer-motion";

export default function PromoModal({
  open,
  onClose,
  onSave,
  editPromo,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (promo: any) => void;
  editPromo: any;
}) {
  const [promo, setPromo] = useState({
    promo_name: "",
    promo_code: "",
    promo_description: "",
    max_promo_discount_value: 0,
    min_order: 0,
    promo_usage_limit: "",
    promo_validity: "",
  });

  useEffect(() => {
    if (editPromo) {
      setPromo(editPromo);
    } else {
      setPromo({
        promo_name: "",
        promo_code: "",
        promo_description: "",
        max_promo_discount_value: 0,
        min_order: 0,
        promo_usage_limit: "",
        promo_validity: "",
      });
    }
  }, [editPromo]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setPromo((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!promo.promo_name || !promo.promo_code) {
      alert("Por favor completa al menos el nombre y el código.");
      return;
    }
    onSave(promo);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg"
      >
        <h2 className="text-xl font-semibold mb-4 text-slate-800">
          {editPromo ? "Editar Promoción" : "Nueva Promoción"}
        </h2>

        <div className="space-y-3">
          <input
            type="text"
            name="promo_name"
            placeholder="Nombre de la promoción"
            value={promo.promo_name}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <input
            type="text"
            name="promo_code"
            placeholder="Código promocional"
            value={promo.promo_code}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <textarea
            name="promo_description"
            placeholder="Descripción"
            value={promo.promo_description}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <input
            type="number"
            name="max_promo_discount_value"
            placeholder="Valor máximo del descuento"
            value={promo.max_promo_discount_value}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <input
            type="number"
            name="min_order"
            placeholder="Pedido mínimo"
            value={promo.min_order}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <input
            type="text"
            name="promo_usage_limit"
            placeholder="Límite de uso (ej: 3 por usuario)"
            value={promo.promo_usage_limit}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
          <input
            type="date"
            name="promo_validity"
            value={promo.promo_validity}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-lg p-2"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit}>
            {editPromo ? "Guardar cambios" : "Crear"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
