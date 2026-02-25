import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";

export default function SettingsPage() {
  // 🔹 Mock de datos
  const [settings, setSettings] = useState({
    CompanyName: "T+ Plus S.A.S",
    CompanyAddress: "Cra 15 #100-10, Bogotá",
    CompanyPhone: "6015554321",
    contact_email: "contacto@tplus.com",
    CompanyWebsite: "www.tplus.com",
    appName: "T+ Driver",
    versionWeb: "3.2.1",
    symbol: "$",
    driverRadius: "5 km",
    FacebookHandle: "https://facebook.com/tplus",
    InstagramHandle: "https://instagram.com/tplus",
    TwitterHandle: "https://x.com/tplus",
    otp_secure: true,
    customMobileOTP: false,
    carApproval: true,
    panic: "1234567890",
  });

  const [section, setSection] = useState("company");

  const handleChange = (key: string, value: string | boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    alert("Configuraciones guardadas exitosamente ✅");
  };

  return (
    <div className="p-6">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="max-w-5xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-6"
      >
        <h1 className="text-2xl font-semibold text-slate-900 mb-6">
          Configuración General
        </h1>

        {/* Navegación de secciones */}
        <nav className="flex flex-wrap gap-2 mb-8">
          {[
            { key: "company", label: "Empresa" },
            { key: "app", label: "App" },
            { key: "social", label: "Redes" },
            { key: "security", label: "Seguridad" },
            { key: "other", label: "Otros" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                section === item.key
                  ? "bg-red_treas shadow-sm"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Contenido dinámico */}
        {section === "company" && (
          <SettingsSection title="Información de la Empresa">
            <InputRow
              label="Nombre de la Empresa"
              value={settings.CompanyName}
              onChange={(v) => handleChange("CompanyName", v)}
            />
            <InputRow
              label="Dirección"
              value={settings.CompanyAddress}
              onChange={(v) => handleChange("CompanyAddress", v)}
            />
            <InputRow
              label="Teléfono"
              value={settings.CompanyPhone}
              onChange={(v) => handleChange("CompanyPhone", v)}
            />
            <InputRow
              label="Correo Electrónico"
              value={settings.contact_email}
              onChange={(v) => handleChange("contact_email", v)}
            />
            <InputRow
              label="Sitio Web"
              value={settings.CompanyWebsite}
              onChange={(v) => handleChange("CompanyWebsite", v)}
            />
          </SettingsSection>
        )}

        {section === "app" && (
          <SettingsSection title="Configuraciones de la App">
            <InputRow
              label="Nombre de la App"
              value={settings.appName}
              onChange={(v) => handleChange("appName", v)}
            />
            <InputRow
              label="Versión Web"
              value={settings.versionWeb}
              onChange={(v) => handleChange("versionWeb", v)}
            />
            <InputRow
              label="Símbolo de Moneda"
              value={settings.symbol}
              onChange={(v) => handleChange("symbol", v)}
            />
            <InputRow
              label="Radio del Conductor"
              value={settings.driverRadius}
              onChange={(v) => handleChange("driverRadius", v)}
            />
          </SettingsSection>
        )}

        {section === "social" && (
          <SettingsSection title="Redes Sociales">
            <InputRow
              label="Facebook"
              value={settings.FacebookHandle}
              onChange={(v) => handleChange("FacebookHandle", v)}
            />
            <InputRow
              label="Instagram"
              value={settings.InstagramHandle}
              onChange={(v) => handleChange("InstagramHandle", v)}
            />
            <InputRow
              label="Twitter"
              value={settings.TwitterHandle}
              onChange={(v) => handleChange("TwitterHandle", v)}
            />
          </SettingsSection>
        )}

        {section === "security" && (
          <SettingsSection title="Seguridad y Control">
            <ToggleRow
              label="OTP Seguro"
              checked={settings.otp_secure}
              onChange={(v) => handleChange("otp_secure", v)}
            />
            <ToggleRow
              label="OTP Personalizado"
              checked={settings.customMobileOTP}
              onChange={(v) => handleChange("customMobileOTP", v)}
            />
            <ToggleRow
              label="Aprobación Automática de Vehículo"
              checked={settings.carApproval}
              onChange={(v) => handleChange("carApproval", v)}
            />
          </SettingsSection>
        )}

        {section === "other" && (
          <SettingsSection title="Otras Configuraciones">
            <InputRow
              label="Número del Botón de Pánico"
              value={settings.panic}
              onChange={(v) => handleChange("panic", v)}
            />
            <InputRow
              label="Comisión del Hotel"
              value="10%"
              onChange={() => {}}
            />
            <InputRow
              label="Latencia Simulada"
              value="150ms"
              onChange={() => {}}
            />
          </SettingsSection>
        )}

        {/* Guardar cambios */}
        <div className="flex justify-end mt-8">
          <Button onClick={handleSave}>Guardar Cambios</Button>
        </div>
      </motion.div>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-4"
    >
      <h2 className="text-lg font-semibold text-slate-800 mb-4">{title}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">{children}</div>
    </motion.div>
  );
}

function InputRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div>
      <label className="block text-slate-600 text-sm font-medium mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (val: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-2">
      <span className="text-slate-700 text-sm">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-12 h-6 rounded-full transition ${
          checked ? "bg-red_treas" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transform transition ${
            checked ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
