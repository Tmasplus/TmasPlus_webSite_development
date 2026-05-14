import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type {
  SecondaryUser,
  UpdateUserInput,
} from "@/services/usersSecondary.service";

type Props = {
  open: boolean;
  user: SecondaryUser | null;
  onClose: () => void;
  onSave: (id: string, payload: UpdateUserInput) => Promise<void>;
};

export default function UserEditModal({ open, user, onClose, onSave }: Props) {
  const [form, setForm] = useState<UpdateUserInput>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setForm({
        first_name: user.first_name || "",
        last_name: user.last_name || "",
        email: user.email || "",
        mobile: user.mobile || "",
        user_type: user.user_type || "",
        city: user.city || "",
      });
      setError(null);
    }
  }, [user]);

  if (!open || !user) return null;

  const handleChange =
    (key: keyof UpdateUserInput) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave(user.id, form);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Editar usuario
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-1">{user.id}</p>
          </div>
          {user.profile_image && (
            <img
              src={user.profile_image}
              alt="avatar"
              className="w-12 h-12 rounded-full object-cover border border-slate-200"
            />
          )}
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-slate-600">Nombre</span>
            <input
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg"
              value={form.first_name || ""}
              onChange={handleChange("first_name")}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Apellido</span>
            <input
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg"
              value={form.last_name || ""}
              onChange={handleChange("last_name")}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Email</span>
            <input
              type="email"
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg"
              value={form.email || ""}
              onChange={handleChange("email")}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Teléfono</span>
            <input
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg"
              value={form.mobile || ""}
              onChange={handleChange("mobile")}
            />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Tipo</span>
            <select
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg bg-white"
              value={form.user_type || ""}
              onChange={handleChange("user_type")}
            >
              <option value="">—</option>
              <option value="customer">customer</option>
              <option value="driver">driver</option>
              <option value="company">company</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Ciudad</span>
            <input
              className="mt-1 w-full p-2 border border-slate-300 rounded-lg"
              value={form.city || ""}
              onChange={handleChange("city")}
            />
          </label>

          {error && (
            <div className="col-span-2 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm">
              {error}
            </div>
          )}

          <div className="col-span-2 flex justify-end gap-2 mt-4">
            <Button variant="secondary" type="button" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
