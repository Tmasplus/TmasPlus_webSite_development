import { supabase } from '@/config/supabase';
import type {
  CarRow,
  CarInsert,
  CarUpdate,
  PaginatedResult,
  PaginationOptions,
  DriverServiceType,
} from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';

/**
 * Interfaz para filtros de vehículos
 */
export interface CarFilters {
  driver_id?: string;
  is_active?: boolean;
  service_type?: DriverServiceType;
  searchQuery?: string;
  fuel_type?: string;
  transmission?: string;
  city?: string;
}

/**
 * Servicio de Vehículos de T+Plus Dashboard
 * Maneja el CRUD completo de vehículos y sus documentos
 */
export class CarsService {
  // ==================== CRUD BÁSICO ====================

  /**
   * Crea un nuevo vehículo
   */
  static async createCar(data: CarInsert): Promise<CarRow> {
    try {
      // Validar placa única
      const plateExists = await this.plateExists(data.plate);
      if (plateExists) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'La placa ya está registrada',
          `Plate: ${data.plate}`
        );
      }

      const { data: car, error } = await supabase
        .from('cars')
        .insert({
          ...data,
          is_active: data.is_active ?? true,
          fuel_type: data.fuel_type || 'gasolina',
          transmission: data.transmission || 'manual',
          capacity: data.capacity || 4,
        })
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al crear vehículo',
          error.message
        );
      }

      if (!car) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'No se pudo crear el vehículo',
          'No data returned from insert'
        );
      }

      return car;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.createCar');
    }
  }

  /**
   * Obtiene un vehículo por ID
   */
  static async getCarById(carId: string): Promise<CarRow | null> {
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('id', carId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener vehículo',
          error.message
        );
      }

      return data || null;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.getCarById');
    }
  }

  /**
   * Obtiene todos los vehículos de un conductor
   */
  static async getCarsByDriver(driverId: string): Promise<CarRow[]> {
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false });

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener vehículos del conductor',
          error.message
        );
      }

      return data || [];
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.getCarsByDriver');
    }
  }

  /**
   * Obtiene vehículos con filtros y paginación
   */
  static async getCars(
    filters: CarFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<CarRow>> {
    try {
      let query = supabase.from('cars').select('*', { count: 'exact' });

      // Aplicar filtros
      if (filters.driver_id) {
        query = query.eq('driver_id', filters.driver_id);
      }

      if (filters.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      if (filters.service_type) {
        query = query.eq('service_type', filters.service_type);
      }

      if (filters.fuel_type) {
        query = query.eq('fuel_type', filters.fuel_type);
      }

      if (filters.transmission) {
        query = query.eq('transmission', filters.transmission);
      }

      if (filters.searchQuery) {
        const search = `%${filters.searchQuery}%`;
        query = query.or(
          `plate.ilike.${search},make.ilike.${search},model.ilike.${search},vehicle_number.ilike.${search}`
        );
      }

      // Paginación
      const { page, limit } = pagination;
      const from = (page - 1) * limit;
      const to = from + limit - 1;

      query = query.range(from, to).order('created_at', { ascending: false });

      const { data, error, count } = await query;

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al obtener vehículos',
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
      throw ErrorHandler.handleWithToast(error, 'CarsService.getCars');
    }
  }

  /**
   * Actualiza un vehículo
   */
  static async updateCar(carId: string, data: CarUpdate): Promise<CarRow> {
    try {
      // Si se actualiza la placa, validar que sea única
      if (data.plate) {
        const existingCar = await this.getCarById(carId);
        if (existingCar && existingCar.plate !== data.plate) {
          const plateExists = await this.plateExists(data.plate);
          if (plateExists) {
            throw ErrorHandler.createError(
              AppErrorType.VALIDATION,
              'La placa ya está registrada',
              `Plate: ${data.plate}`
            );
          }
        }
      }

      const { data: car, error } = await supabase
        .from('cars')
        .update({
          ...data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', carId)
        .select()
        .single();

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al actualizar vehículo',
          error.message
        );
      }

      if (!car) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Vehículo no encontrado',
          `Car ID: ${carId}`
        );
      }

      return car;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.updateCar');
    }
  }

  /**
   * Elimina un vehículo (soft delete desactivando)
   */
  static async deleteCar(carId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('cars')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', carId);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al eliminar vehículo',
          error.message
        );
      }

      return true;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.deleteCar');
    }
  }

  /**
   * Elimina permanentemente un vehículo (hard delete)
   */
  static async hardDeleteCar(carId: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('cars').delete().eq('id', carId);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al eliminar permanentemente el vehículo',
          error.message
        );
      }

      return true;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.hardDeleteCar');
    }
  }

  // ==================== VALIDACIONES ====================

  /**
   * Verifica si una placa ya está registrada
   */
  static async plateExists(plate: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('id')
        .eq('plate', plate)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al verificar placa',
          error.message
        );
      }

      return data !== null;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.plateExists');
    }
  }

  /**
   * Verifica si un conductor tiene vehículos registrados
   */
  static async driverHasCars(driverId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('cars')
        .select('id')
        .eq('driver_id', driverId)
        .limit(1);

      if (error) {
        throw ErrorHandler.createError(
          AppErrorType.DATABASE,
          'Error al verificar vehículos del conductor',
          error.message
        );
      }

      return (data?.length || 0) > 0;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.driverHasCars');
    }
  }

  // ==================== GESTIÓN DE ESTADO ====================

  /**
   * Activa o desactiva un vehículo
   */
  static async toggleCarActiveStatus(carId: string, isActive: boolean): Promise<CarRow> {
    try {
      return await this.updateCar(carId, { is_active: isActive });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.toggleCarActiveStatus');
    }
  }

  /**
   * Asigna un vehículo a un conductor
   */
  static async assignCarToDriver(carId: string, driverId: string): Promise<CarRow> {
    try {
      return await this.updateCar(carId, { driver_id: driverId });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.assignCarToDriver');
    }
  }

  /**
   * Desasigna un vehículo de un conductor
   */
  static async unassignCarFromDriver(carId: string): Promise<CarRow> {
    try {
      return await this.updateCar(carId, { driver_id: null });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.unassignCarFromDriver');
    }
  }

  // ==================== GESTIÓN DE DOCUMENTOS ====================

  /**
   * Actualiza la imagen del SOAT y su fecha de vencimiento
   */
  static async updateSoatDocument(
    carId: string,
    soatImageUrl: string,
    expiryDate: string
  ): Promise<CarRow> {
    try {
      return await this.updateCar(carId, {
        soat_image: soatImageUrl,
        soat_expiry_date: expiryDate,
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.updateSoatDocument');
    }
  }

  /**
   * Actualiza la imagen de la tecnomecánica y su fecha de vencimiento
   */
  static async updateTecnomecanicaDocument(
    carId: string,
    tecnomecanicaImageUrl: string,
    expiryDate: string
  ): Promise<CarRow> {
    try {
      return await this.updateCar(carId, {
        tecnomecanica_image: tecnomecanicaImageUrl,
        tecnomecanica_expiry_date: expiryDate,
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.updateTecnomecanicaDocument');
    }
  }

  /**
   * Actualiza la imagen de la tarjeta de propiedad
   */
  static async updatePropertyCardDocument(
    carId: string,
    frontImageUrl: string,
    backImageUrl?: string
  ): Promise<CarRow> {
    try {
      return await this.updateCar(carId, {
        card_prop_image: frontImageUrl,
        card_prop_image_back: backImageUrl || null,
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.updatePropertyCardDocument');
    }
  }

  /**
   * Actualiza la imagen de la cámara de comercio
   */
  static async updateCamaraComercioDocument(
    carId: string,
    imageUrl: string
  ): Promise<CarRow> {
    try {
      return await this.updateCar(carId, {
        camara_comercio_image: imageUrl,
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.updateCamaraComercioDocument');
    }
  }

  /**
   * Verifica vencimiento de documentos
   */
  static async checkDocumentsExpiry(carId: string): Promise<{
    soatExpired: boolean;
    soatExpiringSoon: boolean;
    tecnomecanicaExpired: boolean;
    tecnomecanicaExpiringSoon: boolean;
    soatExpiryDate: string | null;
    tecnomecanicaExpiryDate: string | null;
  }> {
    try {
      const car = await this.getCarById(carId);
      if (!car) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Vehículo no encontrado',
          `Car ID: ${carId}`
        );
      }

      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = {
        soatExpired: false,
        soatExpiringSoon: false,
        tecnomecanicaExpired: false,
        tecnomecanicaExpiringSoon: false,
        soatExpiryDate: car.soat_expiry_date,
        tecnomecanicaExpiryDate: car.tecnomecanica_expiry_date,
      };

      if (car.soat_expiry_date) {
        const soatExpiry = new Date(car.soat_expiry_date);
        result.soatExpired = soatExpiry < now;
        result.soatExpiringSoon = soatExpiry < thirtyDaysFromNow && !result.soatExpired;
      }

      if (car.tecnomecanica_expiry_date) {
        const tecnoExpiry = new Date(car.tecnomecanica_expiry_date);
        result.tecnomecanicaExpired = tecnoExpiry < now;
        result.tecnomecanicaExpiringSoon =
          tecnoExpiry < thirtyDaysFromNow && !result.tecnomecanicaExpired;
      }

      return result;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.checkDocumentsExpiry');
    }
  }

  // ==================== ESTADÍSTICAS ====================

  /**
   * Obtiene estadísticas de vehículos
   */
  static async getCarsStats(): Promise<{
    total: number;
    active: number;
    inactive: number;
    byServiceType: Record<DriverServiceType, number>;
    byFuelType: Record<string, number>;
    byTransmission: Record<string, number>;
    documentsExpiringSoon: number;
    documentsExpired: number;
  }> {
    try {
        const { data: allCarsData } = await supabase.from('cars').select('*');

        // Tipar explícitamente como CarRow[]
        const allCars: CarRow[] = (allCarsData || []) as CarRow[];
        
        if (allCars.length === 0) {
          return {
            total: 0,
            active: 0,
            inactive: 0,
            byServiceType: {
              particular: 0,
              servicio_especial: 0,
              taxi_plus: 0,
            },
            byFuelType: {},
            byTransmission: {},
            documentsExpiringSoon: 0,
            documentsExpired: 0,
          };
        }
        
        const now = new Date();
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        const stats = {
          total: allCars.length,
          active: allCars.filter((c: CarRow) => c.is_active).length,
          inactive: allCars.filter((c: CarRow) => !c.is_active).length,
        
        byServiceType: {
          particular: 0,
          servicio_especial: 0,
          taxi_plus: 0,
        } as Record<DriverServiceType, number>,
        byFuelType: {} as Record<string, number>,
        byTransmission: {} as Record<string, number>,
        documentsExpiringSoon: 0,
        documentsExpired: 0,
      };

      allCars.forEach((car: CarRow) => {
        // Por tipo de servicio
        if (car.service_type) {
          const serviceType = car.service_type as DriverServiceType;
          if (serviceType in stats.byServiceType) {
            stats.byServiceType[serviceType]++;
          }
        }

        // Por tipo de combustible
        if (car.fuel_type) {
          stats.byFuelType[car.fuel_type] = (stats.byFuelType[car.fuel_type] || 0) + 1;
        }

        // Por transmisión
        if (car.transmission) {
          stats.byTransmission[car.transmission] =
            (stats.byTransmission[car.transmission] || 0) + 1;
        }

        // Documentos vencidos o próximos a vencer
        if (car.soat_expiry_date) {
          const soatExpiry = new Date(car.soat_expiry_date);
          if (soatExpiry < now) {
            stats.documentsExpired++;
          } else if (soatExpiry < thirtyDaysFromNow) {
            stats.documentsExpiringSoon++;
          }
        }

        if (car.tecnomecanica_expiry_date) {
          const tecnoExpiry = new Date(car.tecnomecanica_expiry_date);
          if (tecnoExpiry < now) {
            stats.documentsExpired++;
          } else if (tecnoExpiry < thirtyDaysFromNow) {
            stats.documentsExpiringSoon++;
          }
        }
      });

      return stats;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.getCarsStats');
    }
  }

  /**
   * Obtiene vehículos con documentos próximos a vencer
   */
  static async getCarsWithExpiringDocuments(daysThreshold = 30): Promise<CarRow[]> {
    try {
        const { data: allCarsData } = await supabase
        .from('cars')
        .select('*')
        .eq('is_active', true);
      
      // Tipar explícitamente como CarRow[]
      const allCars: CarRow[] = (allCarsData || []) as CarRow[];
      
      if (allCars.length === 0) return [];
      
      const now = new Date();
      const thresholdDate = new Date(now.getTime() + daysThreshold * 24 * 60 * 60 * 1000);
      
      return allCars.filter((car: CarRow) => {
      
        if (car.soat_expiry_date) {
          const soatExpiry = new Date(car.soat_expiry_date);
          if (soatExpiry >= now && soatExpiry <= thresholdDate) {
            return true;
          }
        }

        if (car.tecnomecanica_expiry_date) {
          const tecnoExpiry = new Date(car.tecnomecanica_expiry_date);
          if (tecnoExpiry >= now && tecnoExpiry <= thresholdDate) {
            return true;
          }
        }

        return false;
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(
        error,
        'CarsService.getCarsWithExpiringDocuments'
      );
    }
  }

  /**
   * Obtiene vehículos con documentos vencidos
   */
  static async getCarsWithExpiredDocuments(): Promise<CarRow[]> {
    try {
        const { data: allCarsData } = await supabase
        .from('cars')
        .select('*')
        .eq('is_active', true);
      
      // Tipar explícitamente como CarRow[]
      const allCars: CarRow[] = (allCarsData || []) as CarRow[];
      
      if (allCars.length === 0) return [];
      
      const now = new Date();
      
      return allCars.filter((car: CarRow) => {
      
        if (car.soat_expiry_date) {
          const soatExpiry = new Date(car.soat_expiry_date);
          if (soatExpiry < now) return true;
        }

        if (car.tecnomecanica_expiry_date) {
          const tecnoExpiry = new Date(car.tecnomecanica_expiry_date);
          if (tecnoExpiry < now) return true;
        }

        return false;
      });
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'CarsService.getCarsWithExpiredDocuments');
    }
  }
}
