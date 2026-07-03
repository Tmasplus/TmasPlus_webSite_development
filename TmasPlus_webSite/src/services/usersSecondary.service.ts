import { supabase, supabaseSecondary } from '@/config/supabase';
import { carTypeLabelForServiceType } from '@/utils/vehicleCategory';

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

  /**
   * Propaga la categoría (service_type) del vehículo a la BD de la App
   * (secundaria) para que el conductor la vea reflejada. La App lee la categoría
   * de la secundaria (cars.service_type + users.car_type denormalizado); cuando
   * el admin edita desde la pestaña Conductores el guardado va al proyecto
   * primario, así que sin esta propagación el cambio no llegaba a la App.
   *
   * Resuelve al conductor por id y, como respaldo, por email (su id en la App
   * puede no coincidir con el del primario). El vehículo se resuelve por
   * driver_id = users.id o auth_id (filas heredadas), priorizando el activo/más
   * reciente. Best-effort: devuelve { synced:false } si no existe en la App.
   */
  static async syncCategory(input: {
    id: string;
    email?: string | null;
    authId?: string | null;
    serviceType: string;
  }): Promise<{ synced: boolean; reason?: string }> {
    if (!sb) return { synced: false, reason: 'sin-cliente-secundario' };
    await syncSession();

    // 1. Resolver la fila users en la App (por id; respaldo por email).
    let { data: user } = await sb
      .from('users')
      .select('id, auth_id')
      .eq('id', input.id)
      .maybeSingle();
    if (!user && input.email) {
      const { data: byEmail } = await sb
        .from('users')
        .select('id, auth_id')
        .ilike('email', input.email.trim())
        .limit(1);
      user = byEmail?.[0] ?? null;
    }
    if (!user) return { synced: false, reason: 'no-esta-en-app' };

    // 2. Resolver el vehículo activo/más reciente del conductor.
    const driverIds = Array.from(
      new Set([user.id, user.auth_id, input.authId].filter(Boolean) as string[])
    );
    const { data: cars } = await sb
      .from('cars')
      .select('id')
      .in('driver_id', driverIds)
      .order('is_active', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(1);
    const car = cars?.[0] ?? null;

    const carType = carTypeLabelForServiceType(input.serviceType);
    const userFields: Record<string, any> = {};
    if (carType) userFields.car_type = carType;

    // Nada que escribir (categoría desconocida y sin vehículo): no forzar la
    // Edge Function, que rechazaría un payload vacío.
    if (!car && Object.keys(userFields).length === 0) {
      return { synced: false, reason: 'sin-datos-que-sincronizar' };
    }

    await this.updateViaFunction(
      user.id,
      userFields,
      car ? { id: car.id, service_type: input.serviceType } : undefined,
    );
    return { synced: true, reason: car ? undefined : 'sin-vehiculo-en-app' };
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

  /**
   * Índice de acceso a la App: ids y emails de todos los usuarios de la BD
   * secundaria. Se pagina de a 1000 filas para superar el límite por defecto
   * de PostgREST (sin esto, los conductores más allá de la fila 1000
   * aparecían "Sin acceso"). El email permite reconocer conductores
   * importados cuyo id en la App no coincide con el del proyecto primario.
   */
  static async listAccessIndex(): Promise<{
    ids: Set<string>;
    emailById: Record<string, string>;
    idByEmail: Record<string, string>;
  }> {
    if (!sb) throw new Error('Cliente secundario no configurado');
    await syncSession();
    const ids = new Set<string>();
    const emailById: Record<string, string> = {};
    const idByEmail: Record<string, string> = {};
    const pageSize = 1000;
    // Se avanza por las filas realmente recibidas (el max_rows del API puede
    // ser menor a pageSize) y se ordena por id para que las páginas sean
    // estables aunque haya inserciones entre peticiones.
    for (let from = 0; ; ) {
      const { data, error } = await sb
        .from('users')
        .select('id, email')
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1);
      // PGRST103: rango fuera del total → fin de la lista, no es un error.
      if (error && (error as { code?: string }).code === 'PGRST103') break;
      if (error) throw new Error(error.message || 'Error al obtener usuarios de la App');
      const rows = (data || []) as Array<{ id: string; email: string | null }>;
      if (rows.length === 0) break;
      for (const row of rows) {
        ids.add(row.id);
        const email = row.email?.trim();
        if (email) {
          emailById[row.id] = email;
          idByEmail[email.toLowerCase()] = row.id;
        }
      }
      from += rows.length;
    }
    return { ids, emailById, idByEmail };
  }

  static async listIds(): Promise<Set<string>> {
    return (await this.listAccessIndex()).ids;
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
