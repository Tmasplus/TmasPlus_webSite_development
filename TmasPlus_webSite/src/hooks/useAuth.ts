import { useContext } from 'react';
import { AuthContext } from '@/contexts/AuthContext';

/**
 * Hook para acceder al contexto de autenticación
 * 
 * @throws Error si se usa fuera del AuthProvider
 * 
 * @example
 * ```
 * function MyComponent() {
 *   const { user, isAuthenticated, login, logout } = useAuth();
 *   
 *   if (!isAuthenticated) {
 *     return <LoginForm onSubmit={login} />;
 *   }
 *   
 *   return (
 *     <div>
 *       <p>Bienvenido {user?.email}</p>
 *       <button onClick={logout}>Cerrar sesión</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error(
      'useAuth debe ser usado dentro de un AuthProvider. ' +
      'Asegúrate de envolver tu aplicación con <AuthProvider>.'
    );
  }

  return context;
}
