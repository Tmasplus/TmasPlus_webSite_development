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
    const { data, error } = await sb
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'Error al obtener usuarios');
    return (data || []) as SecondaryUser[];
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
    await syncSession();
    const { error } = await sb.from('users').delete().eq('id', id);
    if (error) throw new Error(error.message || 'Error al eliminar usuario');
  }
}
