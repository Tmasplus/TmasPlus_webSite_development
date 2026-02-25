import { supabase } from '@/config/supabase';
import type {
  UploadResult,
  UploadOptions,
  StorageFileMetadata,
} from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

/**
 * Constantes de Storage
 */
const STORAGE_CONSTANTS = {
  BUCKETS: {
    DRIVER_DOCUMENTS: 'driver-documents',
    VEHICLE_DOCUMENTS: 'vehicle-documents',
    VEHICLE_IMAGES: 'vehicle-images',
  },
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png'],
  ALLOWED_DOCUMENT_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
} as const;

/**
 * Servicio de Storage de T+Plus Dashboard
 * Maneja upload, download y gestión de archivos en Supabase Storage
 */
export class StorageService {
  /**
   * Genera un nombre único para archivo
   */
  private static generateUniqueFilename(originalFilename: string): string {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = originalFilename.split('.').pop();
    return `${timestamp}_${randomStr}.${extension}`;
  }

  /**
   * Valida tamaño de archivo
   */
  private static validateFileSize(file: File, maxSizeBytes: number): void {
    if (file.size > maxSizeBytes) {
      const maxSizeMB = maxSizeBytes / (1024 * 1024);
      throw ErrorHandler.createError(
        AppErrorType.VALIDATION,
        `El archivo es demasiado grande. Tamaño máximo: ${maxSizeMB}MB`,
        `File size: ${file.size} bytes, max: ${maxSizeBytes} bytes`
      );
    }
  }

  /**
   * Valida tipo de archivo
   */
  private static validateFileType(file: File, allowedTypes: readonly string[]): void {
    if (!allowedTypes.includes(file.type)) {
      throw ErrorHandler.createError(
        AppErrorType.VALIDATION,
        `Tipo de archivo no permitido. Tipos permitidos: ${allowedTypes.join(', ')}`,
        `File type: ${file.type}`
      );
    }
  }

  /**
   * Sube un archivo a Supabase Storage
   */
  static async uploadFile(options: UploadOptions): Promise<UploadResult> {
    try {
      const {
        bucket,
        folder,
        file,
        filename,
        maxSizeBytes = STORAGE_CONSTANTS.MAX_FILE_SIZE,
        allowedTypes = STORAGE_CONSTANTS.ALLOWED_DOCUMENT_TYPES,
      } = options;

      // Validaciones
      this.validateFileSize(file, maxSizeBytes);
      this.validateFileType(file, allowedTypes);

      // Generar nombre único si no se proporciona
      const finalFilename = filename || this.generateUniqueFilename(file.name);
      const filePath = `${folder}/${finalFilename}`;

      // Subir archivo
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al subir el archivo',
          error.message
        );
      }

      // Obtener URL pública
      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(data.path);

