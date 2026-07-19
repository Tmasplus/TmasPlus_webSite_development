import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { Page } from "@/components/layout/Page";
import { useAuth } from "@/hooks/useAuth";
import { UsersService } from "@/services/users.service";
import { toast } from "@/utils/toast";
import defaultAvatar from "@/assets/perfil.png";

type ProfileForm = {
  first_name: string;
  last_name: string;
  mobile: string;
  city: string;
  license_number: string;
};

const emptyForm: ProfileForm = {
  first_name: "",
  last_name: "",
  mobile: "",
  city: "",
  license_number: "",
};

export default function ProfilePage() {
  const { profile, refreshProfile } = useAuth();
  const [formData, setFormData] = useState<ProfileForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setFormData({
      first_name: profile.first_name || "",
      last_name: profile.last_name || "",
      mobile: profile.mobile || "",
      city: profile.city || "",
      license_number: profile.license_number || "",
    });
  }, [profile]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!formData.first_name.trim() || !formData.last_name.trim()) {
      toast.error("El nombre y los apellidos son obligatorios.");
      return;
    }

    setIsSaving(true);
    try {
      await UsersService.updateUser(profile.id, {
        first_name: formData.first_name.trim(),
        last_name: formData.last_name.trim(),
        mobile: formData.mobile.trim() || null,
        city: formData.city.trim() || null,
        license_number: formData.license_number.trim() || null,
      });
      await refreshProfile();
      toast.success("Perfil actualizado correctamente.");
    } catch (error: any) {
      toast.error(error?.message || "No se pudo actualizar el perfil.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!profile) { return <Page title="Mi perfil"><div className="p-6 text-slate-500">Cargando perfil...</div></Page>; }

  return (
    <Page title="Mi perfil">
      <motion.form
        onSubmit={handleSave}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-8"
      >
        <div className="flex items-center gap-6 mb-8">
          <img src={profile.profile_image || defaultAvatar} alt="Foto de perfil" className="w-28 h-28 rounded-full border border-slate-300 shadow-sm object-cover" />
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">{profile.first_name} {profile.last_name}</h2>
            <p className="text-slate-500 text-sm">{profile.user_type || ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <ProfileInput label="Nombre" name="first_name" value={formData.first_name} onChange={handleChange} required />
          <ProfileInput label="Apellidos" name="last_name" value={formData.last_name} onChange={handleChange} required />
          <ProfileInput label="Correo electrónico" name="email" type="email" value={profile.email || ""} readOnly />
          <ProfileInput label="Celular" name="mobile" value={formData.mobile} onChange={handleChange} />
          <ProfileInput label="Ciudad" name="city" value={formData.city} onChange={handleChange} />
          <ProfileInput label="Número de documento" name="license_number" value={formData.license_number} onChange={handleChange} />
          <ProfileInput label="Tipo de usuario" name="user_type" value={profile.user_type || ""} readOnly />
          <ProfileInput label="Fecha y hora de registro" name="created_at" value={profile.created_at ? new Date(profile.created_at).toLocaleString("es-CO") : "—"} readOnly />
        </div>

        <div className="flex justify-end mt-8">
          <Button type="submit" disabled={isSaving}>{isSaving ? "Guardando..." : "Guardar cambios"}</Button>
        </div>
      </motion.form>
    </Page>
  );
}

function ProfileInput({ label, name, value, onChange, type = "text", readOnly = false, required = false }: {
  label: string;
  name: string;
  value: string;
  type?: string;
  readOnly?: boolean;
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return <div>
    <label className="block text-slate-700 text-sm font-medium mb-1">{label}</label>
    <input type={type} name={name} value={value} onChange={onChange} readOnly={readOnly} required={required}
      className={`w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition ${readOnly ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"}`} />
  </div>;
}
