import { supabase } from '@/config/supabase';
import type {
  UserRow,
  DriverProfile,
  DriverRegistrationData,
  DriverRegistrationStep1,
  DriverRegistrationStep2,
  DriverRegistrationStep3,
  DriverRegistrationStep4,
  DriverRegistrationResult,
  DriverFilters,
  PaginatedResult,
  PaginationOptions,
  DriverServiceType,
  CompanyData,
} from '@/config/database.types';
import { ErrorHandler, AppErrorType } from '@/utils/errorHandler';
import { UsersService } from './users.service';
import { CarsService } from './cars.service';
import { StorageService } from './storage.service';
import { referralsService } from './referrals.service';


/**
 * Servicio de Conductores de T+Plus Dashboard
 * Maneja el ciclo completo de registro, aprobación y gestión de conductores
 */
export class DriversService {
  // ==================== REGISTRO DE CONDUCTORES ====================

  /**
   * PASO 1: Registro de usuario conductor (datos básicos)
   */
  static async registerStep1(
    data: DriverRegistrationStep1
  ): Promise<{ userId: string; authId: string }> {
    try {
      // Validar email único
      const emailExists = await UsersService.emailExists(data.email);
      if (emailExists) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'El email ya está registrado',
          `Email: ${data.email}`
        );
      }

