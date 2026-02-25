import { toast as sonnerToast } from 'sonner';

/**
 * Configuración de duración de toasts
 */
const TOAST_DURATION = {
  SHORT: 2000,
  MEDIUM: 4000,
  LONG: 6000,
} as const;

/**
 * Wrapper personalizado para Sonner con configuraciones de T+Plus
 */
export const toast = {
  /**
   * Toast de éxito
   */
  success: (message: string, duration = TOAST_DURATION.MEDIUM) => {
    sonnerToast.success(message, {
      duration,
      position: 'top-right',
    });
  },

  /**
   * Toast de error
   */
  error: (message: string, duration = TOAST_DURATION.LONG) => {
    sonnerToast.error(message, {
      duration,
      position: 'top-right',
    });
  },

  /**
   * Toast de advertencia
   */
  warning: (message: string, duration = TOAST_DURATION.MEDIUM) => {
    sonnerToast.warning(message, {
      duration,
      position: 'top-right',
    });
  },

  /**
   * Toast informativo
   */
  info: (message: string, duration = TOAST_DURATION.MEDIUM) => {
    sonnerToast.info(message, {
      duration,
      position: 'top-right',
    });
  },

  /**
   * Toast de carga (loading)
   */
  loading: (message: string) => {
    return sonnerToast.loading(message, {
      position: 'top-right',
    });
  },

  /**
   * Toast de promesa (automático según resultado)
   */
  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string;
      error: string;
    }
  ) => {
    return sonnerToast.promise(promise, {
      loading: messages.loading,
      success: messages.success,
      error: messages.error,
      position: 'top-right',
    });
  },

  /**
   * Dismiss (cerrar) un toast específico
   */
  dismiss: (toastId?: string | number) => {
    sonnerToast.dismiss(toastId);
  },

  /**
   * Toast personalizado (para casos especiales)
   */
  custom: (message: string, options?: Parameters<typeof sonnerToast>[1]) => {
    sonnerToast(message, {
      position: 'top-right',
      ...options,
    });
  },
};

/**
 * Mensajes predefinidos comunes de T+Plus
 */
export const ToastMessages = {
  // Autenticación
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  LOGIN_ERROR: 'Error al iniciar sesión',
  LOGOUT_SUCCESS: 'Sesión cerrada exitosamente',
  
  // Conductores
  DRIVER_CREATED: 'Conductor registrado exitosamente',
  DRIVER_UPDATED: 'Conductor actualizado exitosamente',
  DRIVER_DELETED: 'Conductor eliminado exitosamente',
  DRIVER_APPROVED: 'Conductor aprobado exitosamente',
  DRIVER_REJECTED: 'Conductor rechazado',
  
  // Archivos
  FILE_UPLOAD_SUCCESS: 'Archivo subido exitosamente',
  FILE_UPLOAD_ERROR: 'Error al subir archivo',
  FILE_DELETE_SUCCESS: 'Archivo eliminado exitosamente',
  FILE_SIZE_ERROR: 'El archivo excede el tamaño máximo permitido',
  FILE_TYPE_ERROR: 'Formato de archivo no permitido',
  
  // Datos
  DATA_SAVED: 'Datos guardados exitosamente',
  DATA_DELETED: 'Datos eliminados exitosamente',
  DATA_LOAD_ERROR: 'Error al cargar datos',
  
  // Validación
  VALIDATION_ERROR: 'Por favor, completa todos los campos requeridos',
  
  // Red
  NETWORK_ERROR: 'Error de conexión. Verifica tu internet',
  
  // Genéricos
  OPERATION_SUCCESS: 'Operación completada exitosamente',
  OPERATION_ERROR: 'Error al realizar la operación',
} as const;
