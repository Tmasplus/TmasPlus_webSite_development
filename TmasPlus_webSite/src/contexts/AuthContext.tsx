import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRow } from '@/config/database.types';
import { AuthService, type LoginCredentials, type AuthResponse } from '@/services/auth.service';
import { ErrorHandler } from '@/utils/errorHandler';

/**
 * Interfaz del estado de autenticación
 */
interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserRow | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Interfaz del contexto de autenticación
 */
interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

/**
 * Estado inicial
 */
const initialState: AuthState = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
};

/**
 * Context de autenticación
 */
export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Props del provider
 */
interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * Provider de autenticación para T+Plus Dashboard
 * Maneja el estado global de autenticación de administradores
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState);

  /**
   * Actualiza el estado de autenticación
   */
  const updateAuthState = useCallback((updates: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Verifica la autenticación al montar el componente
   */
  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      updateAuthState({ isLoading: true });

      const session = await AuthService.getCurrentSession();
      const user = await AuthService.getCurrentUser();
      const profile = await AuthService.getCurrentProfile();

      const isAuthenticated = !!(session && user && profile);
      const isAdmin = profile?.user_type === 'admin' && profile?.approved && !profile?.blocked;

      if (isAuthenticated && !isAdmin) {
        // Si está autenticado pero no es admin, cerrar sesión
        await AuthService.logout();
        updateAuthState({
          user: null,
          session: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false,
        });
        return false;
      }

      updateAuthState({
        user,
        session,
        profile,
        isAuthenticated: isAuthenticated && isAdmin,
        isLoading: false,
      });

      return isAuthenticated && isAdmin;
    } catch (error) {
      console.error('Error checking auth:', error);
      updateAuthState({
        user: null,
        session: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return false;
    }
  }, [updateAuthState]);

  /**
   * Login de administrador
   */
  const login = useCallback(
    async (credentials: LoginCredentials): Promise<void> => {
      try {
        updateAuthState({ isLoading: true });

        const authResponse: AuthResponse = await AuthService.loginAdmin(credentials);

        updateAuthState({
          user: authResponse.user,
          session: authResponse.session,
          profile: authResponse.profile,
          isAuthenticated: true,
          isLoading: false,
        });
      } catch (error) {
        updateAuthState({
          user: null,
          session: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false,
        });
        throw error;
      }
    },
    [updateAuthState]
  );

  /**
   * Logout
   */
  const logout = useCallback(async (): Promise<void> => {
    try {
      await AuthService.logout();
      updateAuthState({
        user: null,
        session: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
      });
    } catch (error) {
      ErrorHandler.handleWithToast(error, 'AuthContext.logout');
      throw error;
    }
  }, [updateAuthState]);

  /**
   * Refresca el perfil del usuario actual
   */
  const refreshProfile = useCallback(async (): Promise<void> => {
    try {
      const profile = await AuthService.getCurrentProfile();
      updateAuthState({ profile });
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [updateAuthState]);

  /**
   * Configura listener de cambios de autenticación
   */
  useEffect(() => {
    // Verificar autenticación inicial
    checkAuth();

    // Listener de cambios de auth
    const unsubscribe = AuthService.onAuthStateChange(async (event, session) => {
      if (import.meta.env.DEV) {
        console.log('Auth state change:', event);
      }

      if (event === 'SIGNED_OUT') {
        updateAuthState({
          user: null,
          session: null,
          profile: null,
          isAuthenticated: false,
          isLoading: false,
        });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkAuth();
      } else if (event === 'USER_UPDATED') {
        refreshProfile();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [checkAuth, refreshProfile, updateAuthState]);

  const value: AuthContextValue = {
    ...state,
    login,
    logout,
    refreshProfile,
    checkAuth,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}