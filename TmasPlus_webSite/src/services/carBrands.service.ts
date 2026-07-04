import { supabaseSecondary } from '@/config/supabase';

/**
 * Servicio de Marcas de Vehículos (catálogo `car_brands`).
 *
 * Vive en el proyecto Supabase SECUNDARIO (utof / el de la App), por eso usa
 * `supabaseSecondary`. La App lee de esta misma tabla para poblar el selector
 * de marca al registrar un vehículo, y guarda el `name` en `cars.make`.
 */

export interface CarBrandRow {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CarBrandInsert {
  name: string;
  is_active?: boolean;
}

export interface CarBrandUpdate {
  name?: string;
  is_active?: boolean;
}

const sb = supabaseSecondary as any;
const TABLE = 'car_brands' as const;

export class CarBrandsService {
  /** Todas las marcas (activas e inactivas), ordenadas por nombre */
  static async getAll(): Promise<CarBrandRow[]> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /** Solo las marcas activas (lo que la App debería mostrar en el selector) */
  static async getActive(): Promise<CarBrandRow[]> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return data ?? [];
  }

  /** Crear una nueva marca */
  static async create(payload: CarBrandInsert): Promise<CarBrandRow> {
    const name = payload.name.trim();
    if (!name) throw new Error('El nombre de la marca es obligatorio');

    const { data, error } = await sb
      .from(TABLE)
      .insert({ name, is_active: payload.is_active ?? true })
      .select()
      .single();

    if (error) {
      // 23505 = violación de UNIQUE (marca duplicada)
      if (error.code === '23505') {
        throw new Error(`La marca "${name}" ya existe`);
      }
      throw error;
    }
    return data;
  }

  /** Actualizar una marca (renombrar o activar/desactivar) */
  static async update(id: string, payload: CarBrandUpdate): Promise<CarBrandRow> {
    const patch: CarBrandUpdate & { updated_at: string } = {
      ...payload,
      updated_at: new Date().toISOString(),
    };
    if (typeof patch.name === 'string') patch.name = patch.name.trim();

    const { data, error } = await sb
      .from(TABLE)
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error(`Ya existe otra marca con el nombre "${patch.name}"`);
      }
      throw error;
    }
    return data;
  }

  /** Activar / desactivar (soft-delete: la App deja de mostrarla) */
  static async setActive(id: string, isActive: boolean): Promise<CarBrandRow> {
    return this.update(id, { is_active: isActive });
  }

  /** Eliminar permanentemente */
  static async remove(id: string): Promise<void> {
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) throw error;
  }
}
