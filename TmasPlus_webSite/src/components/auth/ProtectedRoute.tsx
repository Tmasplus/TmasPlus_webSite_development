import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Componente para proteger rutas que requieren autenticación
 * Si el usuario no está autenticado, redirige a /login
 * Si está autenticado pero no es admin, redirige a /login
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile } = useAuth();
  const location = useLocation();

  // Mientras carga, mostrar loader
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Verificando acceso...</p>
        </div>
      </div>
    );
  }

  // Si no está autenticado, redirigir a login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Verificación adicional: debe ser admin
  if (profile?.user_type !== 'admin' || !profile?.approved || profile?.blocked) {
    return <Navigate to="/login" replace />;
  }

  // Si todo está bien, mostrar el componente hijo
  return <>{children}</>;
}

export default ProtectedRoute;
