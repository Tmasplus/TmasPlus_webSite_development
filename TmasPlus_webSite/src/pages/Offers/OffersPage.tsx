import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { motion } from "framer-motion";
import logo from "@/assets/react.svg";
import PromoModal from "./PromoModal";

export default function OffersPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editPromo, setEditPromo] = useState<any>(null);

  // 🔹 Datos simulados
  const [promos, setPromos] = useState([
    {
      id: "P001",
      promo_name: "Descuento de Bienvenida",
      promo_code: "BIENVENIDO10",
      promo_description: "Obtén un 10% de descuento en tu primer viaje.",
      max_promo_discount_value: 10000,
      min_order: 30000,
      promo_usage_limit: "1 vez por usuario",
      promo_validity: "2025-12-31",
      createdAt: "2025-10-10",
    },
    {
      id: "P002",
      promo_name: "Semana del Cliente",
      promo_code: "CLIENTE25",
      promo_description: "25% de descuento en todos los servicios Premium.",
      max_promo_discount_value: 20000,
      min_order: 40000,
      promo_usage_limit: "3 usos por usuario",
      promo_validity: "2025-11-15",
      createdAt: "2025-10-15",
    },
  ]);

  // 🔹 Crear o editar
  const handleSavePromo = (promo: any) => {
    if (editPromo) {
      setPromos((prev) =>
        prev.map((p) => (p.id === promo.id ? promo : p))
      );
    } else {
      setPromos((prev) => [...prev, { ...promo, id: Date.now().toString() }]);
    }
    setIsModalOpen(false);
    setEditPromo(null);
  };

  const handleDeletePromo = (id: string) => {
    if (window.confirm("¿Seguro que deseas eliminar esta promoción?")) {
      setPromos((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const handleEditPromo = (promo: any) => {
    setEditPromo(promo);
    setIsModalOpen(true);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Ofertas y Promociones</h1>
        <Button onClick={() => setIsModalOpen(true)}>Crear Nueva Promo</Button>
      </div>

      {promos.length === 0 ? (
        <Card className="p-6 text-center text-slate-500">
          No hay promociones disponibles.
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {promos.map((promo) => (
            <PromoCard
              key={promo.id}
              promo={promo}
              onEdit={() => handleEditPromo(promo)}
              onDelete={() => handleDeletePromo(promo.id)}
            />
          ))}
        </div>
      )}

      <PromoModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSavePromo}
        editPromo={editPromo}
      />
    </div>
  );
}

function PromoCard({
  promo,
  onEdit,
  onDelete,
}: {
  promo: any;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-CO");
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl shadow-md border border-slate-200 p-5 flex flex-col items-center text-center"
    >
      <img
        src={logo}
        alt="Promo Logo"
        className="w-28 h-28 object-contain mb-3"
      />
      <h2 className="text-lg font-semibold text-slate-800 mb-1">
        {promo.promo_name}
      </h2>
      <div className="bg-primary text-white px-3 py-1 rounded-lg font-medium mb-2">
        Código: {promo.promo_code}
      </div>
      <p className="text-slate-600 text-sm mb-2">{promo.promo_description}</p>
      <p className="text-lg font-bold text-slate-900">
        ${promo.max_promo_discount_value.toLocaleString()}
      </p>
      <p className="text-slate-500 text-sm">
        Pedido mínimo: ${promo.min_order.toLocaleString()}
      </p>
      <p className="text-slate-500 text-sm">
        Límite: {promo.promo_usage_limit}
      </p>
      <p className="text-slate-500 text-sm mb-4">
        Válido hasta: {formatDate(promo.promo_validity)}
      </p>
      <div className="flex gap-2 mt-auto">
        <Button variant="secondary" onClick={onEdit}>
          Editar
        </Button>
        <Button onClick={onDelete}>Eliminar</Button>
      </div>
    </motion.div>
  );
}
