import { supabaseSecondary } from '@/config/supabase';

/**
 * Servicio de Marcas de Vehículos (catálogo `car_brands`).
 *
 * Catalogo normalizado de core mediante public.web_car_brands.
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
const TABLE = 'web_car_brands' as const;

/** Uso de una marca: vehículos y conductores distintos que la tienen guardada */
export interface CarBrandUsage {
  vehicles: number;
  drivers: number;
}

/** Quita espacios sobrantes (extremos y repetidos) */
export const normalizeBrandName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ');

/** Clave para detectar marcas "iguales" (sin mayúsculas ni espacios de más) */
export const brandKey = (name: string): string =>
  normalizeBrandName(name).toLowerCase();

/** Deja una sola marca por clave, conservando la primera (la lista llega ordenada) */
const dedupeBrands = (rows: CarBrandRow[]): CarBrandRow[] => {
  const seen = new Set<string>();
  return rows.filter((b) => {
    const key = brandKey(b.name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

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

  /** Solo las marcas activas y sin repetir (lo que la App debería mostrar en el selector) */
  static async getActive(): Promise<CarBrandRow[]> {
    const { data, error } = await sb
      .from(TABLE)
      .select('*')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;
    return dedupeBrands(data ?? []);
  }

  /**
   * Vehículos y conductores por marca, indexado por el nombre exacto de la marca.
   * Se calcula desde web_cars (make = nombre del catálogo), sin cambios en core.
   */
  static async getUsageByName(): Promise<Record<string, CarBrandUsage>> {
    const { data, error } = await sb
      .from('web_cars')
      .select('make, driver_id')
      .not('make', 'is', null)
      .range(0, 9999);

    if (error) throw error;

    const drivers: Record<string, Set<string>> = {};
    const usage: Record<string, CarBrandUsage> = {};
    for (const row of (data ?? []) as Array<{ make: string; driver_id: string | null }>) {
      const u = (usage[row.make] ??= { vehicles: 0, drivers: 0 });
      u.vehicles += 1;
      if (row.driver_id) {
        const set = (drivers[row.make] ??= new Set());
        set.add(row.driver_id);
        u.drivers = set.size;
      }
    }
    return usage;
  }

  /** Falla si ya existe otra marca equivalente (ignora mayúsculas y espacios) */
  private static async assertNotDuplicated(name: string, exceptId?: string): Promise<void> {
    const key = brandKey(name);
    const all = await this.getAll();
    const clash = all.find((b) => b.id !== exceptId && brandKey(b.name) === key);
    if (clash) throw new Error(`Ya existe la marca "${clash.name}"`);
  }

  /** Crear una nueva marca */
  static async create(payload: CarBrandInsert): Promise<CarBrandRow> {
    const name = normalizeBrandName(payload.name);
    if (!name) throw new Error('El nombre de la marca es obligatorio');
    await this.assertNotDuplicated(name);

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
    const patch: CarBrandUpdate = {
      ...payload,
    };
    if (typeof patch.name === 'string') {
      patch.name = normalizeBrandName(patch.name);
      if (!patch.name) throw new Error('El nombre de la marca es obligatorio');
      await this.assertNotDuplicated(patch.name, id);
    }

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