      return {
        success: true,
        url: publicUrl,
        path: data.path,
      };
    } catch (error) {
      console.error('Error in uploadFile:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido al subir archivo',
      };
    }
  }

  /**
   * Sube documento de conductor
   */
  static async uploadDriverDocument(
    driverId: string,
    documentType: string,
    file: File
  ): Promise<UploadResult> {
    return this.uploadFile({
      bucket: STORAGE_CONSTANTS.BUCKETS.DRIVER_DOCUMENTS,
      folder: driverId,
      file,
      filename: `${documentType}_${this.generateUniqueFilename(file.name)}`,
      allowedTypes: STORAGE_CONSTANTS.ALLOWED_DOCUMENT_TYPES,
    });
  }

  /**
   * Sube documento de vehículo
   */
  static async uploadVehicleDocument(
    carId: string,
    documentType: string,
    file: File
  ): Promise<UploadResult> {
    return this.uploadFile({
      bucket: STORAGE_CONSTANTS.BUCKETS.VEHICLE_DOCUMENTS,
      folder: carId,
      file,
      filename: `${documentType}_${this.generateUniqueFilename(file.name)}`,
      allowedTypes: STORAGE_CONSTANTS.ALLOWED_DOCUMENT_TYPES,
    });
  }

  /**
   * Sube imagen de vehículo
   */
  static async uploadVehicleImage(carId: string, file: File): Promise<UploadResult> {
    return this.uploadFile({
      bucket: STORAGE_CONSTANTS.BUCKETS.VEHICLE_IMAGES,
      folder: carId,
      file,
      allowedTypes: STORAGE_CONSTANTS.ALLOWED_IMAGE_TYPES,
    });
  }

  /**
   * Obtiene URL pública de un archivo
   */
  static getPublicUrl(bucket: string, path: string): string {
    const {
      data: { publicUrl },
    } = supabase.storage.from(bucket).getPublicUrl(path);
    return publicUrl;
  }

  /**
   * Descarga un archivo
   */
  static async downloadFile(bucket: string, path: string): Promise<Blob | null> {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al descargar el archivo',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'StorageService.downloadFile');
    }
  }

  /**
   * Elimina un archivo
   */
  static async deleteFile(bucket: string, path: string): Promise<boolean> {
    try {
      const { error } = await supabase.storage.from(bucket).remove([path]);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al eliminar el archivo',
          error.message
        );
      }

      return true;
    } catch (error) {
      console.error('Error in deleteFile:', error);
      return false;
    }
  }

  /**
   * Elimina múltiples archivos
   */
  static async deleteFiles(bucket: string, paths: string[]): Promise<boolean> {
    try {
      const { error } = await supabase.storage.from(bucket).remove(paths);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al eliminar los archivos',
          error.message
        );
      }

      return true;
    } catch (error) {
      console.error('Error in deleteFiles:', error);
      return false;
    }
  }

  /**
   * Lista archivos en una carpeta
   */
  static async listFiles(bucket: string, folder: string): Promise<StorageFileMetadata[]> {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(folder);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al listar archivos',
          error.message
        );
      }

      return data.map((file) => ({
        name: file.name,
        size: file.metadata?.size || 0,
        mimeType: file.metadata?.mimetype || 'unknown',
        url: this.getPublicUrl(bucket, `${folder}/${file.name}`),
        path: `${folder}/${file.name}`,
        uploadedAt: file.created_at || new Date().toISOString(),
      }));
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'StorageService.listFiles');
    }
  }

  /**
   * Obtiene metadatos de un archivo
   */
  static async getFileMetadata(
    bucket: string,
    path: string
  ): Promise<StorageFileMetadata | null> {
    try {
      const { data, error } = await supabase.storage.from(bucket).list(path.split('/')[0], {
        search: path.split('/').pop(),
      });

      if (error || !data || data.length === 0) {
        return null;
      }

      const file = data[0];
      return {
        name: file.name,
        size: file.metadata?.size || 0,
        mimeType: file.metadata?.mimetype || 'unknown',
        url: this.getPublicUrl(bucket, path),
        path,
        uploadedAt: file.created_at || new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error in getFileMetadata:', error);
      return null;
    }
  }

  /**
   * Verifica si un archivo existe
   */
  static async fileExists(bucket: string, path: string): Promise<boolean> {
    const metadata = await this.getFileMetadata(bucket, path);
    return metadata !== null;
  }

  /**
   * Copia un archivo a otra ubicación
   */
  static async copyFile(
    sourceBucket: string,
    sourcePath: string,
    targetBucket: string,
    targetPath: string
  ): Promise<boolean> {
    try {
      // Descargar archivo original
      const blob = await this.downloadFile(sourceBucket, sourcePath);
      if (!blob) return false;

      // Convertir Blob a File
      const file = new File([blob], targetPath.split('/').pop() || 'file', {
        type: blob.type,
      });

      // Subir a nueva ubicación
      const result = await this.uploadFile({
        bucket: targetBucket,
        folder: targetPath.split('/').slice(0, -1).join('/'),
        file,
        filename: targetPath.split('/').pop(),
      });

      return result.success;
    } catch (error) {
      console.error('Error in copyFile:', error);
      return false;
    }
  }

  /**
   * Mueve un archivo a otra ubicación
   */
  static async moveFile(
    sourceBucket: string,
    sourcePath: string,
    targetBucket: string,
    targetPath: string
  ): Promise<boolean> {
    try {
      // Copiar archivo
      const copied = await this.copyFile(sourceBucket, sourcePath, targetBucket, targetPath);
      if (!copied) return false;

      // Eliminar archivo original
      await this.deleteFile(sourceBucket, sourcePath);

      return true;
    } catch (error) {
      console.error('Error in moveFile:', error);
      return false;
    }
  }

  /**
   * Obtiene el tamaño total de archivos en una carpeta
   */
  static async getFolderSize(bucket: string, folder: string): Promise<number> {
    try {
      const files = await this.listFiles(bucket, folder);
      return files.reduce((total, file) => total + file.size, 0);
    } catch (error) {
      console.error('Error in getFolderSize:', error);
      return 0;
    }
  }
}

/**
 * Constantes exportadas para uso en componentes
 */
export const STORAGE_BUCKETS = STORAGE_CONSTANTS.BUCKETS;
export const MAX_FILE_SIZE = STORAGE_CONSTANTS.MAX_FILE_SIZE;
export const ALLOWED_IMAGE_TYPES = STORAGE_CONSTANTS.ALLOWED_IMAGE_TYPES;
export const ALLOWED_DOCUMENT_TYPES = STORAGE_CONSTANTS.ALLOWED_DOCUMENT_TYPES;
