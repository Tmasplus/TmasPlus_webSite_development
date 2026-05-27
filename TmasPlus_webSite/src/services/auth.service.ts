import { supabase, supabaseSecondary } from '@/config/supabase';
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

export type AuthMode = 'admin' | 'driver';

export interface DriverAuthResponse {
  user: User;
  session: Session;
  profile: UserRow; // Forma compatible; lectura cruda de secondary.users
  mode: 'driver';
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
      // 1. Autenticación inicial con GoTrue
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

      // 2. Llamada al "Portero" (RPC Seguro) para obtener el perfil saltando el RLS
      const { data: profileData, error: profileError } = await supabase.rpc('get_auth_profile');

      if (profileError || !profileData) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Perfil no encontrado o incompleto. Verifica tu registro.'
        );
      }

      const profile = profileData as UserRow;

      // 3. Reglas de Acceso (La lógica que solicitaste)
      const isAdmin = profile.user_type === 'admin';
      const isUnapprovedDriver = profile.user_type === 'driver' && profile.approved !== true;

      // Si está bloqueado por el sistema
      if (profile.blocked) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(AppErrorType.AUTHORIZATION, 'Esta cuenta ha sido suspendida.');
      }

      // Si NO es admin Y NO es un conductor pendiente de registro, SE BLOQUEA.
      if (!isAdmin && !isUnapprovedDriver) {
        await supabase.auth.signOut();
        throw ErrorHandler.createError(
          AppErrorType.AUTHORIZATION,
          'Acceso denegado. Tu cuenta ya está activa, ingresa por la App Móvil.'
        );
      }

      // 4. Replicar la sesión en el cliente secundario para que las operaciones
      // contra esa BD (p. ej. DriverStatusPage → UPDATE users) cumplan RLS.
      // Silencioso: si el usuario no existe en secondary, no bloqueamos el login.
      if (supabaseSecondary) {
        const { error: secondaryErr } = await supabaseSecondary.auth.signInWithPassword({
          email: credentials.email.trim(),
          password: credentials.password,
        });
        if (secondaryErr) {
          console.warn('[auth] Secondary sign-in falló (no bloqueante):', secondaryErr.message);
        }
      }

      toast.success(ToastMessages.LOGIN_SUCCESS);

      // 5. Si pasa las pruebas, el login es exitoso
      return {
        user: authData.user,
        session: authData.session,
        profile,
      };
    } catch (error) {
      if (error instanceof Error && (
        error.message.includes('Acceso denegado') ||
        error.message.includes('suspendida') ||
        error.message.includes('Perfil no encontrado')
      )) {
        throw error;
      }
      // Credenciales inválidas: re-lanzamos SIN toast porque el AuthContext
      // intentará el fallback a la BD secundaria (driver) antes de avisar al usuario.
      const code = (error as any)?.code;
      if (code === 'invalid_credentials') {
        throw error;
      }
      throw ErrorHandler.handleWithToast(error, 'AuthService.loginAdmin');
    }
  }

  /**
   * Login de conductor contra la BD secundaria.
   * Lanza error si las credenciales son inválidas o el perfil no es de tipo driver.
   */
  static async loginDriver(credentials: LoginCredentials): Promise<DriverAuthResponse> {
    if (!supabaseSecondary) {
      throw ErrorHandler.createError(
        AppErrorType.AUTHENTICATION,
        'Configuración de BD secundaria no disponible.'
      );
    }

    const { data: authData, error: authError } = await supabaseSecondary.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    });

    if (authError) {
      throw ErrorHandler.handleAuthError(authError);
    }
    if (!authData.user || !authData.session) {
      throw ErrorHandler.createError(
        AppErrorType.AUTHENTICATION,
        'No se pudo iniciar sesión.'
      );
    }

    // Leer perfil de secondary.users por auth_id
    const { data: profileData, error: profileError } = await supabaseSecondary
      .from('users')
      .select('*')
      .eq('auth_id', authData.user.id)
      .maybeSingle();

    if (profileError || !profileData) {
      await supabaseSecondary.auth.signOut();
      throw ErrorHandler.createError(
        AppErrorType.NOT_FOUND,
        'No se encontró tu perfil. Completa tu registro desde la app móvil.'
      );
    }

    const profile = profileData as UserRow;

    if (profile.blocked) {
      await supabaseSecondary.auth.signOut();
      throw ErrorHandler.createError(AppErrorType.AUTHORIZATION, 'Esta cuenta ha sido suspendida.');
    }

    return {
      user: authData.user,
      session: authData.session,
      profile,
      mode: 'driver',
    };
  }

  /**
   * Obtiene la sesión del cliente secundario (driver).
   */
  static async getCurrentDriverSession(): Promise<Session | null> {
    if (!supabaseSecondary) return null;
    try {
      const { data: { session }, error } = await supabaseSecondary.auth.getSession();
      if (error) return null;
      return session;
    } catch {
      return null;
    }
  }

  /**
   * Obtiene el perfil del driver desde la BD secundaria.
   */
  static async getCurrentDriverProfile(): Promise<UserRow | null> {
    if (!supabaseSecondary) return null;
    try {
      const { data: { session } } = await supabaseSecondary.auth.getSession();
      if (!session?.user) return null;

      const { data, error } = await supabaseSecondary
        .from('users')
        .select('*')
        .eq('auth_id', session.user.id)
        .maybeSingle();

      if (error || !data) return null;
      return data as UserRow;
    } catch (error) {
      console.error('Error obteniendo perfil driver:', error);
      return null;
    }
  }

  /**
   * Cierra la sesión del usuario actual
   */
  static async logout(): Promise<void> {
    try {
      const { error } = await supabase.auth.signOut();
      if (supabaseSecondary) {
        await supabaseSecondary.auth.signOut().catch(() => {});
      }

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
      // Evita el ruido "Auth session missing!" cuando no hay sesión:
      // primero comprobamos sesión y sólo entonces pedimos el user.
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
      // Verificamos silenciosamente si hay sesión sin lanzar errores que rompan React
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      // Consumimos el "portero" globalmente
      const { data: profileData, error } = await supabase.rpc('get_auth_profile');

      if (error || !profileData) return null;
      
      return profileData as UserRow;
    } catch (error) {
      console.error("Error obteniendo perfil:", error);
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
