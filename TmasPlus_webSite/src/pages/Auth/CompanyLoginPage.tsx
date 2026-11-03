import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FloatingInput } from "@/components/ui/FloatingField";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/utils/toast";
import logo from "@/assets/Logo-v3.png";
import { ForgotPasswordModal } from "@/pages/Auth/ForgotPasswordModal";
import { DEMO_COMPANY_EMAIL, DEMO_COMPANY_LOGIN_ENABLED } from "@/services/companyDemoAuth";

export const CompanyLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { loginCompany, isAuthenticated, isLoading: authLoading, profile, mode } = useAuth();

  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [openForgot, setOpenForgot] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [suggestReset, setSuggestReset] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || authLoading || !profile) return;
    if (mode === "company") navigate("/empresa/inicio", { replace: true });
    else if (mode === "admin") navigate("/home", { replace: true });
  }, [isAuthenticated, authLoading, profile, mode, navigate]);

  const update = (k: keyof typeof form, v: string) => {
    if (errorMsg) {
      setErrorMsg(null);
      setSuggestReset(false);
    }
    setForm((s) => ({ ...s, [k]: v }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      toast.error("Por favor, completa todos los campos");
      return;
    }
    if (!form.email.includes("@")) {
      toast.error("Por favor, ingresa un email válido");
      return;
    }

    setErrorMsg(null);
    setSuggestReset(false);
    try {
      setLoading(true);
      await loginCompany({ email: form.email.trim().toLowerCase(), password: form.password });
    } catch (error) {
      const err = error as { code?: string; technicalMessage?: string; message?: string };
      const isInvalidCreds =
        err?.code === "invalid_credentials" ||
        err?.technicalMessage === "Invalid login credentials" ||
        (typeof err?.message === "string" && err.message.toLowerCase().includes("incorrect"));
      const msg = isInvalidCreds
        ? "Correo o contraseña incorrectos. Si la olvidaste, restablécela."
        : err?.message || "No se pudo iniciar sesión. Inténtalo de nuevo.";
      setErrorMsg(msg);
      setSuggestReset(isInvalidCreds);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#002f45] to-[#00a7f5]">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#002f45] to-[#00a7f5]">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md bg-white rounded-2xl shadow-xl p-8"
      >
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={14} />
          Volver al acceso principal
        </button>

        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="T+ Logo" className="w-20 h-20 mb-3" />
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
            <Building2 size={14} />
            Portal empresas
          </span>
          <h1 className="text-2xl font-semibold text-[#002f45]">Acceso empresas</h1>
          <p className="text-sm text-slate-600">Solicita y gestiona los viajes de tu equipo</p>
        </div>

        {DEMO_COMPANY_LOGIN_ENABLED && (
          <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <strong>Acceso de prueba (solo desarrollo).</strong> Ingresa con{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => update("email", DEMO_COMPANY_EMAIL)}
            >
              {DEMO_COMPANY_EMAIL}
            </button>{" "}
            y la contraseña de <code>VITE_DEMO_COMPANY_PASSWORD</code> del <code>.env</code>.
          </div>
        )}

        {errorMsg && (
          <div role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">{errorMsg}</p>
            {suggestReset && (
              <button
                type="button"
                onClick={() => setOpenForgot(true)}
                className="mt-2 font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
              >
                Restablecer mi contraseña
              </button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <FloatingInput
            id="company-email"
            label="Correo de acceso"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
          />
          <FloatingInput
            id="company-password"
            label="Contraseña"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            disabled={loading}
            required
            autoComplete="current-password"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setOpenForgot(true)}
              className="text-xs font-semibold text-sky-600 hover:text-sky-800"
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <Button type="submit" disabled={loading} className="w-full py-3 text-lg font-medium">
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                Ingresando...
              </span>
            ) : (
              "Ingresar"
            )}
          </Button>
        </form>

        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800 text-center">
            <strong>¿Tu empresa aún no tiene acceso?</strong>
            <br />
            Comunícate con T+Plus para habilitar la cuenta corporativa.
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} T+PLUS. Todos los derechos reservados.
        </p>
      </motion.div>

      <ForgotPasswordModal open={openForgot} onClose={() => setOpenForgot(false)} initialEmail={form.email} />
    </div>
  );
};

export default CompanyLoginPage;
