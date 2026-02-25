import { supabase } from '@/config/supabase';
import type {
  UserRow,
  UserInsert,
  UserUpdate,
  DriverFilters,
  PaginatedResult,
  PaginationOptions,
} from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

/**
 * Servicio de Usuarios de T+Plus Dashboard
 * Maneja todas las operaciones relacionadas con usuarios
 */
export class UsersService {
  /**
   * Obtiene un usuario por ID
   */
  static async getUserById(userId: string): Promise<UserRow | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener usuario',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getUserById');
    }
  }

  /**
   * Obtiene un usuario por email
   */
  static async getUserByEmail(email: string): Promise<UserRow | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al buscar usuario por email',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getUserByEmail');
    }
  }

  /**
   * Obtiene un usuario por auth_id (ID de Supabase Auth)
   */
  static async getUserByAuthId(authId: string): Promise<UserRow | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_id', authId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al buscar usuario por auth_id',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getUserByAuthId');
    }
  }

  /**
   * Crea un nuevo usuario
   */
  static async createUser(userData: UserInsert): Promise<UserRow> {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al crear usuario',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.createUser');
    }
  }

  /**
   * Actualiza un usuario existente
   */
  static async updateUser(userId: string, updates: UserUpdate): Promise<UserRow> {
    try {
      const { data, error } = await supabase
        .from('users')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al actualizar usuario',
          error.message
        );
      }

      return data;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.updateUser');
    }
  }

  /**
   * Elimina un usuario (soft delete: marca como bloqueado)
   */
  static async deleteUser(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({
          blocked: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al eliminar usuario',
          error.message
        );
      }

      return true;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.deleteUser');
    }
  }

  /**
   * Bloquea o desbloquea un usuario
   */
  static async toggleUserBlock(userId: string, blocked: boolean): Promise<UserRow> {
    try {
      return await this.updateUser(userId, { blocked });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.toggleUserBlock');
    }
  }

  /**
   * Aprueba o rechaza un conductor
   */
  static async updateDriverApproval(
    userId: string,
    approved: boolean
  ): Promise<UserRow> {
    try {
      return await this.updateUser(userId, { approved });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.updateDriverApproval');
    }
  }

  /**
   * Actualiza el estado activo de un conductor
   */
  static async updateDriverActiveStatus(
    userId: string,
    isActive: boolean
  ): Promise<UserRow> {
    try {
      return await this.updateUser(userId, { driver_active_status: isActive });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.updateDriverActiveStatus');
    }
  }

  /**
   * Obtiene todos los conductores con filtros y paginación
   */
  static async getDrivers(
    filters: DriverFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      // Construir query base
      let query = supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('user_type', 'driver');

      // Aplicar filtros
      if (filters.approved !== undefined && filters.approved !== null) {
        query = query.eq('approved', filters.approved);
      }

      if (filters.blocked !== undefined) {
        query = query.eq('blocked', filters.blocked);
      }

      if (filters.city) {
        query = query.eq('city', filters.city);
      }

      if (filters.searchQuery) {
        query = query.or(
          `first_name.ilike.%${filters.searchQuery}%,last_name.ilike.%${filters.searchQuery}%,email.ilike.%${filters.searchQuery}%,mobile.ilike.%${filters.searchQuery}%`
        );
      }

      // Aplicar paginación
      query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener conductores',
          error.message
        );
      }

      const total = count || 0;
      const totalPages = Math.ceil(total / limit);

      return {
        data: data || [],
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getDrivers');
    }
  }

  /**
   * Obtiene conductores pendientes de aprobación
   */
  static async getPendingDrivers(
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      return await this.getDrivers({ approved: false, blocked: false }, pagination);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getPendingDrivers');
    }
  }

  /**
   * Obtiene conductores aprobados
   */
  static async getApprovedDrivers(
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      return await this.getDrivers({ approved: true, blocked: false }, pagination);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getApprovedDrivers');
    }
  }

  /**
   * Obtiene conductores bloqueados
   */
  static async getBlockedDrivers(
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      return await this.getDrivers({ blocked: true }, pagination);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getBlockedDrivers');
    }
  }

  /**
   * Busca conductores por nombre, email o teléfono
   */
  static async searchDrivers(
    searchQuery: string,
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      return await this.getDrivers({ searchQuery }, pagination);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.searchDrivers');
    }
  }

  /**
   * Obtiene conductores por ciudad
   */
  static async getDriversByCity(
    city: string,
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<UserRow>> {
    try {
      return await this.getDrivers({ city, blocked: false }, pagination);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getDriversByCity');
    }
  }

  /**
   * Obtiene estadísticas de conductores
   */
  static async getDriverStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    blocked: number;
    active: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('approved, blocked, driver_active_status')
        .eq('user_type', 'driver');

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener estadísticas',
          error.message
        );
      }

      if (!data) {
        return {
          total: 0,
          pending: 0,
          approved: 0,
          blocked: 0,
          active: 0,
        };
      }

      type DriverStat = {
        approved: boolean;
        blocked: boolean;
        driver_active_status: boolean;
      };

      const stats = {
        total: data.length,
        pending: data.filter((d: DriverStat) => !d.approved && !d.blocked).length,
        approved: data.filter((d: DriverStat) => d.approved && !d.blocked).length,
        blocked: data.filter((d: DriverStat) => d.blocked).length,
        active: data.filter((d: DriverStat) => d.driver_active_status && d.approved).length,
      };

      return stats;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getDriverStats');
    }
  }

  /**
   * Actualiza el balance de wallet de un usuario
   */
  static async updateWalletBalance(
    userId: string,
    amount: number
  ): Promise<UserRow> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Usuario no encontrado',
          `User ID: ${userId}`
        );
      }

      const newBalance = user.wallet_balance + amount;

      return await this.updateUser(userId, {
        wallet_balance: newBalance,
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.updateWalletBalance');
    }
  }

  /**
   * Verifica si un email ya está registrado
   */
  static async emailExists(email: string): Promise<boolean> {
    try {
      const user = await this.getUserByEmail(email);
      return user !== null;
    } catch (error) {
      console.error('Error checking email existence:', error);
      return false;
    }
  }

  /**
   * Verifica si un teléfono ya está registrado
   */
  static async phoneExists(mobile: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .eq('mobile', mobile)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data !== null;
    } catch (error) {
      console.error('Error checking phone existence:', error);
      return false;
    }
  }

  /**
   * Obtiene ciudades únicas de conductores
   */
  static async getDriverCities(): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('city')
        .eq('user_type', 'driver')
        .not('city', 'is', null);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener ciudades',
          error.message
        );
      }

      if (!data) {
        return [];
      }

      // Obtener valores únicos
      type CityResult = { city: string | null };
      const cities = [...new Set(data.map((d: CityResult) => d.city))].filter(Boolean) as string[];
      return cities.sort();
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'UsersService.getDriverCities');
    }
  }
}
