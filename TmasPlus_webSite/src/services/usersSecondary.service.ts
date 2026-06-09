import { supabase, supabaseSecondary } from '@/config/supabase';

export interface SecondaryUser {
  id: string;
  auth_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
  user_type: string | null;
  profile_image: string | null;
  blocked?: boolean | null;
  approved?: boolean | null;
  city?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  [key: string]: any;
}

export interface UpdateUserInput {
  first_name?: string;
  last_name?: string;
  email?: string;
  mobile?: string;
  user_type?: string;
  city?: string;
  blocked?: boolean;
  approved?: boolean;
}

export interface CreateUserInput {
  id?: string;
  auth_id?: string | null;
  first_name: string;
  last_name: string;
  email: string;
  mobile?: string | null;
  user_type: string;
  city?: string | null;
  referral_id?: string | null;
  [key: string]: any;
}

const sb = supabaseSecondary as any;

async function syncSession() {
  if (!sb) throw new Error('Cliente secundario no configurado');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa');
  sb.rest.headers['Authorization'] = `Bearer ${session.access_token}`;
}

export class UsersSecondaryService {
  static async list(): Promise<SecondaryUser[]> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();
    const { data, error } = await sb
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'Error al obtener usuarios');
    return (data || []) as SecondaryUser[];
  }

  static async create(input: CreateUserInput): Promise<SecondaryUser> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();

    const now = new Date().toISOString();
    const payload: any = {
      ...input,
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
    };

    const { data, error } = await sb
      .from('users')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear usuario en BD secundaria');
    return data as SecondaryUser;
  }

  static async update(
    id: string,
    input: UpdateUserInput
  ): Promise<SecondaryUser> {
    // El dashboard se autentica contra el proyecto PRIMARIO, por lo que su token
    // se trata como anon en el proyecto secundario: un UPDATE directo no afecta
    // filas y PostgREST no devuelve error (antes el cambio "se guardaba" pero no
    // persistía). Por eso, igual que toggleBlock/setApproved/delete, la
    // actualización se hace vía Edge Function con service role.
    const { user } = await this.updateViaFunction(id, { ...input });
    if (!user) throw new Error('No se pudo actualizar el usuario');
    return user;
  }

  /**
   * Actualiza la fila de `users` (y opcionalmente su `cars`) en la BD secundaria
   * mediante la Edge Function `update-user` (service role). Devuelve las filas
   * realmente guardadas para reflejarlas en la UI.
   */
  static async updateViaFunction(
    id: string,
    userFields: Record<string, any>,
    car?: { id: string } & Record<string, any>,
  ): Promise<{ user: SecondaryUser | null; car: any | null }> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('update-user', {
      body: { id, user: userFields, car },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al actualizar usuario';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.success) {
      throw new Error('No se pudo actualizar el usuario');
    }
    return { user: (data.user as SecondaryUser) ?? null, car: data.car ?? null };
  }

  static async toggleBlock(
    id: string,
    blocked: boolean
  ): Promise<SecondaryUser> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    // El dashboard se autentica contra el proyecto PRIMARIO, por lo que su token
    // no es válido para escribir en el proyecto secundario (se trata como anon y
    // el UPDATE no afecta filas -> 406). Por eso el bloqueo se hace vía Edge
    // Function con service role, igual que delete-user.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('set-user-blocked', {
      body: { id, blocked },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al cambiar el estado del usuario';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const errBody = await ctx.json();
          if (errBody?.error) message = errBody.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.user) {
      throw new Error('No se pudo cambiar el estado del usuario');
    }
    return data.user as SecondaryUser;
  }

  static async setApproved(
    id: string,
    approved: boolean
  ): Promise<SecondaryUser> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    // Igual que toggleBlock: el dashboard se autentica contra el proyecto
    // PRIMARIO, por lo que su token se trata como anon en el proyecto secundario
    // y el UPDATE directo no afecta filas (406). La aprobación/rechazo se hace
    // vía Edge Function con service role.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('set-user-approved', {
      body: { id, approved },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al cambiar el estado de aprobación';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const errBody = await ctx.json();
          if (errBody?.error) message = errBody.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.user) {
      throw new Error('No se pudo cambiar el estado de aprobación del usuario');
    }
    return data.user as SecondaryUser;
  }

  static async delete(id: string): Promise<void> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('delete-user', {
      body: { id },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al eliminar usuario';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (data?.authWarning) {
      console.warn('[delete-user]', data.authWarning);
    }
  }

  static async listIds(): Promise<Set<string>> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();
    const { data, error } = await sb.from('users').select('id');
    if (error) throw new Error(error.message || 'Error al obtener IDs de usuarios');
    return new Set((data || []).map((u: { id: string }) => u.id));
  }

  /**
   * Devuelve la cédula (document_number/document_type) de cada usuario por id,
   * leída de la BD secundaria (Dashboard). Sirve de respaldo para la pestaña
   * Conductores: si un conductor tiene la cédula solo en esta BD, igual se
   * muestra.
   */
  static async documentsByIds(
    ids: string[],
  ): Promise<Record<string, { document_number: string | null; document_type: string | null }>> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    const unique = Array.from(new Set(ids.filter(Boolean)));
    if (unique.length === 0) return {};
    await syncSession();
    const { data, error } = await sb
      .from('users')
      .select('id, document_number, document_type')
      .in('id', unique);
    if (error) {
      console.warn('[documentsByIds] No se pudo leer users:', error.message);
      return {};
    }
    const map: Record<string, { document_number: string | null; document_type: string | null }> = {};
    for (const row of (data || []) as Array<{ id: string; document_number: string | null; document_type: string | null }>) {
      map[row.id] = { document_number: row.document_number, document_type: row.document_type };
    }
    return map;
  }

  /**
   * Devuelve la categoría (service_type) del vehículo activo de cada conductor,
   * leída de la tabla cars de la BD secundaria (App). Prioriza el vehículo
   * activo y, ante varios, el más reciente. Mapea por driver_id, que puede ser
   * tanto users.id como users.auth_id (filas heredadas).
   */
  static async categoriesByDriver(
    driverIds: string[],
  ): Promise<Record<string, string>> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    const ids = Array.from(new Set(driverIds.filter(Boolean)));
    if (ids.length === 0) return {};
    await syncSession();
    const { data, error } = await sb
      .from('cars')
      .select('driver_id, service_type, is_active, updated_at')
      .in('driver_id', ids)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('[categoriesByDriver] No se pudo leer cars:', error.message);
      return {};
    }
    const map: Record<string, string> = {};
    for (const row of (data || []) as Array<{ driver_id: string; service_type: string | null }>) {
      // El primer registro por driver_id (gracias al order) es el preferido.
      if (row.driver_id && row.service_type && !map[row.driver_id]) {
        map[row.driver_id] = row.service_type;
      }
    }
    return map;
  }

  /**
   * Carga el usuario y su vehículo desde la base secundaria, sincronizando la
   * sesión para que las políticas RLS dejen leer ambas tablas. El vehículo se
   * busca por users.id y, como respaldo, por auth_id (filas heredadas).
   *
   * Si el conductor tiene varios vehículos se prioriza el activo (is_active);
   * solo si no hay ninguno activo se cae al más reciente.
   */
  static async getUserWithVehicle(
    userId: string,
    authId?: string | null,
  ): Promise<{ user: SecondaryUser | null; car: any | null }> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();

    const { data: user, error: userErr } = await sb
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (userErr && (userErr as any).code !== 'PGRST116') {
      throw new Error(userErr.message || 'Error al obtener usuario');
    }

    const driverIds = [userId, authId].filter(Boolean) as string[];
    const { data: cars, error: carErr } = await sb
      .from('cars')
      .select('*')
      .in('driver_id', driverIds)
      // El vehículo activo primero; ante empate, el más reciente.
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    if (carErr) {
      console.warn('[getUserWithVehicle] No se pudo leer cars:', carErr.message);
    }

    return { user: (user as SecondaryUser) ?? null, car: cars?.[0] ?? null };
  }

  static async existsById(id: string): Promise<boolean> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();
    const { data, error } = await sb.from('users').select('id').eq('id', id).maybeSingle();
    if (error && (error as any).code !== 'PGRST116') {
      throw new Error(error.message || 'Error al verificar usuario');
    }
    return !!data;
  }

  static async createDriverWithAuth(input: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    mobile?: string | null;
    city?: string | null;
    document_type?: string | null;
    document_number?: string | null;
    referral_id?: string | null;
    bank_number?: string | null;
    vehicle_type?: string | null;
    make?: string | null;
    model?: string | null;
    plate?: string | null;
    vehicle_year?: string | null;
  }): Promise<{ user: SecondaryUser; car: any }> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('create-driver', {
      body: input,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al crear conductor';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.user) throw new Error('Respuesta inválida de create-driver');
    return { user: data.user as SecondaryUser, car: data.car };
  }

  static async createCustomerWithAuth(input: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    mobile?: string | null;
    city?: string | null;
    document_type?: string | null;
    document_number?: string | null;
    referral_id?: string | null;
  }): Promise<SecondaryUser> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('create-customer', {
      body: input,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      let message = error.message || 'Error al crear cliente';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.user) throw new Error('Respuesta inválida de create-customer');
    return data.user as SecondaryUser;
  }

  static async importDriverWithAuth(driver: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    mobile?: string | null;
    city?: string | null;
    profile_image?: string | null;
    document_type?: string | null;
    document_number?: string | null;
    referral_id?: string | null;
    approved?: boolean | null;
    blocked?: boolean | null;
    vehicle?: {
      make?: string | null;
      model?: string | null;
      plate?: string | null;
      color?: string | null;
      fuel_type?: string | null;
      transmission?: string | null;
      capacity?: number | null;
      service_type?: string | null;
    } | null;
  }): Promise<{ user: SecondaryUser; authCreated: boolean; authWarning?: string }> {
    if (!sb) throw new Error('Cliente secundario no configurado');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No hay sesión activa');

    const { data, error } = await sb.functions.invoke('import-driver', {
      body: driver,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      // functions.invoke envuelve el error HTTP; intentar extraer mensaje del cuerpo
      let message = error.message || 'Error al importar conductor';
      const ctx: any = (error as any).context;
      if (ctx && typeof ctx.json === 'function') {
        try {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        } catch { /* noop */ }
      }
      throw new Error(message);
    }

    if (!data?.user) throw new Error('Respuesta inválida de import-driver');
    return {
      user: data.user as SecondaryUser,
      authCreated: !!data.authCreated,
      authWarning: data.authWarning,
    };
  }
}
