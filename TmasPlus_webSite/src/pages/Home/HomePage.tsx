import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { classNames } from "@/utils/classNames";
import { FaAndroid, FaApple } from "react-icons/fa";
import logo from "@/assets/Logo-v3.png";
import { motion } from "framer-motion";
import { useState } from "react";
import { CreateCategoryModal } from "./CreateCategoryModal";

export default function HomePage() {
    const [openCategory, setOpenCategory] = useState(false);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Tipos de servicios</h1>
        <Button onClick={() => setOpenCategory(true)}>Crear nueva categoría</Button>
      </div>

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
        onClose={() => setOpenCategory(false)}
        onSubmit={(data) => {
            console.log("Nueva categoría:", data);
            setOpenCategory(false);
        }}
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
