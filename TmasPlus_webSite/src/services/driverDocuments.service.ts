import { supabase } from '@/config/supabase';
import { StorageService } from './storage.service';
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


export interface UploadDocResult { primaryUrl: string; secondaryUrl: string | null; secondaryWarning?: string; }
export class DriverDocumentsService {
  static async resolveViewUrl(ref?: string | null): Promise<string | null> {
    if (!ref) return null;
    let path = ref;
    if (/^https?:\/\//i.test(ref)) {
      const url = new URL(ref);
      if (url.origin !== new URL(import.meta.env.VITE_SUPABASE_URL).origin) {
        throw new Error('El archivo pertenece a otro servidor. Debe migrarse al Storage de core.');
      }
      const match = url.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/(.+)/);
      if (!match) throw new Error('Referencia de Storage no reconocida');
      path = decodeURIComponent(match[1]);
    }
    const [bucket, ...parts] = path.replace(/^\/+/, '').split('/');
    if (!bucket || !parts.length) throw new Error('El documento requiere una ruta bucket/archivo de core');
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(parts.join('/'), 3600);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }
  static async uploadToPrimary(field: string, file: File, driverId: string, carId?: string | null): Promise<string> {
    const def = DOC_DEFS[field];
    if (!def) throw new Error('Documento no soportado: '+field);
    if (def.scope === 'car' && !carId) throw new Error('El conductor no tiene vehículo');
    const owner = def.scope === 'car' ? carId! : driverId;
    const result = await StorageService.uploadFile({bucket:def.bucket,folder:owner,file,
      filename:field+'_'+crypto.randomUUID()+'.'+(file.name.split('.').pop() || 'jpg'),
      allowedTypes:def.accept.includes('pdf') ? ['image/jpeg','image/png','application/pdf'] : ['image/jpeg','image/png']});
    if (!result.success || !result.url) throw new Error(result.error || 'No se pudo subir el archivo');
    const {error} = await (supabase as any).from(def.scope === 'car' ? 'web_cars' : 'web_users')
      .update({[field]:result.url}).eq('id',owner).select('id').single();
    if (error) throw new Error('Archivo subido; no se pudo asociar al registro: '+error.message);
    return result.url;
  }
  // Alias conservados para componentes existentes: todos operan exclusivamente en core.
  static async uploadToSecondary(field:string,file:File,driverId:string,_email?:string|null):Promise<string|null> {
    const {data,error} = await (supabase as any).from('web_cars').select('id').eq('driver_id',driverId)
      .order('is_active',{ascending:false}).order('updated_at',{ascending:false}).limit(1);
    if(error) throw new Error(error.message);
    return this.uploadToPrimary(field,file,driverId,data?.[0]?.id);
  }
  static async uploadBoth(field:string,file:File,driverId:string,carId?:string|null,_email?:string|null):Promise<UploadDocResult> {
    const url = await this.uploadToPrimary(field,file,driverId,carId);
    return {primaryUrl:url,secondaryUrl:url};
  }
  static async replicateAllToSecondary(_driverId:string,_docs:Record<string,string|null|undefined>,_email?:string|null) {
    // No existe una segunda base: no duplicar archivos ni descargar desde otros proyectos.
    return {replicated:[] as string[],warnings:[] as string[]};
  }
  static async getPrimaryDocs(driverId:string,_email?:string|null):Promise<Record<string,string|null>> {
    const db = supabase as any;
    const [user,car] = await Promise.all([
      db.from('web_users').select('*').eq('id',driverId).maybeSingle(),
      db.from('web_cars').select('*').eq('driver_id',driverId).order('is_active',{ascending:false})
        .order('updated_at',{ascending:false}).limit(1)]);
    if(user.error || car.error) throw new Error(user.error?.message || car.error?.message);
    return Object.fromEntries(Object.values(DOC_DEFS).map(d=>[d.field,
      (d.scope === 'car' ? car.data?.[0] : user.data)?.[d.field] ?? null]));
  }
  static async getSecondaryDocs(driverId:string,email?:string|null) { return this.getPrimaryDocs(driverId,email); }
}
