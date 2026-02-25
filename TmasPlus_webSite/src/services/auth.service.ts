import { supabase } from '@/config/supabase';
import type { UserRow } from '@/config/database.types';
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
 * Interfaz para el resultado de autenticación
 */
export interface AuthResponse {
  user: User;
  session: Session;
  profile: UserRow;
}

/**
 * Servicio de autenticación de T+Plus Dashboard
 */
export class AuthService {
  /**
   * Login de administrador
   */
  static async loginAdmin(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: credentials.email,
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

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authData.user.id)
        .single();

      if (profileError) {
        await supabase.auth.signOut();
        throw ErrorHandler.handleDatabaseError(profileError);
      }

      if (!profile) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'No se encontró el perfil de usuario.',
          `Profile not found for auth_id: ${authData.user.id}`
        );
      }

      if (profile.user_type !== 'admin') {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Acceso denegado. Solo administradores.',
          `User type: ${profile.user_type}`
        );
      }

      if (!profile.approved) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Tu cuenta no ha sido aprobada.',
          `Admin not approved: ${profile.id}`
        );
      }

      if (profile.blocked) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Tu cuenta está bloqueada.',
          `Admin blocked: ${profile.id}`
        );
      }

      toast.success(ToastMessages.LOGIN_SUCCESS);

      return {
        user: authData.user,
        session: authData.session,
        profile,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Acceso denegado')) {
        throw error;
      }
      throw ErrorHandler.handleWithToast(error, 'AuthService.loginAdmin');
    }
  }

  /**
   * Cierra la sesión del usuario actual
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
   * Obtiene el usuario actual autenticado
   */
  static async getCurrentUser(): Promise<User | null> {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

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
   * Obtiene la sesión actual
   */
  static async getCurrentSession(): Promise<Session | null> {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

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
   * Obtiene el perfil completo del usuario autenticado
   */
  static async getCurrentProfile(): Promise<UserRow | null> {
    try {
      const user = await this.getCurrentUser();
      if (!user) return null;

      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', user.id)
        .single();

      if (error) {
        console.error('Error getting profile:', error.message);
        return null;
      }

      return profile;
    } catch (error) {
      console.error('Unexpected error getting profile:', error);
      return null;
    }
  }

  /**
   * Verifica si el usuario está autenticado y la sesión es válida
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
   * Verifica si el usuario autenticado es admin aprobado
   */
  static async isAdmin(): Promise<boolean> {
    try {
      const profile = await this.getCurrentProfile();
      if (!profile) return false;

      return profile.user_type === 'admin' && profile.approved && !profile.blocked;
    } catch (error) {
      console.error('Error checking admin status:', error);
      return false;
    }
  }

  /**
   * Configura listener de cambios de autenticación
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