      // Validar teléfono único
      const phoneExists = await UsersService.phoneExists(data.mobile);
      if (phoneExists) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'El número de teléfono ya está registrado',
          `Mobile: ${data.mobile}`
        );
      }

      // Validar código de referido si se proporciona
      let validatedReferralCode: string | null = null;
      if (data.referral_code && data.referral_code.trim() !== '') {
        const { data: referralCodeData, error: referralError } = 
          await referralsService.validateReferralCode(data.referral_code);
        
        if (referralError) {
          throw ErrorHandler.createError(
            AppErrorType.VALIDATION,
            'Código de referido inválido o inactivo',
            `Referral code: ${data.referral_code}`
          );
        }
  
        validatedReferralCode = referralCodeData?.referral_code || null;
      }

      // Crear usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            first_name: data.first_name,
            last_name: data.last_name,
            mobile: data.mobile,
          },
        },
      });

      if (authError || !authData.user) {
        throw ErrorHandler.createError(
          AppErrorType.AUTHENTICATION,
          'Error al crear usuario en Auth',
          authError?.message || 'No user returned'
        );
      }

      // Crear registro en tabla users con código de referido validado
    const user = await UsersService.createUser({
      auth_id: authData.user.id,
      email: data.email,
      first_name: data.first_name,
      last_name: data.last_name,
      mobile: data.mobile,
      city: data.city,
      user_type: 'driver',
      approved: false,
      blocked: false,
      driver_active_status: false,
      wallet_balance: 0,
      referral_id: validatedReferralCode, // ✅ Código validado
    });

    return {
      userId: user.id,
      authId: authData.user.id,
    };
  } catch (error) {
    throw ErrorHandler.handleWithToast(error, 'DriversService.registerStep1');
  }
}

  /**
   * PASO 2: Subir documentos de conductor
   */
  static async registerStep2(
    userId: string,
    data: DriverRegistrationStep2
  ): Promise<{
    verifyIdImageUrl: string;
    verifyIdImageBkUrl: string;
    licenseImageUrl: string;
    licenseImageBackUrl: string;
  }> {
    try {
      // Validar que el usuario existe
      const user = await UsersService.getUserById(userId);
      if (!user) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Usuario no encontrado',
          `User ID: ${userId}`
        );
      }

      // Subir documentos en paralelo
      const [verifyIdImage, verifyIdImageBk, licenseImage, licenseImageBack] =
        await Promise.all([
          StorageService.uploadDriverDocument(userId, 'cedula_frente', data.cedula_frente),
          StorageService.uploadDriverDocument(
            userId,
            'cedula_posterior',
            data.cedula_posterior
          ),
          StorageService.uploadDriverDocument(
            userId,
            'licencia_frente',
            data.licencia_frente
          ),
          StorageService.uploadDriverDocument(
            userId,
            'licencia_posterior',
            data.licencia_posterior
          ),
        ]);

      // Validar que todos los uploads fueron exitosos
      if (
        !verifyIdImage.success ||
        !verifyIdImageBk.success ||
        !licenseImage.success ||
        !licenseImageBack.success
      ) {
        throw ErrorHandler.createError(
          AppErrorType.STORAGE,
          'Error al subir uno o más documentos',
          'Check individual upload results'
        );
      }

      // Actualizar usuario con número de licencia y URLs de documentos
      await UsersService.updateUser(userId, {
        license_number: data.license_number,
        verify_id_image: verifyIdImage.url,
        verify_id_image_bk: verifyIdImageBk.url,
        license_image: licenseImage.url,
        license_image_back: licenseImageBack.url,
      });

      return {
        verifyIdImageUrl: verifyIdImage.url!,
        verifyIdImageBkUrl: verifyIdImageBk.url!,
        licenseImageUrl: licenseImage.url!,
        licenseImageBackUrl: licenseImageBack.url!,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.registerStep2');
    }
  }

  /**
   * PASO 3: Registrar vehículo y documentos
   */
  static async registerStep3(
    userId: string,
    data: DriverRegistrationStep3
  ): Promise<{ carId: string }> {
    try {
      // Validar placa única
      const plateExists = await CarsService.plateExists(data.vehicle.plate);
      if (plateExists) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'La placa ya está registrada',
          `Plate: ${data.vehicle.plate}`
        );
      }

      // Crear vehículo
      const car = await CarsService.createCar({
        driver_id: userId,
        make: data.vehicle.make,
        model: data.vehicle.model,
        year: data.vehicle.year,
        color: data.vehicle.color,
        plate: data.vehicle.plate,
        fuel_type: data.vehicle.fuel_type,
        transmission: data.vehicle.transmission,
        capacity: data.vehicle.capacity,
        service_type: data.serviceType,
      });

      // Subir documentos del vehículo en paralelo
      const uploadPromises = [
        StorageService.uploadVehicleDocument(car.id, 'tarjeta_propiedad', data.tarjeta_propiedad),
        StorageService.uploadVehicleDocument(car.id, 'soat', data.soat),
      ];

      if (data.tecnomecanica) {
        uploadPromises.push(
          StorageService.uploadVehicleDocument(car.id, 'tecnomecanica', data.tecnomecanica)
        );
      }

      if (data.camara_comercio) {
        uploadPromises.push(
          StorageService.uploadVehicleDocument(car.id, 'camara_comercio', data.camara_comercio)
        );
      }

      const uploadResults = await Promise.all(uploadPromises);

      // Validar uploads
      if (uploadResults.some((result) => !result.success)) {
        // Rollback: eliminar vehículo creado
        await CarsService.deleteCar(car.id);
        throw ErrorHandler.createError(
          AppErrorType.STORAGE,
          'Error al subir documentos del vehículo',
          'Vehicle deleted due to upload failure'
        );
      }

      // Actualizar vehículo con URLs de documentos
      await CarsService.updateCar(car.id, {
        card_prop_image: uploadResults[0].url!,
        soat_image: uploadResults[1].url!,
        soat_expiry_date: data.soat_expiry_date,
        tecnomecanica_image: data.tecnomecanica ? uploadResults[2].url! : null,
        tecnomecanica_expiry_date: data.tecnomecanica_expiry_date || null,
        camara_comercio_image: data.camara_comercio
          ? uploadResults[data.tecnomecanica ? 3 : 2].url!
          : null,
      });

      return { carId: car.id };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.registerStep3');
    }
  }

  /**
   * PASO 4: Guardar datos de empresa (opcional, solo para servicio especial y taxi)
   * NOTA: Como company_data no existe en users, guardamos en JSONB del vehículo (features)
   */
  static async registerStep4(
    userId: string,
    data: DriverRegistrationStep4
  ): Promise<boolean> {
    try {
      if (!data.companyData) {
        return true;
      }

      // Obtener vehículo del conductor
      const cars = await CarsService.getCarsByDriver(userId);
      if (!cars || cars.length === 0) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'No se encontró vehículo asociado',
          `User ID: ${userId}`
        );
      }

      // Guardar datos de empresa en features del vehículo
      await CarsService.updateCar(cars[0].id, {
        features: {
          ...((cars[0].features as Record<string, any>) || {}),
          companyData: data.companyData,
        } as any,
      });

      return true;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.registerStep4');
    }
  }

  /**
   * Registro completo de conductor (todos los pasos en una transacción)
   */
  static async registerDriver(
    data: DriverRegistrationData
  ): Promise<DriverRegistrationResult> {
    try {
      // PASO 1: Crear usuario
      const { userId, authId } = await this.registerStep1({
        email: data.email,
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
        mobile: data.mobile,
        city: data.city,
        referral_code: data.referral_code,
      });

      try {
        // PASO 2: Documentos de conductor
        await this.registerStep2(userId, {
          license_number: data.license_number,
          cedula_frente: data.cedula_frente,
          cedula_posterior: data.cedula_posterior,
          licencia_frente: data.licencia_frente,
          licencia_posterior: data.licencia_posterior,
        });

        // PASO 3: Vehículo y documentos
        const { carId } = await this.registerStep3(userId, {
          serviceType: data.serviceType,
          vehicle: data.vehicle,
          tarjeta_propiedad: data.tarjeta_propiedad,
          soat: data.soat,
          soat_expiry_date: data.soat_expiry_date,
          tecnomecanica: data.tecnomecanica,
          tecnomecanica_expiry_date: data.tecnomecanica_expiry_date,
          camara_comercio: data.camara_comercio,
        });

        // PASO 4: Datos de empresa (opcional)
        await this.registerStep4(userId, {
          companyData: data.companyData,
        });

        return {
          success: true,
          userId,
          carId,
          message: 'Conductor registrado exitosamente. Pendiente de aprobación.',
        };
      } catch (stepError) {
        // Rollback: eliminar usuario de Auth y BD
        await supabase.auth.admin.deleteUser(authId);
        await UsersService.deleteUser(userId);
        throw stepError;
      }
    } catch (error) {
      const appError = ErrorHandler.handleWithToast(error, 'DriversService.registerDriver');
      return {
        success: false,
        message: appError.message || 'Error al registrar conductor',
        errors: {
          general: appError.technicalMessage || 'Error desconocido',
        },
      };
    }
  }

  // ==================== GESTIÓN DE CONDUCTORES ====================

  /**
   * Obtiene perfil completo de conductor (usuario + vehículo + documentos)
   */
  static async getDriverProfile(userId: string): Promise<DriverProfile | null> {
    try {
      const user = await UsersService.getUserById(userId);
      if (!user) return null;

      const vehicles = await CarsService.getCarsByDriver(userId);
      const activeVehicle = vehicles && vehicles.length > 0 ? vehicles[0] : undefined;

      // Extraer companyData de features si existe
      let companyData: CompanyData | undefined;
      if (activeVehicle && activeVehicle.features) {
        const features = activeVehicle.features as Record<string, any>;
        companyData = features.companyData as CompanyData | undefined;
      }

      const profile: DriverProfile = {
        ...user,
        vehicle: activeVehicle as any,
        serviceType: (activeVehicle?.service_type as DriverServiceType) || 'particular',
        companyData,
      };

      return profile;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.getDriverProfile');
    }
  }

  /**
   * Obtiene perfiles completos de múltiples conductores con paginación
   */
  static async getDriverProfiles(
    filters: DriverFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<PaginatedResult<DriverProfile>> {
    try {
      const usersResult = await UsersService.getDrivers(filters, pagination);

      const profiles = await Promise.all(
        usersResult.data.map(async (user: UserRow) => {
          const vehicles = await CarsService.getCarsByDriver(user.id);
          const activeVehicle = vehicles && vehicles.length > 0 ? vehicles[0] : undefined;

          let companyData: CompanyData | undefined;
          if (activeVehicle && activeVehicle.features) {
            const features = activeVehicle.features as Record<string, any>;
            companyData = features.companyData as CompanyData | undefined;
          }

          return {
            ...user,
            vehicle: activeVehicle as any,
            serviceType: (activeVehicle?.service_type as DriverServiceType) || 'particular',
            companyData,
          } as DriverProfile;
        })
      );

      return {
        ...usersResult,
        data: profiles,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.getDriverProfiles');
    }
  }

  /**
 * Aprueba un conductor
 * NOTA: El trigger create_referral_on_approval se encarga automáticamente de:
 Crear el registro en la tabla referrals si tiene referral_id, Actualizar el estado a 'completed'
 */
static async approveDriver(userId: string, approvedBy: string): Promise<UserRow> {
  try {
    const user = await UsersService.updateDriverApproval(userId, true);

    // Log de aprobación
    console.log(`Driver ${userId} approved by ${approvedBy}`);
    
    // Verificar si tiene código de referido
    if (user.referral_id) {
      console.log(`Driver ${userId} was referred with code: ${user.referral_id}`);
      console.log('Trigger create_referral_on_approval will handle referral creation');
    }

    // TODO: Enviar notificación al conductor (email/SMS)
    
    return user;
  } catch (error) {
    throw ErrorHandler.handleWithToast(error, 'DriversService.approveDriver');
  }
}


  /**
   * Rechaza un conductor con razón
   * NOTA: Como rejection_reason no existe en users, registramos en log
   */
  static async rejectDriver(
    userId: string,
    reason: string,
    rejectedBy: string
  ): Promise<UserRow> {
    try {
      const user = await UsersService.updateUser(userId, {
        approved: false,
      });

      // Log de rechazo (en producción usar tabla de auditoría)
      console.log(`Driver ${userId} rejected by ${rejectedBy}: ${reason}`);

      // TODO: Enviar notificación al conductor con razón de rechazo
      return user;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.rejectDriver');
    }
  }

  /**
   * Bloquea un conductor
   * NOTA: Como block_reason no existe en users, registramos en log
   */
  static async blockDriver(
    userId: string,
    reason: string,
    blockedBy: string
  ): Promise<UserRow> {
    try {
      const user = await UsersService.updateUser(userId, {
        blocked: true,
        driver_active_status: false,
      });

      // Log de bloqueo (en producción usar tabla de auditoría)
      console.log(`Driver ${userId} blocked by ${blockedBy}: ${reason}`);

      return user;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.blockDriver');
    }
  }

  /**
   * Desbloquea un conductor
   */
  static async unblockDriver(userId: string, unblockedBy: string): Promise<UserRow> {
    try {
      const user = await UsersService.updateUser(userId, {
        blocked: false,
      });

      console.log(`Driver ${userId} unblocked by ${unblockedBy}`);

      return user;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.unblockDriver');
    }
  }

  /**
   * Activa/Desactiva estado de conductor (disponible para viajes)
   */
  static async toggleDriverActiveStatus(
    userId: string,
    isActive: boolean
  ): Promise<UserRow> {
    try {
      // Validar que el conductor esté aprobado y no bloqueado
      const user = await UsersService.getUserById(userId);
      if (!user) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Conductor no encontrado',
          `User ID: ${userId}`
        );
      }

      if (!user.approved) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'El conductor no está aprobado',
          `User ID: ${userId}`
        );
      }

      if (user.blocked) {
        throw ErrorHandler.createError(
          AppErrorType.VALIDATION,
          'El conductor está bloqueado',
          `User ID: ${userId}`
        );
      }

      return await UsersService.updateDriverActiveStatus(userId, isActive);
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.toggleDriverActiveStatus');
    }
  }

  // ==================== ESTADÍSTICAS ====================

  /**
   * Obtiene estadísticas avanzadas de conductores
   */
  static async getAdvancedStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    blocked: number;
    active: number;
    byServiceType: Record<DriverServiceType, number>;
    byCityTop5: Array<{ city: string; count: number }>;
    pendingDocumentVerification: number;
  }> {
    try {
      const basicStats = await UsersService.getDriverStats();

      // Estadísticas por tipo de servicio
      const { data: serviceTypeData } = await supabase
        .from('cars')
        .select('service_type')
        .not('service_type', 'is', null);

      type ServiceTypeResult = { service_type: DriverServiceType };
      const serviceTypeCounts: Record<DriverServiceType, number> = {
        particular: 0,
        servicio_especial: 0,
        taxi_plus: 0,
      };

      if (serviceTypeData) {
        (serviceTypeData as ServiceTypeResult[]).forEach((row: ServiceTypeResult) => {
          if (row.service_type in serviceTypeCounts) {
            serviceTypeCounts[row.service_type]++;
          }
        });
      }

      // Top 5 ciudades
      const { data: cityCountsData } = await supabase
        .from('users')
        .select('city')
        .eq('user_type', 'driver')
        .not('city', 'is', null);

      type CityCountResult = { city: string };
      const cityCounts: Record<string, number> = {};

      if (cityCountsData) {
        (cityCountsData as CityCountResult[]).forEach((row: CityCountResult) => {
          cityCounts[row.city] = (cityCounts[row.city] || 0) + 1;
        });
      }

      const byCityTop5 = Object.entries(cityCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([city, count]) => ({ city, count }));

      return {
        ...basicStats,
        byServiceType: serviceTypeCounts,
        byCityTop5,
        pendingDocumentVerification: basicStats.pending,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.getAdvancedStats');
    }
  }

  // ==================== VALIDACIONES ====================

  /**
   * Valida si todos los documentos requeridos están subidos
   */
  static async validateRequiredDocuments(userId: string): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    try {
      const user = await UsersService.getUserById(userId);
      if (!user) {
        return { valid: false, missing: ['Usuario no encontrado'] };
      }

      const missing: string[] = [];

      if (!user.verify_id_image) missing.push('Cédula (frente)');
      if (!user.verify_id_image_bk) missing.push('Cédula (posterior)');
      if (!user.license_image) missing.push('Licencia (frente)');
      if (!user.license_image_back) missing.push('Licencia (posterior)');

      const vehicles = await CarsService.getCarsByDriver(userId);
      if (!vehicles || vehicles.length === 0) {
        missing.push('Vehículo no registrado');
      } else {
        const vehicle = vehicles[0];
        if (!vehicle.card_prop_image) missing.push('Tarjeta de propiedad');
        if (!vehicle.soat_image) missing.push('SOAT');
      }

      return {
        valid: missing.length === 0,
        missing,
      };
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.validateRequiredDocuments');
    }
  }

  /**
   * Verifica si los documentos del vehículo están vigentes
   */
  static async checkDocumentExpiry(userId: string): Promise<{
    soatExpired: boolean;
    soatExpiringSoon: boolean;
    tecnomecanicaExpired: boolean;
    tecnomecanicaExpiringSoon: boolean;
  }> {
    try {
      const vehicles = await CarsService.getCarsByDriver(userId);
      if (!vehicles || vehicles.length === 0) {
        throw ErrorHandler.createError(
          AppErrorType.NOT_FOUND,
          'Vehículo no encontrado',
          `User ID: ${userId}`
        );
      }

      const vehicle = vehicles[0];
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = {
        soatExpired: false,
        soatExpiringSoon: false,
        tecnomecanicaExpired: false,
        tecnomecanicaExpiringSoon: false,
      };

      if (vehicle.soat_expiry_date) {
        const soatExpiry = new Date(vehicle.soat_expiry_date);
        result.soatExpired = soatExpiry < now;
        result.soatExpiringSoon = soatExpiry < thirtyDaysFromNow && !result.soatExpired;
      }

      if (vehicle.tecnomecanica_expiry_date) {
        const tecnoExpiry = new Date(vehicle.tecnomecanica_expiry_date);
        result.tecnomecanicaExpired = tecnoExpiry < now;
        result.tecnomecanicaExpiringSoon =
          tecnoExpiry < thirtyDaysFromNow && !result.tecnomecanicaExpired;
      }

      return result;
    } catch (error) {
      throw ErrorHandler.handleWithToast(error, 'DriversService.checkDocumentExpiry');
    }
  }
}
