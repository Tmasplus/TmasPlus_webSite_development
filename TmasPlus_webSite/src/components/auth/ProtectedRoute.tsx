import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export type PortalRole = 'admin' | 'company';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Roles con acceso. Por defecto solo administradores. */
  allow?: PortalRole[];
}

/**
 * Protege rutas autenticadas según el rol.
 * Sin sesión se va al login correspondiente; una empresa que entra a una ruta
 * de administración vuelve a su portal.
 */
export function ProtectedRoute({ children, allow = ['admin'] }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading, profile, mode } = useAuth();
  const location = useLocation();
  const isCompanyArea = location.pathname.startsWith('/empresa/');

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

  if (!isAuthenticated || !profile || profile.bloqueado) {
    return <Navigate to={isCompanyArea ? '/empresas/login' : '/login'} state={{ from: location }} replace />;
  }

  const role: PortalRole | null = profile.es_admin ? 'admin' : mode === 'company' ? 'company' : null;

  if (role && allow.includes(role)) {
    return <>{children}</>;
  }

  if (role === 'company') {
    return <Navigate to="/empresa/inicio" replace />;
  }
  return <Navigate to="/login" replace />;
}

export default ProtectedRoute;
