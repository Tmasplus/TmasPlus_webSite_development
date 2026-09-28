import { supabase } from '@/config/supabase';
import type { PerfilDashboard } from '@/config/domain.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';
import { toast, ToastMessages } from '@/utils/toast';
import type { User, Session } from '@supabase/supabase-js';

/**
 * Interfaz para credenciales de login
 */
export interface LoginCredentials {
  email: string;
  password: string;
}

/**
 * Resultado de autenticación. `profile` proviene del RPC get_perfil_dashboard
 * (persona + roles + flags) del esquema consolidado.
 */
export interface AuthResponse {
  user: User;
  session: Session;
  profile: PerfilDashboard;
}

export type AuthMode = 'admin' | 'driver';

export interface DriverAuthResponse {
  user: User;
  session: Session;
  profile: PerfilDashboard;
  mode: 'driver';
}

/**
 * Servicio de autenticación de T+Plus Dashboard (esquema consolidado).
 * Tras la unificación hay UN solo proyecto: ya no existe login/BD secundaria.
 */
export class AuthService {
  /** Obtiene el perfil del usuario autenticado vía RPC (bypassa RLS). */
  private static async fetchPerfil(): Promise<PerfilDashboard | null> {
    const { data, error } = await supabase.rpc('get_perfil_dashboard');
    if (error || !data) return null;
    return data as PerfilDashboard;
  }

  /**
   * Login de administrador (o conductor pendiente de aprobación, portal de registro).
   */
  static async loginAdmin(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email.trim(),
        password: credentials.password,
      });

      if (authError) {
        throw ErrorHandler.handleAuthError(authError);
      }
      if (!authData.user || !authData.session) {
        throw ErrorHandler.createError(
          AppErrorType.AUTHENTICATION,
          'No se pudo iniciar sesión.',
          'Missing user or session in auth response'
        );
      }

      // Perfil vía RPC (persona + roles + flags), saltando RLS.
      const profile = await this.fetchPerfil();
      if (!profile) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Perfil no encontrado o incompleto. Verifica tu registro.'
        );
      }

      if (profile.bloqueado) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Su cuenta está bloqueada. Comuníquese con soporte.'
        );
      }

      const isAdmin = profile.es_admin;
      const isUnapprovedDriver = profile.es_conductor && !profile.aprobado;

      // Solo admins o conductores aún no aprobados pueden entrar al dashboard.
      if (!isAdmin && !isUnapprovedDriver) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Acceso denegado. Tu cuenta ya está activa, ingresa por la App Móvil.'
        );
      }

      toast.success(ToastMessages.LOGIN_SUCCESS);

      return { user: authData.user, session: authData.session, profile };
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Acceso denegado') ||
        error.message.includes('suspendida') ||
        error.message.includes('Perfil no encontrado')
      )) {
        throw error;
      }
      const code = (error as any)?.code;
      if (code === 'invalid_credentials') {
        throw error;
      }
      throw ErrorHandler.handleWithToast(error, 'AuthService.loginAdmin');
    }
  }

  /**
   * Login de conductor. En el proyecto consolidado usa el mismo cliente; se
   * conserva por compatibilidad con el AuthContext (fallback de login).
   */
  static async loginDriver(credentials: LoginCredentials): Promise<DriverAuthResponse> {
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    });

    if (authError) {
      throw ErrorHandler.handleAuthError(authError);
    }
    if (!authData.user || !authData.session) {
      throw ErrorHandler.createError(AppErrorType.AUTHENTICATION, 'No se pudo iniciar sesión.');
    }

    const profile = await this.fetchPerfil();
    if (!profile) {
      await supabase.auth.signOut();
      throw ErrorHandler.createError(
        AppErrorType.NOT_FOUND,
        'No se encontró tu perfil. Completa tu registro desde la app móvil.'
      );
    }
    if (!profile.es_conductor) {
      await supabase.auth.signOut();
      throw ErrorHandler.createError(AppErrorType.AUTHORIZATION, 'Esta cuenta no es de conductor.');
    }
    if (profile.bloqueado) {
      await supabase.auth.signOut();
      throw ErrorHandler.createError(
        AppErrorType.AUTHORIZATION,
        'Su cuenta está bloqueada. Comuníquese con soporte.'
      );
    }

    return { user: authData.user, session: authData.session, profile, mode: 'driver' };
  }

  /** @deprecated Proyecto único: equivale a getCurrentSession(). */
  static async getCurrentDriverSession(): Promise<Session | null> {
    return this.getCurrentSession();
  }

  /** @deprecated Proyecto único: equivale a getCurrentProfile(). */
  static async getCurrentDriverProfile(): Promise<PerfilDashboard | null> {
    return this.getCurrentProfile();
  }

  /**
   * Cierra la sesión del usuario actual.
   */
  static async logout(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw ErrorHandler.handleAuthError(error);
      }
      toast.success(ToastMessages.LOGOUT_SUCCESS);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'AuthService.logout');
    }
  }

  /**
   * Obtiene el usuario actual autenticado (auth.users).
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error) {
        console.error('Error getting current user:', error.message);
        return null;
      }
      return user;
    } catch (error) {
      console.error('Unexpected error getting current user:', error);
      return null;
    }
  }

  /**
   * Obtiene la sesión actual.
   */
  static async getCurrentSession(): Promise<Session | null> {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.error('Error getting session:', error.message);
        return null;
      }
      return session;
    } catch (error) {
      console.error('Unexpected error getting session:', error);
      return null;
    }
  }

  /**
   * Obtiene el perfil completo del usuario autenticado (persona + roles + flags).
   */
  static async getCurrentProfile(): Promise<PerfilDashboard | null> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      return await this.fetchPerfil();
    } catch (error) {
      console.error('Error obteniendo perfil:', error);
      return null;
    }
  }

  /**
   * Verifica si el usuario está autenticado y la sesión es válida.
   */
  static async isAuthenticated(): Promise<boolean> {
    const session = await this.getCurrentSession();
    if (!session?.user) return false;
    if (session.expires_at) {
      const expiresAt = new Date(session.expires_at * 1000);
      return expiresAt > new Date();
    }
    return true;
  }

  /**
   * Verifica si el usuario autenticado es admin (no bloqueado).
   */
  static async isAdmin(): Promise<boolean> {
    try {
      const profile = await this.getCurrentProfile();
      if (!profile) return false;
      return profile.es_admin && !profile.bloqueado;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Configura listener de cambios de autenticación.
   */
  static onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ) {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(callback);

    return () => subscription.unsubscribe();
  }
}
