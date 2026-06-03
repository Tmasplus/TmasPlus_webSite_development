import { supabase, supabaseSecondary } from '@/config/supabase';
import { StorageService } from './storage.service';

/**
 * Gestión de documentos de conductores/vehículos para el panel de administración.
 *
 * Cada documento vive como una URL en una columna de `users` (documentos del
 * conductor) o `cars` (documentos/fotos del vehículo). Esta capa permite al
 * admin subir/reemplazar un documento y replicarlo a la base secundaria (App).
 */

export type DocScope = 'user' | 'car';

export interface DocDef {
  /** Clave única = nombre de la columna en la tabla destino */
  field: string;
  label: string;
  scope: DocScope;
  bucket: string;
  /** Tipos MIME aceptados por el input */
  accept: string;
}

export const DOC_DEFS: Record<string, DocDef> = {
  car_image_1: { field: 'car_image_1', label: 'Foto Vehículo (Exterior)', scope: 'car', bucket: 'car-images', accept: 'image/*' },
  car_image_2: { field: 'car_image_2', label: 'Foto Vehículo (Interior)', scope: 'car', bucket: 'car-images', accept: 'image/*' },
  verify_id_image: { field: 'verify_id_image', label: 'Cédula (Frente)', scope: 'user', bucket: 'driver-documents', accept: 'image/*,application/pdf' },
  verify_id_image_bk: { field: 'verify_id_image_bk', label: 'Cédula (Reverso)', scope: 'user', bucket: 'driver-documents', accept: 'image/*,application/pdf' },
  license_image: { field: 'license_image', label: 'Licencia (Frente)', scope: 'user', bucket: 'driver-documents', accept: 'image/*,application/pdf' },
  license_image_back: { field: 'license_image_back', label: 'Licencia (Reverso)', scope: 'user', bucket: 'driver-documents', accept: 'image/*,application/pdf' },
  card_prop_image: { field: 'card_prop_image', label: 'Tarjeta de Propiedad (Frente)', scope: 'car', bucket: 'vehicle-documents', accept: 'image/*,application/pdf' },
  card_prop_image_back: { field: 'card_prop_image_back', label: 'Tarjeta de Propiedad (Reverso)', scope: 'car', bucket: 'vehicle-documents', accept: 'image/*,application/pdf' },
  soat_image: { field: 'soat_image', label: 'SOAT', scope: 'car', bucket: 'vehicle-documents', accept: 'image/*,application/pdf' },
  tecnomecanica_image: { field: 'tecnomecanica_image', label: 'Tecnomecánica', scope: 'car', bucket: 'vehicle-documents', accept: 'image/*,application/pdf' },
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string); // data URL; el edge function quita el prefijo
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export interface UploadDocResult {
  primaryUrl: string;
  secondaryUrl: string | null;
  secondaryWarning?: string;
}

export class DriverDocumentsService {
  /**
   * Sube un documento a la base PRIMARIA (storage + columna en users/cars).
   * El admin del dashboard sí tiene permiso de escritura en el proyecto primario.
   */
  static async uploadToPrimary(
    field: string,
    file: File,
    driverId: string,
    carId?: string | null,
  ): Promise<string> {
    const def = DOC_DEFS[field];
    if (!def) throw new Error(`Documento no soportado: ${field}`);
    if (def.scope === 'car' && !carId) {
      throw new Error('No se puede subir el documento del vehículo: el conductor no tiene vehículo registrado.');
    }

    const folder = def.scope === 'car' ? (carId as string) : driverId;
    const allowed = def.accept.includes('pdf')
      ? ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
      : ['image/jpeg', 'image/jpg', 'image/png'];

    const res = await StorageService.uploadFile({
      bucket: def.bucket,
      folder,
      file,
      filename: `${field}_${Date.now()}.${file.name.split('.').pop() || 'jpg'}`,
      allowedTypes: allowed,
    });
    if (!res.success || !res.url) {
      throw new Error(res.error || 'Error al subir el documento');
    }

    const table = def.scope === 'car' ? 'cars' : 'users';
    const id = def.scope === 'car' ? (carId as string) : driverId;
    const { error } = await supabase
      .from(table)
      .update({ [def.field]: res.url, updated_at: new Date().toISOString() } as any)
      .eq('id', id);
    if (error) throw new Error(`Documento subido pero no se actualizó el registro: ${error.message}`);

    return res.url;
  }

