import type { PostgrestError, AuthError } from '@supabase/supabase-js';
import { toast } from 'sonner';

/**
 * Tipos de errores personalizados de T+Plus
 */
export enum AppErrorType {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  DATABASE = 'DATABASE',
  STORAGE = 'STORAGE',
  VALIDATION = 'VALIDATION',
  NETWORK = 'NETWORK',
  NOT_FOUND = 'NOT_FOUND',
  UNKNOWN = 'UNKNOWN',
}

/**
 * Interfaz para errores estructurados de la aplicación
 */
export interface AppError {
  type: AppErrorType;
  message: string;
  technicalMessage?: string;
  code?: string;
  timestamp: Date;
}

/**
 * Mensajes de error amigables para usuarios
 */
const USER_FRIENDLY_MESSAGES: Record<AppErrorType, string> = {
  [AppErrorType.AUTHENTICATION]:
    'Error de autenticación. Por favor, verifica tus credenciales.',
  [AppErrorType.AUTHORIZATION]:
    'No tienes permisos para realizar esta acción.',
  [AppErrorType.DATABASE]:
    'Error al procesar la información. Por favor, intenta de nuevo.',
  [AppErrorType.STORAGE]:
    'Error al procesar archivos. Verifica el tamaño y formato.',
  [AppErrorType.VALIDATION]:
    'Por favor, verifica que todos los campos sean correctos.',
  [AppErrorType.NETWORK]:
    'Error de conexión. Verifica tu conexión a internet.',
  [AppErrorType.NOT_FOUND]:
    'No se encontró el recurso solicitado.',
  [AppErrorType.UNKNOWN]:
    'Ocurrió un error inesperado. Por favor, intenta de nuevo.',
};

/**
 * Determina el tipo de error basado en la instancia
 */
function determineErrorType(error: unknown): AppErrorType {
  if (error instanceof Error) {
    const errorName = error.constructor.name;
    const errorMessage = error.message.toLowerCase();

    // Errores de Supabase Auth
    if (errorName === 'AuthError' || errorMessage.includes('auth')) {
      if (errorMessage.includes('permission') || errorMessage.includes('unauthorized')) {
        return AppErrorType.AUTHORIZATION;
      }
      return AppErrorType.AUTHENTICATION;
    }

    // Errores de Supabase Postgrest (Base de datos)
    if (errorName === 'PostgrestError' || errorMessage.includes('postgrest')) {
      return AppErrorType.DATABASE;
    }

    // Errores de Storage
    if (errorMessage.includes('storage') || errorMessage.includes('bucket')) {
      return AppErrorType.STORAGE;
    }

    // Errores de red
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('fetch') ||
      errorMessage.includes('connection')
    ) {
      return AppErrorType.NETWORK;
    }
  }

  return AppErrorType.UNKNOWN;
}

/**
 * Extrae el código de error si existe
 */
function extractErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const err = error as { code?: string; status?: number };
    return err.code || (err.status ? String(err.status) : undefined);
  }
  return undefined;
}

/**
 * Extrae el mensaje técnico del error
 */
function extractTechnicalMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { message?: string; details?: string };
    return err.details || err.message || JSON.stringify(error);
  }

  return String(error);
}

/**
 * Clase principal para manejo de errores de la aplicación
 */
export class ErrorHandler {
  /**
   * Procesa cualquier error y lo convierte en AppError estructurado
   */
  static handle(error: unknown, context?: string): AppError {
    const type = determineErrorType(error);
    const code = extractErrorCode(error);
    const technicalMessage = extractTechnicalMessage(error);

    const appError: AppError = {
      type,
      message: USER_FRIENDLY_MESSAGES[type],
      technicalMessage,
      code,
      timestamp: new Date(),
    };

    // Log en desarrollo
    if (import.meta.env.DEV) {
      console.group(`🚨 Error en ${context || 'Aplicación'}`);
      console.error('Tipo:', type);
      console.error('Mensaje técnico:', technicalMessage);
      console.error('Código:', code);
      console.error('Error original:', error);
      console.groupEnd();
    }

    return appError;
  }

  /**
   * Maneja el error y muestra un toast automáticamente
   */
  static handleWithToast(error: unknown, context?: string): AppError {
    const appError = this.handle(error, context);
    toast.error(appError.message);
    return appError;
  }

  /**
   * Maneja errores de autenticación específicamente
   */
  static handleAuthError(error: AuthError | unknown): AppError {
    const appError = this.handle(error, 'Autenticación');

    // Mensajes específicos de autenticación
    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('invalid login credentials')) {
        appError.message = 'Email o contraseña incorrectos.';
      } else if (message.includes('email not confirmed')) {
        appError.message = 'Por favor, confirma tu email antes de iniciar sesión.';
      } else if (message.includes('user not found')) {
        appError.message = 'No existe una cuenta con este email.';
      } else if (message.includes('password')) {
        appError.message = 'La contraseña es incorrecta.';
      }
    }

    return appError;
  }

  /**
   * Maneja errores de base de datos específicamente
   */
  static handleDatabaseError(error: PostgrestError | unknown): AppError {
    const appError = this.handle(error, 'Base de datos');

    // Mensajes específicos de base de datos
    if (typeof error === 'object' && error !== null) {
      const pgError = error as PostgrestError;

      if (pgError.code === '23505') {
        appError.message = 'Este registro ya existe en el sistema.';
      } else if (pgError.code === '23503') {
        appError.message = 'No se puede eliminar. Hay datos relacionados.';
      } else if (pgError.code === '42P01') {
        appError.message = 'Error de configuración de la base de datos.';
      } else if (pgError.code === 'PGRST116') {
        appError.message = 'No se encontró el registro solicitado.';
      }
    }

    return appError;
  }

  /**
   * Maneja errores de Storage específicamente
   */
  static handleStorageError(error: unknown): AppError {
    const appError = this.handle(error, 'Storage');

    if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('size') || message.includes('large')) {
        appError.message = 'El archivo es demasiado grande. Máximo 5MB.';
      } else if (message.includes('type') || message.includes('format')) {
        appError.message = 'Formato de archivo no permitido.';
      } else if (message.includes('bucket')) {
        appError.message = 'Error al acceder al almacenamiento.';
      }
    }

    return appError;
  }

  /**
   * Valida si un error es de tipo específico
   */
  static isErrorType(error: AppError, type: AppErrorType): boolean {
    return error.type === type;
  }

  /**
   * Crea un error personalizado
   */
  static createError(
    type: AppErrorType,
    message: string,
    technicalMessage?: string
  ): AppError {
    return {
      type,
      message,
      technicalMessage,
      timestamp: new Date(),
    };
  }
}

/**
 * Decorador para funciones asíncronas con manejo de errores automático
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context?: string
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw ErrorHandler.handle(error, context || fn.name);
    }
  }) as T;
}

/**
 * Helper para validar respuestas de Supabase
 */
export function validateSupabaseResponse<T>(
  data: T | null,
  error: PostgrestError | null,
  context?: string
): T {
  if (error) {
    throw ErrorHandler.handleDatabaseError(error);
  }

  if (!data) {
    throw ErrorHandler.createError(
      AppErrorType.DATABASE,
      'No se encontraron datos.',
      `Empty response in ${context}`
    );
  }

  return data;
}
