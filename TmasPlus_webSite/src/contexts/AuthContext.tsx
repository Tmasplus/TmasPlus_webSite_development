import React, { createContext, useState, useEffect, useCallback, useRef } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import type { UserRow } from '@/config/database.types';
import { AuthService, type AuthMode, type LoginCredentials, type AuthResponse } from '@/services/auth.service';
import { ErrorHandler } from '@/utils/errorHandler';
import { toast } from '@/utils/toast';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserRow | null;
  mode: AuthMode | null;
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
  mode: null,
  isLoading: true,
  isAuthenticated: false,
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);
  const initialCheckDone = useRef(false);

  const updateAuthState = useCallback((updates: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  /**
   * Verifica la autenticación.
   * @param silent — si es true, NO muestra el loader (para re-validaciones en segundo plano)
   */
  const checkAuth = useCallback(async (silent = false): Promise<boolean> => {
    try {
      if (!silent) {
        updateAuthState({ isLoading: true });
      }

      // 1. Cliente principal (admin)
      const session = await AuthService.getCurrentSession();
      const user = await AuthService.getCurrentUser();
      const profile = await AuthService.getCurrentProfile();
      const hasPrincipal = !!(session && user && profile);

      if (hasPrincipal) {
        const isAdmin = profile!.user_type === 'admin' && profile!.approved && !profile!.blocked;
        const isRegisteringDriver = window.location.pathname.includes('/register-driver');
        const isUnapprovedDriver = profile!.user_type === 'driver' && profile!.approved !== true;

        if (!isAdmin && (isRegisteringDriver || isUnapprovedDriver)) {
          // Sesión temporal de driver-en-registro contra principal (flujo legacy)
          updateAuthState({ user, session, profile, mode: 'driver', isAuthenticated: true, isLoading: false });
          return true;
        }

        if (!isAdmin) {
          await AuthService.logout();
          toast.error('Acceso denegado: Los conductores solo pueden iniciar sesión en la App Móvil de T+Plus.');
          updateAuthState({ ...initialState, isLoading: false });
          return false;
        }

        updateAuthState({ user, session, profile, mode: 'admin', isAuthenticated: true, isLoading: false });
        return true;
      }

      // 2. Cliente secundario (driver creado desde la app)
      const driverSession = await AuthService.getCurrentDriverSession();
      const driverProfile = await AuthService.getCurrentDriverProfile();

      if (driverSession && driverProfile) {
        if (driverProfile.blocked) {
          updateAuthState({ ...initialState, isLoading: false });
          return false;
        }
        updateAuthState({
          user: driverSession.user,
          session: driverSession,
          profile: driverProfile,
          mode: 'driver',
          isAuthenticated: true,
          isLoading: false,
        });
        return true;
      }

      updateAuthState({ ...initialState, isLoading: false });
      return false;
    } catch (error) {
      console.error('Error checking auth:', error);
      updateAuthState({ ...initialState, isLoading: false });
      return false;
    }
  }, [updateAuthState]);

  const login = useCallback(async (credentials: LoginCredentials): Promise<void> => {
    updateAuthState({ isLoading: true });

    // 1. Intentar login admin (principal)
    let adminResp: AuthResponse | null = null;
    let adminErr: any = null;
    try {
      adminResp = await AuthService.loginAdmin(credentials);
    } catch (err) {
      adminErr = err;
    }

    if (adminResp) {
      updateAuthState({
        user: adminResp.user,
        session: adminResp.session,
        profile: adminResp.profile,
        mode: 'admin',
        isAuthenticated: true,
        isLoading: false,
      });
      await checkAuth(true);
      return;
    }

    // 2. Si las credenciales no eran de admin, intentar como driver (secundaria)
    const isInvalidAdmin =
      adminErr?.code === 'invalid_credentials' ||
      adminErr?.technicalMessage === 'Invalid login credentials' ||
      adminErr?.message?.includes('Perfil no encontrado') ||
      adminErr?.message?.includes('Acceso denegado');

    if (isInvalidAdmin) {
      try {
        const driverResp = await AuthService.loginDriver(credentials);
        updateAuthState({
          user: driverResp.user,
          session: driverResp.session,
          profile: driverResp.profile,
          mode: 'driver',
          isAuthenticated: true,
          isLoading: false,
        });
        return;
      } catch (driverErr) {
        updateAuthState({ ...initialState, isLoading: false });
        throw driverErr;
      }
    }

    updateAuthState({ ...initialState, isLoading: false });
    throw adminErr;
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
      const principal = await AuthService.getCurrentProfile();
      if (principal) {
        updateAuthState({ profile: principal, mode: principal.user_type === 'admin' ? 'admin' : 'driver' });
        return;
      }
      const driverProfile = await AuthService.getCurrentDriverProfile();
      if (driverProfile) {
        updateAuthState({ profile: driverProfile, mode: 'driver' });
      }
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  }, [updateAuthState]);

  useEffect(() => {
    // Primera verificación: muestra loader
    checkAuth(false).then(() => { initialCheckDone.current = true; });

    const unsubscribe = AuthService.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        updateAuthState({ ...initialState, isLoading: false });
      } else if (event === 'SIGNED_IN') {
        // Login nuevo: solo mostrar loader si aún no se hizo el check inicial
        checkAuth(!initialCheckDone.current ? false : true);
      } else if (event === 'TOKEN_REFRESHED') {
        // Refresco de token (volver a la pestaña): siempre silencioso
        checkAuth(true);
      } else if (event === 'USER_UPDATED') {
        refreshProfile();
      }
    });
    return () => unsubscribe();
  }, [checkAuth, refreshProfile, updateAuthState]);

  return <AuthContext.Provider value={{ ...state, login, logout, refreshProfile, checkAuth }}>{children}</AuthContext.Provider>;
}