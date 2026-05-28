import { supabase, supabaseSecondary } from '@/config/supabase';

export type MembershipStatus = 'ACTIVA' | 'INACTIVA' | 'CANCELADA' | 'VENCIDA';

export interface Membership {
  uid: string;
  conductor: string;
  status: MembershipStatus | string;
  costo: string | number;
  fecha_inicio: string;
  fecha_terminada: string;
  periodo: number;
  created_at: string;
  updated_at: string;
}

export interface MembershipUser {
  id: string;
  auth_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string | null;
  user_type: string;
  profile_image: string | null;
}

export interface MembershipCar {
  id: string;
  driver_id: string;
  plate: string | null;
  make: string | null;
  model: string | null;
}

export interface MembershipWithUser extends Membership {
  user?: MembershipUser | null;
  car?: MembershipCar | null;
}

export interface CreateMembershipInput {
  conductor: string;
  status?: MembershipStatus;
  costo: number;
  fecha_inicio: string;
  fecha_terminada: string;
  periodo: number;
}

const sb = supabaseSecondary as any;

async function syncSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('No hay sesión activa');
  // Set the token directly on the internal REST client to avoid a 403
  // when validating the JWT against a different Supabase auth server.
  sb.rest.headers['Authorization'] = `Bearer ${session.access_token}`;
}

export class MembershipsService {
  static async list(): Promise<MembershipWithUser[]> {
    const { data, error } = await sb
      .from('memberships')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message || 'Error al obtener membresías');

    const memberships: Membership[] = data || [];
    if (memberships.length === 0) return [];

    const conductorIds = Array.from(
      new Set(memberships.map((m) => m.conductor).filter(Boolean))
    );

    let usersByAuthId: Record<string, MembershipUser> = {};
    let carsByAuthId: Record<string, MembershipCar> = {};
    if (conductorIds.length > 0) {
      // memberships.conductor stores users.auth_id (see CreateMembershipModal).
      // Try matching by auth_id first; fall back to id for legacy rows.
      const { data: usersByAuth, error: usersAuthError } = await sb
        .from('users')
        .select('id, auth_id, first_name, last_name, email, mobile, user_type, profile_image')
        .in('auth_id', conductorIds);

      if (usersAuthError) throw new Error(usersAuthError.message);

      const matchedAuthIds = new Set(
        (usersByAuth || []).map((u: MembershipUser) => u.auth_id).filter(Boolean)
      );
      const unmatchedIds = conductorIds.filter((c) => !matchedAuthIds.has(c));

      let usersById: MembershipUser[] = [];
      if (unmatchedIds.length > 0) {
        const { data, error } = await sb
          .from('users')
          .select('id, auth_id, first_name, last_name, email, mobile, user_type, profile_image')
          .in('id', unmatchedIds);
        if (error) throw new Error(error.message);
        usersById = data || [];
      }

      const allUsers: MembershipUser[] = [...(usersByAuth || []), ...usersById];
      usersByAuthId = allUsers.reduce(
        (acc: Record<string, MembershipUser>, u: MembershipUser) => {
          // Index by both auth_id and id so we hit either lookup style.
          if (u.auth_id) acc[u.auth_id] = u;
          if (u.id) acc[u.id] = u;
          return acc;
        },
        {}
      );

      // cars.driver_id references users.id — use the resolved user ids.
      const userIds = allUsers.map((u) => u.id).filter(Boolean);
      if (userIds.length > 0) {
        const { data: cars, error: carsError } = await sb
          .from('cars')
          .select('id, driver_id, plate, make, model')
          .in('driver_id', userIds);
        if (carsError) throw new Error(carsError.message);

        const carsByUserId: Record<string, MembershipCar> = (cars || []).reduce(
          (acc: Record<string, MembershipCar>, c: MembershipCar) => {
            if (c.driver_id && !acc[c.driver_id]) acc[c.driver_id] = c;
            return acc;
          },
          {}
        );

        carsByAuthId = allUsers.reduce(
          (acc: Record<string, MembershipCar>, u: MembershipUser) => {
            const car = carsByUserId[u.id];
            if (!car) return acc;
            if (u.auth_id) acc[u.auth_id] = car;
            if (u.id) acc[u.id] = car;
            return acc;
          },
          {}
        );
      }
    }

    return memberships.map((m) => ({
      ...m,
      user: usersByAuthId[m.conductor] || null,
      car: carsByAuthId[m.conductor] || null,
    }));
  }

  static async searchUsers(
    query: string,
    limit = 10
  ): Promise<MembershipUser[]> {
    const q = query.trim();
    if (!q) return [];

    const term = `%${q}%`;
    const { data, error } = await sb
      .from('users')
      .select('id, auth_id, first_name, last_name, email, mobile, user_type, profile_image')
      .or(
        `first_name.ilike.${term},last_name.ilike.${term},email.ilike.${term},mobile.ilike.${term}`
      )
      .limit(limit);

    if (error) throw new Error(error.message || 'Error al buscar usuarios');
    return data || [];
  }

  static async create(input: CreateMembershipInput): Promise<Membership> {
    const payload = {
      conductor: input.conductor,
      status: input.status || 'ACTIVA',
      costo: input.costo,
      fecha_inicio: input.fecha_inicio,
      fecha_terminada: input.fecha_terminada,
      periodo: input.periodo,
    };

    const { data, error } = await sb
      .from('memberships')
      .insert(payload)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al crear membresía');
    return data as Membership;
  }

  static async updateStatus(
    uid: string,
    status: MembershipStatus
  ): Promise<Membership> {
    const { data, error } = await sb
      .from('memberships')
      .update({ status })
      .eq('uid', uid)
      .select()
      .single();

    if (error) throw new Error(error.message || 'Error al actualizar membresía');
    return data as Membership;
  }

  static async update(
    uid: string,
    input: Partial<CreateMembershipInput>
  ): Promise<Membership> {
    await syncSession();
    console.log("MembershipsService.update called with:", { uid, input });

    const payload: any = {
      ...(input.conductor !== undefined && { conductor: input.conductor }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.costo !== undefined && { costo: input.costo }),
      ...(input.fecha_inicio !== undefined && { fecha_inicio: input.fecha_inicio }),
      ...(input.fecha_terminada !== undefined && { fecha_terminada: input.fecha_terminada }),
      ...(input.periodo !== undefined && { periodo: input.periodo }),
    };

    console.log("Update payload:", payload);

    // If payload is empty, throw error
    if (Object.keys(payload).length === 0) {
      throw new Error("No fields to update");
    }

    // First, let's check if the record exists
    const { data: existing, error: fetchError } = await sb
      .from('memberships')
      .select('*')
      .eq('uid', uid)
      .single();

    console.log("Existing record:", existing, "Fetch error:", fetchError);

    if (fetchError) {
      throw new Error(`Record not found: ${fetchError.message}`);
    }

    const { data, error } = await sb
      .from('memberships')
      .update(payload)
      .eq('uid', uid)
      .select()
      .single();

    console.log("Supabase update response:", { data, error });

    if (error) throw new Error(error.message || 'Error al actualizar membresía');
    return data as Membership;
  }

  static async delete(uid: string): Promise<void> {
    await syncSession();
    const { error } = await sb
      .from('memberships')
      .delete()
      .eq('uid', uid);

    if (error) throw new Error(error.message || 'Error al eliminar membresía');
  }
}
