import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { FloatingInput } from '@/components/ui/FloatingField';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/utils/toast';
import logo from '@/assets/Logo-v3.png';
import { ForgotPasswordModal } from '@/pages/Auth/ForgotPasswordModal';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated, isLoading: authLoading } = useAuth();

  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [openForgot, setOpenForgot] = useState(false);

  // Redireccionar si ya está autenticado
  useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/home', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const update = (k: keyof typeof form, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones básicas
    if (!form.email || !form.password) {
      toast.error('Por favor, completa todos los campos');
      return;
    }

    if (!form.email.includes('@')) {
      toast.error('Por favor, ingresa un email válido');
      return;
    }

    if (form.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    try {
      setLoading(true);

      // Intentar login con Supabase
      await login({
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });

      // Si llegamos aquí, el login fue exitoso
      // El toast de éxito se muestra en auth.service.ts
      // La redirección se maneja en el useEffect de arriba

    } catch (error) {
      // Los errores ya se manejan en auth.service.ts con toasts
      console.error('Login error:', error);
    } finally {
      setLoading(false);
    }
  };



  const handleRegister = () => {
    navigate('/register-driver');
  };

  // Si está cargando la verificación de auth, mostrar loader
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
      {/* Capa de fondo */}
      <div className="absolute inset-0 bg-[url('/bg-pattern.svg')] bg-cover opacity-10"></div>

      {/* Tarjeta principal */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md bg-white backdrop-blur-md rounded-2xl shadow-xl p-8"
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="T+ Logo" className="w-20 h-20 mb-3" />
          <h1 className="text-2xl font-semibold text-[#002f45]">
            Bienvenido a T+Plus
          </h1>
          <p className="text-sm text-slate-600">
            Panel de administración
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <FloatingInput
            id="email"
            label="Correo electrónico"
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            disabled={loading}
            required
            autoComplete="email"
          />
          <FloatingInput
            id="password"
            label="Contraseña"
            type="password"
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
            disabled={loading}
            required
            autoComplete="current-password"
          />

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 text-primary focus:ring-primary"
                disabled={loading}
              />
              <span className="text-slate-700">Recordarme</span>
            </label>
            <div className="flex justify-end mt-1">
              <button 
                type="button" 
                onClick={() => setOpenForgot(true)} 
                className="text-xs font-semibold text-sky-600 hover:text-sky-800"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full mt-4 py-3 text-lg font-medium"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></span>
                Ingresando...
              </span>
            ) : (
              'Iniciar sesión'
            )}
          </Button>

          <Button
            type="button"
            className="w-full"
            variant="secondary"
            onClick={handleRegister}
            disabled={loading}
          >
            Registrarse como conductor
          </Button>
        </form>

        {/* Información de acceso */}
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800 text-center">
            <strong>Acceso solo para administradores</strong>
            <br />
            Los conductores deben usar la aplicación móvil
          </p>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} T+PLUS. Todos los derechos reservados.
        </p>
      </motion.div>

      <ForgotPasswordModal open={openForgot} onClose={() => setOpenForgot(false)} />
    </div>
  );
};

export default LoginPage;
