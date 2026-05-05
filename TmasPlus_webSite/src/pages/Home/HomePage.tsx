import { Button } from "@/components/ui/Button";
import { classNames } from "@/utils/classNames";
import { FaAndroid, FaApple, FaPen, FaTrash } from "react-icons/fa";
import logo from "@/assets/Logo-v3.png";
import { motion } from "framer-motion";
import { useEffect, useState, useCallback } from "react";
import { CreateCategoryModal } from "./CreateCategoryModal";
import { CarTypesService } from "@/services/carTypes.service";
import type { CarTypeRow } from "@/config/database.types";

export default function HomePage() {
  const [openCategory, setOpenCategory] = useState(false);
  const [categories, setCategories] = useState<CarTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<CarTypeRow | null>(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await CarTypesService.getAll();
      setCategories(data);
    } catch (error) {
      console.error('Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  function handleEdit(cat: CarTypeRow) {
    setEditItem(cat);
    setOpenCategory(true);
  }

  async function handleDelete(cat: CarTypeRow) {
    if (!confirm(`¿Eliminar "${cat.name}"?`)) return;
    await CarTypesService.remove(cat.id);
    fetchCategories();
  }

  function handleCloseModal() {
    setOpenCategory(false);
    setEditItem(null);
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tipos de servicios</h1>
        <Button onClick={() => { setEditItem(null); setOpenCategory(true); }}>
          Crear nueva categoría
        </Button>
      </div>

      {/* Category grid */}
      {loading ? (
        <p className="text-slate-500 text-center py-12">Cargando categorías...</p>
      ) : categories.length === 0 ? (
        <p className="text-slate-400 text-center py-12">No hay categorías creadas aún.</p>
      ) : (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
          {categories.map((cat) => (
            <motion.div
              key={cat.id}
              whileHover={{ y: -3 }}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
            >
              {/* Image */}
              <div className="h-36 bg-slate-100 flex items-center justify-center">
                {cat.image ? (
                  <img src={cat.image} alt={cat.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-slate-400 text-sm">Sin imagen</span>
                )}
              </div>

              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-800 truncate">{cat.name}</h3>
                  <span
                    className={classNames(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      cat.is_active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {cat.is_active ? "Activa" : "Inactiva"}
                  </span>
                </div>

                {cat.description && (
                  <p className="text-xs text-slate-500 truncate">{cat.description}</p>
                )}

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Base: <b className="text-slate-700">${cat.base_price.toLocaleString()}</b></span>
                  <span>Min Fare: <b className="text-slate-700">${cat.min_fare.toLocaleString()}</b></span>
                  <span>Distancia: <b className="text-slate-700">${cat.price_per_km.toLocaleString()}</b></span>
                  <span>Hora: <b className="text-slate-700">${cat.rate_per_hour.toLocaleString()}</b></span>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleEdit(cat)}
                    className="flex-1 flex items-center justify-center gap-1 text-sm text-blue-600 hover:bg-blue-50 rounded-lg py-1.5 transition"
                  >
                    <FaPen className="text-xs" /> Editar
                  </button>
                  <button
                    onClick={() => handleDelete(cat)}
                    className="flex-1 flex items-center justify-center gap-1 text-sm text-red-600 hover:bg-red-50 rounded-lg py-1.5 transition"
                  >
                    <FaTrash className="text-xs" /> Eliminar
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </section>
      )}

      {/* Hero */}
      <section className="flex flex-col items-center text-center">
        <motion.img
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          src={logo}
          alt="T+"
          className="w-28 h-28 rounded-full shadow-xl bg-white p-3"
        />
        <h2 className="mt-5 text-xl md:text-2xl font-semibold text-slate-800 tracking-wide">
          SOLUCIONES TECNOLÓGICAS DE MOVILIDAD
        </h2>
        <p className="mt-1 text-slate-500">
          Te invitamos a ser parte de este cambio.
        </p>
      </section>

      {/* Tarjetas */}
      <section className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        <PlatformCard
          icon={<FaAndroid />}
          title="Android"
          subtitle="Disponible para dispositivos Android"
          onClick={() => alert("Ir a Google Play")}
        />
        <PlatformCard
          icon={<FaApple />}
          title="App Store"
          subtitle="Disponible para iPhone y iPad"
          onClick={() => alert("Ir a App Store")}
        />
      </section>

      <CreateCategoryModal
        open={openCategory}
        onClose={handleCloseModal}
        onSaved={fetchCategories}
        editData={editItem}
      />

      {/* Footer */}
      <footer className="mt-12 text-center text-sm text-slate-500">
        Copyright © {new Date().getFullYear()} T+PLUS — Todos los derechos reservados.
      </footer>
    </div>
  );
}

function PlatformCard({
  icon,
  title,
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onClick?: () => void;
}) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      className={classNames(
        "w-full text-left bg-white rounded-2xl border border-slate-200 shadow-sm",
        "px-6 py-8 transition hover:shadow-lg"
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl grid place-items-center bg-primary/10 text-primary-dark text-2xl">
          {icon}
        </div>
        <div>
          <div className="text-slate-800 font-medium">{title}</div>
          <div className="text-slate-500 text-sm">{subtitle}</div>
        </div>
      </div>
    </motion.button>
  );
}
