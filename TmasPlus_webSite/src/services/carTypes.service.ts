import supabase, { supabaseSecondary } from '@/config/supabase';
import type { CarTypeRow, CarTypeInsert, CarTypeUpdate } from '@/config/database.types';

const sb = supabaseSecondary as any;
const TABLE = 'car_types' as const;

export class CarTypesService {
  /** Obtener todas las categorías activas */
  static async getAll(): Promise<CarTypeRow[]> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /** Obtener solo las activas (para selects) */
  static async getActive(): Promise<CarTypeRow[]> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /** Obtener una categoría por ID */
  static async getById(id: string): Promise<CarTypeRow | null> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;
    return data;
  }

  /** Crear nueva categoría */
  static async create(payload: CarTypeInsert): Promise<CarTypeRow> {
    const { data, error } = await sb
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /** Actualizar categoría existente */
  static async update(id: string, payload: CarTypeUpdate): Promise<CarTypeRow> {
    const { data, error } = await sb
      .from(TABLE)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /** Desactivar (soft-delete) */
  static async deactivate(id: string): Promise<void> {
    const { error } = await sb
      .from(TABLE)
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
  }

  /** Eliminar permanentemente */
  static async remove(id: string): Promise<void> {
    const { error } = await sb
      .from(TABLE)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }

  /** Subir imagen de categoría y devolver URL pública */
  static async uploadImage(file: File, categoryName: string): Promise<string> {
    const ext = file.name.split('.').pop();
    const fileName = `car-types/${Date.now()}_${categoryName.replace(/\s+/g, '_')}.${ext}`;

    const { error: upErr } = await sb.storage
      .from('public-site-assets')
      .upload(fileName, file, { upsert: true });

    if (upErr) throw upErr;

    const { data } = supabase.storage
      .from('public-site-assets')
      .getPublicUrl(fileName);

    return data.publicUrl;
  }
}