  /**
   * Replica un documento a la base SECUNDARIA (App) vía edge function con
   * service role. Lanza error si el conductor no está importado o no tiene
   * vehículo en la App.
   */
  static async uploadToSecondary(field: string, file: File, driverId: string): Promise<string | null> {
    if (!supabaseSecondary) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const fileBase64 = await fileToBase64(file);
    const { data, error } = await (supabaseSecondary as any).functions.invoke('upload-driver-document', {
      body: {
        driverId,
        field,
        fileBase64,
        contentType: file.type || 'application/octet-stream',
        fileName: file.name,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al replicar el documento a la App';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const b = await ctx.json();
          if (b?.error) message = b.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    return data?.url ?? null;
  }

  /**
   * Sube a AMBAS bases. El primario es obligatorio; si el secundario falla
   * (p. ej. el conductor aún no está importado) se devuelve un aviso sin
   * abortar la operación.
   */
  static async uploadBoth(
    field: string,
    file: File,
    driverId: string,
    carId?: string | null,
  ): Promise<UploadDocResult> {
    const primaryUrl = await this.uploadToPrimary(field, file, driverId, carId);
    let secondaryUrl: string | null = null;
    let secondaryWarning: string | undefined;
    try {
      secondaryUrl = await this.uploadToSecondary(field, file, driverId);
    } catch (e: any) {
      secondaryWarning = e?.message || 'No se pudo replicar a la App';
    }
    return { primaryUrl, secondaryUrl, secondaryWarning };
  }

  /**
   * Descarga un documento de la base PRIMARIA y lo devuelve como File para
   * poder re-subirlo. Las URLs almacenadas tienen formato público, pero los
   * buckets pueden ser privados, así que firmamos la URL antes de descargar.
   */
  private static async fetchPrimaryDocAsFile(field: string, url: string): Promise<File> {
    let fetchUrl = url;
    if (url.includes('/object/public/')) {
      const parts = url.split('/object/public/');
      const pathParts = parts[1].split('/');
      const bucket = pathParts[0];
      const filePath = pathParts.slice(1).join('/');
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(filePath, 3600);
      if (!error && data?.signedUrl) fetchUrl = data.signedUrl;
    }

    const resp = await fetch(fetchUrl);
    if (!resp.ok) throw new Error(`No se pudo descargar el documento (${resp.status})`);
    const blob = await resp.blob();
    const type = blob.type || 'application/octet-stream';
    const ext = type.includes('pdf') ? 'pdf' : type.includes('png') ? 'png' : 'jpg';
    return new File([blob], `${field}.${ext}`, { type });
  }

  /**
   * Replica a la base SECUNDARIA (App) todos los documentos presentes del
   * conductor y su vehículo, descargándolos del primario y re-subiéndolos al
   * storage secundario. Se usa al importar un conductor para que sus documentos
   * queden visibles en la pestaña Usuarios.
   *
   * No es fatal: cada documento que falle se devuelve como aviso (p. ej. los
   * documentos del vehículo si el conductor aún no tiene vehículo en la App).
   */
  static async replicateAllToSecondary(
    driverId: string,
    docs: Record<string, string | null | undefined>,
  ): Promise<{ replicated: string[]; warnings: string[] }> {
    const replicated: string[] = [];
    const warnings: string[] = [];
    for (const [field, url] of Object.entries(docs)) {
      const def = DOC_DEFS[field];
      if (!url || !def) continue;
      try {
        const file = await this.fetchPrimaryDocAsFile(field, url);
        await this.uploadToSecondary(field, file, driverId);
        replicated.push(def.label);
      } catch (e: any) {
        warnings.push(`${def.label}: ${e?.message || 'no se pudo replicar'}`);
      }
    }
    return { replicated, warnings };
  }

  /**
   * Devuelve, para un conductor, las URLs de cada documento existentes en la
   * base SECUNDARIA (App). Útil para mostrar el indicador "En App".
   */
  static async getSecondaryDocs(driverId: string): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    if (!supabaseSecondary) return result;

    const sb = supabaseSecondary as any;
    const userCols = Object.values(DOC_DEFS).filter(d => d.scope === 'user').map(d => d.field);
    const carCols = Object.values(DOC_DEFS).filter(d => d.scope === 'car').map(d => d.field);

    const { data: userRow } = await sb
      .from('users')
      .select(['id', ...userCols].join(','))
      .eq('id', driverId)
      .maybeSingle();
    if (userRow) {
      userCols.forEach(c => { result[c] = userRow[c] ?? null; });
    }

    const { data: carRow } = await sb
      .from('cars')
      .select(['id', ...carCols].join(','))
      .eq('driver_id', driverId)
      .maybeSingle();
    if (carRow) {
      carCols.forEach(c => { result[c] = carRow[c] ?? null; });
    }

    return result;
  }
}
