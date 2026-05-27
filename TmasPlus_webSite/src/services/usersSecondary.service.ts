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
    await syncSession();

    const payload: any = {
      ...(input.first_name !== undefined && { first_name: input.first_name }),
      ...(input.last_name !== undefined && { last_name: input.last_name }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.mobile !== undefined && { mobile: input.mobile }),
      ...(input.user_type !== undefined && { user_type: input.user_type }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.blocked !== undefined && { blocked: input.blocked }),
      ...(input.approved !== undefined && { approved: input.approved }),
      updated_at: new Date().toISOString(),
    };

    if (Object.keys(payload).length === 1) {
      throw new Error('No hay campos para actualizar');
    }

    const { data, error } = await sb
      .from('users')
      .update(payload)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar usuario');
    return data as SecondaryUser;
  }

  static async toggleBlock(
    id: string,
    blocked: boolean
  ): Promise<SecondaryUser> {
    return this.update(id, { blocked });
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
