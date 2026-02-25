import { supabase } from '../config/supabase';
import type { 
  ReferralCodeRow, 
  ReferralRow, 
  ReferralInsert,
  ReferralUpdate,
  ReferralWithDriver,
  ReferralCodeWithStats,
  DriverReferralStats
} from '../config/database.types';
import { ErrorHandler, type AppError, AppErrorType } from '../utils/errorHandler';

// Tipos de respuesta del servicio
interface ServiceResponse<T> {
  data: T | null;
  error: AppError | null;
}

interface PaginatedResponse<T> {
  data: T[];
  count: number;
  error: AppError | null;
}

// Interfaz para filtros de búsqueda
interface ReferralFilters {
  status?: string;
  reward_claimed?: boolean;
  from_date?: string;
  to_date?: string;
}

class ReferralsService {
  /**
   * Obtiene el código de referido de un conductor
   */
  async getDriverReferralCode(driverId: string): Promise<ServiceResponse<ReferralCodeWithStats>> {
    try {
      if (!driverId) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de conductor es requerido',
            'Missing driverId parameter'
          )
        };
      }

      const { data: referralCode, error: codeError } = await supabase
        .from('referral_codes')
        .select(`
          *,
          driver:users!referral_codes_driver_id_fkey(
            id,
            first_name,
            last_name,
            email,
            mobile,
            user_type
          )
        `)
        .eq('driver_id', driverId)
        .eq('is_active', true)
        .single();

      if (codeError) {
        if (codeError.code === 'PGRST116') {
          return {
            data: null,
            error: ErrorHandler.createError(
              AppErrorType.NOT_FOUND,
              'El conductor no tiene código de referido asignado',
              `No referral code found for driver: ${driverId}`
            )
          };
        }
        return { data: null, error: ErrorHandler.handleDatabaseError(codeError) };
      }

      const { data: referrals, error: referralsError } = await supabase
        .from('referrals')
        .select('*')
        .eq('referral_code_id', referralCode.id);

      if (referralsError) {
        return { data: null, error: ErrorHandler.handleDatabaseError(referralsError) };
      }

      const successful_referrals = referrals?.filter((r: ReferralRow) => r.status === 'completed').length || 0;
      const pending_referrals = referrals?.filter((r: ReferralRow) => r.status === 'pending').length || 0;

      const result: ReferralCodeWithStats = {
        ...referralCode,
        referrals: referrals || [],
        successful_referrals,
        pending_referrals
      };

      return { data: result, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'getDriverReferralCode') 
      };
    }
  }

  /**
   * Valida que un código de referido existe y está activo
   */
  async validateReferralCode(referralCode: string): Promise<ServiceResponse<ReferralCodeRow>> {
    try {
      if (!referralCode || referralCode.trim() === '') {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'Código de referido es requerido',
            'Empty referral code'
          )
        };
      }

      const { data, error } = await supabase
        .from('referral_codes')
        .select('*')
        .eq('referral_code', referralCode.toUpperCase().trim())
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            data: null,
            error: ErrorHandler.createError(
              AppErrorType.NOT_FOUND,
              'Código de referido inválido o inactivo',
              `Invalid referral code: ${referralCode}`
            )
          };
        }
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'validateReferralCode') 
      };
    }
  }

  /**
   * Verifica si un código de referido está disponible
   */
  async isReferralCodeAvailable(code: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('id')
        .eq('referral_code', code.toUpperCase())
        .single();

      if (error && error.code === 'PGRST116') {
        return true;
      }

      return !data;
    } catch {
      return false;
    }
  }

  /**
   * Registra un nuevo referido
   */
  async createReferral(referralData: {
    referralCode: string;
    referredDriverId: string;
  }): Promise<ServiceResponse<ReferralRow>> {
    try {
      const { referralCode, referredDriverId } = referralData;

      const { data: codeData, error: codeError } = await this.validateReferralCode(referralCode);
      if (codeError || !codeData) {
        return { 
          data: null, 
          error: codeError || ErrorHandler.createError(
            AppErrorType.NOT_FOUND,
            'Código no encontrado',
            'Referral code validation failed'
          )
        };
      }

      if (codeData.driver_id === referredDriverId) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'No puedes usar tu propio código de referido',
            `Self-referral attempt: ${referredDriverId}`
          )
        };
      }

      const { data: existingReferral } = await supabase
        .from('referrals')
        .select('id')
        .eq('referred_driver_id', referredDriverId)
        .single();

      if (existingReferral) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'Este conductor ya ha sido referido',
            `Driver already referred: ${referredDriverId}`
          )
        };
      }

      const newReferral: ReferralInsert = {
        referral_code_id: codeData.id,
        referrer_id: codeData.driver_id,
        referred_driver_id: referredDriverId,
        referral_code: referralCode.toUpperCase(),
        status: 'pending',
        reward_claimed: false
      };

      const { data, error } = await supabase
        .from('referrals')
        .insert(newReferral)
        .select()
        .single();

      if (error) {
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      await supabase
        .from('referral_codes')
        .update({ total_referrals: codeData.total_referrals + 1 })
        .eq('id', codeData.id);

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'createReferral') 
      };
    }
  }

  /**
   * Obtiene todos los referidos de un conductor con paginación
   */
  async getDriverReferrals(
    driverId: string,
    page: number = 1,
    limit: number = 10,
    filters?: ReferralFilters
  ): Promise<PaginatedResponse<ReferralWithDriver>> {
    try {
      if (!driverId) {
        return {
          data: [],
          count: 0,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de conductor es requerido',
            'Missing driverId parameter'
          )
        };
      }

      const offset = (page - 1) * limit;

      let query = supabase
        .from('referrals')
        .select(`
          *,
          referred_driver:users!referrals_referred_driver_id_fkey(
            id,
            first_name,
            last_name,
            email,
            mobile,
            user_type,
            approved
          )
        `, { count: 'exact' })
        .eq('referrer_id', driverId);

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.reward_claimed !== undefined) {
        query = query.eq('reward_claimed', filters.reward_claimed);
      }
      if (filters?.from_date) {
        query = query.gte('referred_at', filters.from_date);
      }
      if (filters?.to_date) {
        query = query.lte('referred_at', filters.to_date);
      }

      query = query
        .order('referred_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error, count } = await query;

      if (error) {
        return { 
          data: [], 
          count: 0, 
          error: ErrorHandler.handleDatabaseError(error) 
        };
      }

      return { 
        data: data as ReferralWithDriver[] || [], 
        count: count || 0, 
        error: null 
      };
    } catch (error) {
      return {
        data: [],
        count: 0,
        error: ErrorHandler.handle(error, 'getDriverReferrals')
      };
    }
  }

  /**
   * Obtiene estadísticas completas de referidos de un conductor
   */
  async getDriverReferralStats(driverId: string): Promise<ServiceResponse<DriverReferralStats>> {
    try {
      if (!driverId) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de conductor es requerido',
            'Missing driverId parameter'
          )
        };
      }

      const { data: referrals, error } = await supabase
        .from('referrals')
        .select('*')
        .eq('referrer_id', driverId);

      if (error) {
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      const total_referrals = referrals?.length || 0;
      const completed_referrals = referrals?.filter((r: ReferralRow) => r.status === 'completed').length || 0;
      const pending_referrals = referrals?.filter((r: ReferralRow) => r.status === 'pending').length || 0;

      const stats: DriverReferralStats = {
        total_referrals,
        completed_referrals,
        pending_referrals,
        total_rewards: 0,
        unclaimed_rewards: 0
      };

      return { data: stats, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'getDriverReferralStats') 
      };
    }
  }

  /**
   * Actualiza el estado de un referido
   */
  async updateReferralStatus(
    referralId: string,
    status: 'pending' | 'completed' | 'cancelled'
  ): Promise<ServiceResponse<ReferralRow>> {
    try {
      if (!referralId || !status) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de referido y estado son requeridos',
            'Missing referralId or status'
          )
        };
      }

      const updateData: ReferralUpdate = { status };

      const { data, error } = await supabase
        .from('referrals')
        .update(updateData)
        .eq('id', referralId)
        .select()
        .single();

      if (error) {
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'updateReferralStatus') 
      };
    }
  }

  /**
   * Marca la recompensa de un referido como reclamada
   */
  async claimReferralReward(referralId: string): Promise<ServiceResponse<ReferralRow>> {
    try {
      if (!referralId) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de referido es requerido',
            'Missing referralId parameter'
          )
        };
      }

      const { data: referral, error: checkError } = await supabase
        .from('referrals')
        .select('*')
        .eq('id', referralId)
        .single();

      if (checkError) {
        return { data: null, error: ErrorHandler.handleDatabaseError(checkError) };
      }

      if (referral.status !== 'completed') {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'Solo se pueden reclamar recompensas de referidos completados',
            `Referral status is ${referral.status}, expected completed`
          )
        };
      }

      if (referral.reward_claimed) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'La recompensa ya ha sido reclamada',
            `Reward already claimed for referral: ${referralId}`
          )
        };
      }

      const { data, error } = await supabase
        .from('referrals')
        .update({ reward_claimed: true })
        .eq('id', referralId)
        .select()
        .single();

      if (error) {
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      return { data, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'claimReferralReward') 
      };
    }
  }

  /**
   * Obtiene un referido por ID con información completa
   */
  async getReferralById(referralId: string): Promise<ServiceResponse<ReferralWithDriver>> {
    try {
      if (!referralId) {
        return {
          data: null,
          error: ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'ID de referido es requerido',
            'Missing referralId parameter'
          )
        };
      }

      const { data, error } = await supabase
        .from('referrals')
        .select(`
          *,
          referred_driver:users!referrals_referred_driver_id_fkey(
            id,
            first_name,
            last_name,
            email,
            mobile,
            user_type,
            approved
          ),
          referrer_driver:users!referrals_referrer_id_fkey(
            id,
            first_name,
            last_name,
            email,
            mobile,
            user_type
          )
        `)
        .eq('id', referralId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return {
            data: null,
            error: ErrorHandler.createError(
              AppErrorType.NOT_FOUND,
              'Referido no encontrado',
              `Referral not found: ${referralId}`
            )
          };
        }
        return { data: null, error: ErrorHandler.handleDatabaseError(error) };
      }

      return { data: data as ReferralWithDriver, error: null };
    } catch (error) {
      return { 
        data: null, 
        error: ErrorHandler.handle(error, 'getReferralById') 
      };
    }
  }
}

export const referralsService = new ReferralsService();
