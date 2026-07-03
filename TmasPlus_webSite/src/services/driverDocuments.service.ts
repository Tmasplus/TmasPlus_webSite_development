import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, supabaseSecondary } from '@/config/supabase';
import { StorageService } from './storage.service';

/**
 * Devuelve el cliente (primario o secundario) cuyo host coincide con el de la
 * URL de storage. `null` si no coincide con ninguno de los proyectos conocidos.
 */
function clientForHost(host: string): SupabaseClient | null {
  try {
    const primary = (import.meta as any).env?.VITE_SUPABASE_URL;
    if (primary && new URL(primary).host === host) return supabase;
  } catch { /* noop */ }
  try {
    const secondary = (import.meta as any).env?.VITE_SUPABASE_SECONDARY_URL;
    if (secondary && supabaseSecondary && new URL(secondary).host === host) return supabaseSecondary;
  } catch { /* noop */ }
  return null;
}

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

// Escapa los comodines de LIKE/ILIKE (% y _) para buscar emails literalmente.
function likeEscape(value: string): string {
  return value.replace(/([\\%_])/g, '\\$1');
}

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
   * Convierte una referencia de documento almacenada en una URL abrible.
   *
   * El mismo documento puede haber sido guardado por dos pipelines distintos:
   *  - App móvil → URL ya firmada (`/object/sign/…?token=`) sobre un bucket que
   *    el dashboard (anon del secundario) NO siempre puede re-firmar; su token
   *    embebido ya es válido, así que se devuelve tal cual.
   *  - Sitio web → URL pública (`/object/public/…`) sobre un bucket PRIVADO, que
   *    da 404 al abrirla directo; se re-firma con el proyecto correcto. Se prueba
   *    primero el cliente cuyo host coincide y, si falla (por el doble pipeline
   *    el objeto puede vivir en el otro proyecto), se prueban los demás.
   *
   * Si nada resuelve, se devuelve la referencia original para no romper el enlace.
   */
  static async resolveViewUrl(ref?: string | null): Promise<string | null> {
    if (!ref) return null;

    // URL ya firmada: el token embebido es válido; no intentar re-firmar (el
    // dashboard puede no tener permiso sobre ese bucket, p. ej. user-documents).
    if (ref.includes('/object/sign/')) return ref;

    let bucket = '';
    let objectPath = '';
    let hostClient: SupabaseClient | null = null;

    if (ref.includes('/object/public/')) {
      try { hostClient = clientForHost(new URL(ref).host); } catch { /* noop */ }
      const after = ref.split('/object/public/')[1]?.split('?')[0] ?? '';
      const segs = after.split('/');
      bucket = segs.shift() ?? '';
      objectPath = segs.join('/');
    } else if (!/^https?:\/\//i.test(ref)) {
      // Ruta cruda "bucket/objeto".
      const segs = ref.replace(/^\/+/, '').split('/');
      bucket = segs.shift() ?? '';
      objectPath = segs.join('/');
    } else {
      // URL http externa desconocida: usar tal cual.
      return ref;
    }

    if (!bucket || !objectPath) return ref;

    // Clientes a probar, sin duplicados: el del host primero, luego el secundario
    // (donde suelen vivir los documentos de la App) y por último el primario.
    const clients: SupabaseClient[] = [];
    for (const c of [hostClient, supabaseSecondary, supabase]) {
      if (c && !clients.includes(c)) clients.push(c);
    }

    for (const client of clients) {
      try {
        const { data, error } = await client.storage.from(bucket).createSignedUrl(objectPath, 3600);
        if (!error && data?.signedUrl) return data.signedUrl;
      } catch { /* probar el siguiente cliente */ }
    }
    return ref;
  }

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
  static async uploadToSecondary(
    field: string,
    file: File,
    driverId: string,
    email?: string | null,
  ): Promise<string | null> {
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
        // Respaldo para resolver al conductor en la App cuando su id no
        // coincide con el del proyecto primario.
        email: email ?? undefined,
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
    email?: string | null,
  ): Promise<UploadDocResult> {
    const primaryUrl = await this.uploadToPrimary(field, file, driverId, carId);
    let secondaryUrl: string | null = null;
    let secondaryWarning: string | undefined;
    try {
      secondaryUrl = await this.uploadToSecondary(field, file, driverId, email);
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
    email?: string | null,
  ): Promise<{ replicated: string[]; warnings: string[] }> {
    const replicated: string[] = [];
    const warnings: string[] = [];
    for (const [field, url] of Object.entries(docs)) {
      const def = DOC_DEFS[field];
      if (!url || !def) continue;
      try {
        const file = await this.fetchPrimaryDocAsFile(field, url);
        await this.uploadToSecondary(field, file, driverId, email);
        replicated.push(def.label);
      } catch (e: any) {
        warnings.push(`${def.label}: ${e?.message || 'no se pudo replicar'}`);
      }
    }
    return { replicated, warnings };
  }

  /**
   * Devuelve, para un conductor, las URLs de cada documento existentes en la
   * base PRIMARIA (panel). Complemento de getSecondaryDocs: cuando el modal se
   * abre desde la lista de la App (fila secundaria), el vehículo adjunto es el
   * de la App y los documentos subidos por el panel (tabla cars del primario)
   * quedaban invisibles como "Falta" aunque existieran.
   */
  static async getPrimaryDocs(driverId: string, email?: string | null): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    const sb = supabase as any;
    const userCols = Object.values(DOC_DEFS).filter(d => d.scope === 'user').map(d => d.field);
    const carCols = Object.values(DOC_DEFS).filter(d => d.scope === 'car').map(d => d.field);

    let { data: userRow } = await sb
      .from('users')
      .select(['id', ...userCols].join(','))
      .eq('id', driverId)
      .maybeSingle();
    if (!userRow && email) {
      const { data: byEmail } = await sb
        .from('users')
        .select(['id', ...userCols].join(','))
        .ilike('email', likeEscape(email.trim()))
        .limit(1);
      if (byEmail?.[0]) userRow = byEmail[0];
    }
    if (userRow) {
      userCols.forEach(c => { result[c] = userRow[c] ?? null; });
    }

    const { data: carRows } = await sb
      .from('cars')
      .select(['id', ...carCols].join(','))
      .eq('driver_id', userRow?.id ?? driverId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    const carRow = carRows?.[0];
    if (carRow) {
      carCols.forEach(c => { result[c] = carRow[c] ?? null; });
    }

    return result;
  }

  /**
   * Devuelve, para un conductor, las URLs de cada documento existentes en la
   * base SECUNDARIA (App). Útil para mostrar el indicador "En App".
   *
   * Los documentos del vehículo pueden vivir en dos sitios: la tabla `cars`
   * (pipeline web) o la propia fila de `users` (la App móvil los guarda ahí,
   * con `card_prop_image_bk` en vez de `card_prop_image_back`). Se lee `cars`
   * y se completa lo que falte con las columnas de `users`.
   */
  static async getSecondaryDocs(driverId: string, email?: string | null): Promise<Record<string, string | null>> {
    const result: Record<string, string | null> = {};
    if (!supabaseSecondary) return result;

    const sb = supabaseSecondary as any;
    const userCols = Object.values(DOC_DEFS).filter(d => d.scope === 'user').map(d => d.field);
    const carCols = Object.values(DOC_DEFS).filter(d => d.scope === 'car').map(d => d.field);
    // Columnas de vehículo que la App escribe sobre users: campo en DOC_DEFS → columna en users.
    const legacyCarColsOnUsers: Record<string, string> = {
      card_prop_image: 'card_prop_image',
      card_prop_image_back: 'card_prop_image_bk',
      soat_image: 'soat_image',
      car_image_1: 'car_image',
    };

    let { data: userRow } = await sb
      .from('users')
      .select(['id', ...userCols, ...Object.values(legacyCarColsOnUsers)].join(','))
      .eq('id', driverId)
      .maybeSingle();
    // Respaldo por email: el conductor puede existir en la App con un id
    // distinto al del proyecto primario (registro directo en la App).
    if (!userRow && email) {
      const { data: byEmail } = await sb
        .from('users')
        .select(['id', ...userCols, ...Object.values(legacyCarColsOnUsers)].join(','))
        .ilike('email', likeEscape(email.trim()))
        .limit(1);
      if (byEmail?.[0]) userRow = byEmail[0];
    }
    if (userRow) {
      userCols.forEach(c => { result[c] = userRow[c] ?? null; });
    }

    // limit(1) con orden: con varios vehículos, maybeSingle() falla y el
    // indicador "En App" quedaba vacío. Se muestra el activo/más reciente.
    const { data: carRows } = await sb
      .from('cars')
      .select(['id', ...carCols].join(','))
      .eq('driver_id', userRow?.id ?? driverId)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    const carRow = carRows?.[0];
    if (carRow) {
      carCols.forEach(c => { result[c] = carRow[c] ?? null; });
    }

    // Fallback: completar documentos de vehículo ausentes en `cars` con los
    // que la App guardó en la fila de `users` (URLs firmadas). Se ignoran
    // cadenas vacías, que la App deja en columnas sin documento.
    if (userRow) {
      for (const [field, userCol] of Object.entries(legacyCarColsOnUsers)) {
        if (!result[field]) {
          const v = userRow[userCol];
          result[field] = typeof v === 'string' && v.trim() ? v : result[field] ?? null;
        }
      }
    }

    return result;
  }
}
