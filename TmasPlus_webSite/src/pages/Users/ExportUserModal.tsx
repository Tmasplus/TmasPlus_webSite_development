import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (userType: string) => void;
  userType: string;
}

export default function ExportUserModal({
  isOpen,
  onClose,
  onExport,
  userType,
}: ExportModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md"
      >
        <h2 className="text-xl font-semibold mb-3 text-slate-800">
          Exportar usuarios
        </h2>
        <p className="text-slate-600 mb-4">
          Selecciona el tipo de usuario que deseas exportar:
        </p>

        <div className="flex flex-col gap-2">
          <Button onClick={() => onExport("customer")}>Clientes</Button>

          {userType !== "company" && (
            <>
              <Button
                variant="secondary"
                onClick={() => onExport("driver")}
              >
                Conductores
              </Button>
              <Button
                variant="secondary"
                onClick={() => onExport("company")}
              >
                Empresas
              </Button>
            </>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={onClose}
          className="mt-5 w-full"
        >
          Cancelar
        </Button>
      </motion.div>
    </div>
  );
}
