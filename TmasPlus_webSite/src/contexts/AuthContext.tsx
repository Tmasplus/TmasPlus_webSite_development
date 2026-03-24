import React, { createContext, useState, useEffect, useCallback } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRow } from '@/config/database.types';
import { AuthService, type LoginCredentials, type AuthResponse } from '@/services/auth.service';
import { ErrorHandler } from '@/utils/errorHandler';
import { toast } from '@/utils/toast';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserRow | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  checkAuth: () => Promise<boolean>;
}

const initialState: AuthState = {
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  isAuthenticated: false,
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  const updateAuthState = useCallback((updates: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      updateAuthState({ isLoading: true });

      const session = await AuthService.getCurrentSession();
      const user = await AuthService.getCurrentUser();
      const profile = await AuthService.getCurrentProfile();

      const isAuthenticated = !!(session && user && profile);
      const isAdmin = profile?.user_type === 'admin' && profile?.approved && !profile?.blocked;

      // 🚨 EXCEPCIÓN ESTRATÉGICA: Permitir mini-sesión en la ruta de registro O si es conductor a medias
      const isRegisteringDriver = window.location.pathname.includes('/register-driver');
      const isUnapprovedDriver = profile?.user_type === 'driver' && profile?.approved !== true;

      if (isAuthenticated && !isAdmin) {
        if (isRegisteringDriver || isUnapprovedDriver) {
          // Permitir sesión temporal para que termine de subir documentos o sea redirigido
          updateAuthState({ user, session, profile, isAuthenticated: true, isLoading: false });
          return true;
        } else {
          // Si intenta entrar al dashboard u otra zona, lo expulsamos y avisamos
          await AuthService.logout();
          toast.error('Acceso denegado: Los conductores solo pueden iniciar sesión en la App Móvil de T+Plus.');
          updateAuthState({ ...initialState, isLoading: false });
          return false;
        }
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
      updateAuthState({ ...initialState, isLoading: false });
      return false;
    }
  }, [updateAuthState]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    try {
      updateAuthState({ isLoading: true });
      const authResponse: AuthResponse = await AuthService.loginAdmin(credentials);

      // Si el login es manual desde /login y no es admin, la validación se hace en checkAuth
      updateAuthState({
        user: authResponse.user,
        session: authResponse.session,
        profile: authResponse.profile,
        isAuthenticated: true,
        isLoading: false,
      });
      await checkAuth(); // Revalidamos reglas de negocio inmediatamente
    } catch (error) {
      updateAuthState({ ...initialState, isLoading: false });
      throw error;
    }
  }, [updateAuthState, checkAuth]);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await AuthService.logout();
      updateAuthState({ ...initialState, isLoading: false });
    } catch (error) {
      ErrorHandler.handleWithToast(error, 'AuthContext.logout');
      throw error;
    }
  }, [updateAuthState]);

  const refreshProfile = useCallback(async (): Promise<void> => {
    try {
      const profile = await AuthService.getCurrentProfile();
      updateAuthState({ profile });
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [updateAuthState]);

  useEffect(() => {
    checkAuth();
    const unsubscribe = AuthService.onAuthStateChange(async (event) => {
      if (event === 'SIGNED_OUT') {
        updateAuthState({ ...initialState, isLoading: false });
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        checkAuth();
      } else if (event === 'USER_UPDATED') {
        refreshProfile();
      }
    });
    return () => unsubscribe();
  }, [checkAuth, refreshProfile, updateAuthState]);

  return <AuthContext.Provider value={{ ...state, login, logout, refreshProfile, checkAuth }}>{children}</AuthContext.Provider>;
}