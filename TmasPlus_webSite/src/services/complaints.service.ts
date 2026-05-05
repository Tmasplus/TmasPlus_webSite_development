import { supabase, supabaseSecondary } from '@/config/supabase';
import type {
  ComplaintRow,
  ComplaintInsert,
  ComplaintUpdate,
  ComplaintWithUser,
  ComplaintFilters,
  ComplaintStatus,
  PaginatedResult,
  PaginationOptions,
  UserRow,
} from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

const sb = supabaseSecondary as any;

async function syncSession() {
  const { data: { session } } = await supabase.auth.getSession();
  console.log('[complaints] syncSession token:', session?.access_token ? '✅ OK' : '❌ null');
  if (!session?.access_token) throw new Error('No hay sesión activa');
  sb.rest.headers['Authorization'] = `Bearer ${session.access_token}`;
}

type UserSnippet = Pick<UserRow, 'id' | 'first_name' | 'last_name' | 'email' | 'mobile'>;

async function fetchUsersById(ids: string[]): Promise<Record<string, UserSnippet>> {
  if (ids.length === 0) return {};
  const { data, error } = await sb
    .from('users')
    .select('id, first_name, last_name, email, mobile')
    .in('id', ids);
  if (error) throw new Error(error.message);
  return (data || []).reduce((acc: Record<string, UserSnippet>, u: UserSnippet) => {
    acc[u.id] = u;
    return acc;
  }, {});
}

export class ComplaintsService {
  static async getComplaints(
    filters: ComplaintFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<ComplaintWithUser>> {
    try {
      await syncSession();
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      let query = sb
        .from('complaints')
        .select('*', { count: 'exact' });

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.priority && filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters.complaint_type && filters.complaint_type !== 'all') {
        query = query.eq('complaint_type', filters.complaint_type);
      }
      if (filters.user_type && filters.user_type !== 'all') {
        query = query.eq('user_type', filters.user_type);
      }
      if (filters.searchQuery) {
        const q = filters.searchQuery.replace(/[%,]/g, '');
        query = query.or(`subject.ilike.%${q}%,body.ilike.%${q}%`);
      }

      query = query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      const { data, error, count } = await query;

      console.log('[complaints] raw result:', { count, rows: data?.length, error, firstRow: data?.[0] });

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener quejas',
          error.message
        );
      }

      const complaints: ComplaintRow[] = data || [];
      const userIds = Array.from(
        new Set(complaints.map((c: ComplaintRow) => c.user_id).filter(Boolean))
      );
      const usersById = await fetchUsersById(userIds);

      const total = count || 0;
      const totalPages = Math.ceil(total / limit) || 1;

      return {
        data: complaints.map((c: ComplaintRow) => ({ ...c, user: usersById[c.user_id] || null })),
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ComplaintsService.getComplaints');
    }
  }

  static async getComplaintById(id: string): Promise<ComplaintWithUser | null> {
    try {
      await syncSession();
      const { data, error } = await sb
        .from('complaints')
        .select('*')
        .eq('id', id)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener queja',
          error.message
        );
      }

      if (!data) return null;

      const usersById = await fetchUsersById([data.user_id]);
      return { ...data, user: usersById[data.user_id] || null } as ComplaintWithUser;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ComplaintsService.getComplaintById');
    }
  }

  static async createComplaint(payload: ComplaintInsert): Promise<ComplaintRow> {
    try {
      await syncSession();
      const { data, error } = await sb
        .from('complaints')
        .insert(payload)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al crear queja',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ComplaintsService.createComplaint');
    }
  }

  static async updateComplaint(
    id: string,
    updates: ComplaintUpdate
  ): Promise<ComplaintRow> {
    try {
      await syncSession();
      const { data, error } = await sb
        .from('complaints')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al actualizar queja',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ComplaintsService.updateComplaint');
    }
  }

  static async setStatus(
    id: string,
    status: ComplaintStatus,
    adminId?: string | null
  ): Promise<ComplaintRow> {
    const updates: ComplaintUpdate = { status };
    if (status === 'resolved') {
      updates.resolved_by = adminId ?? null;
      updates.resolved_at = new Date().toISOString();
    } else {
      updates.resolved_by = null;
      updates.resolved_at = null;
    }
    return this.updateComplaint(id, updates);
  }

  static async respond(
    id: string,
    adminResponse: string,
    adminId: string | null,
    markResolved: boolean
  ): Promise<ComplaintRow> {
    const updates: ComplaintUpdate = {
      admin_response: adminResponse,
      status: markResolved ? 'resolved' : 'in_progress',
    };
    if (markResolved) {
      updates.resolved_by = adminId;
      updates.resolved_at = new Date().toISOString();
    }
    return this.updateComplaint(id, updates);
  }

  static async getStats(): Promise<{
    total: number;
    pending: number;
    in_progress: number;
    resolved: number;
    rejected: number;
    high_priority_open: number;
  }> {
    try {
      await syncSession();
      const { data, error } = await sb
        .from('complaints')
        .select('status, priority');

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener estadísticas de quejas',
          error.message
        );
      }

      const rows = (data || []) as Pick<ComplaintRow, 'status' | 'priority'>[];

      return {
        total: rows.length,
        pending: rows.filter((r) => r.status === 'pending').length,
        in_progress: rows.filter((r) => r.status === 'in_progress').length,
        resolved: rows.filter((r) => r.status === 'resolved').length,
        rejected: rows.filter((r) => r.status === 'rejected').length,
        high_priority_open: rows.filter(
          (r) => r.priority === 'alta' && r.status !== 'resolved' && r.status !== 'rejected'
        ).length,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'ComplaintsService.getStats');
    }
  }

  static parseEvidenceUrls(value: ComplaintRow['evidence_urls']): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed)
          ? parsed.filter((v): v is string => typeof v === 'string')
          : [];
      } catch {
        return [];
      }
    }
    return [];
  }
}
