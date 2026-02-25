// TIPOS COPIADOS DE LA APP MÓVIL
// Este archivo es idéntico al de la app móvil

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          auth_id: string | null;
          email: string;
          first_name: string;
          last_name: string;
          mobile: string | null;
          user_type: string;
          wallet_balance: number;
          location: Json | null;
          profile_image: string | null;
          rating: number;
          total_rides: number;
          is_verified: boolean;
          approved: boolean;
          blocked: boolean;
          referral_id: string | null;
          city: string | null;
          driver_active_status: boolean;
          license_number: string | null;
          license_image: string | null;
          license_image_back: string | null;
          soat_image: string | null;
          card_prop_image: string | null;
          card_prop_image_bk: string | null;
          verify_id_image: string | null;
          verify_id_image_bk: string | null;
          push_token: string | null;
          user_platform: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          auth_id?: string | null;
          email: string;
          first_name: string;
          last_name: string;
          mobile?: string | null;
          user_type?: string;
          wallet_balance?: number;
          location?: Json | null;
          profile_image?: string | null;
          rating?: number;
          total_rides?: number;
          is_verified?: boolean;
          approved?: boolean;
          blocked?: boolean;
          referral_id?: string | null;
          city?: string | null;
          driver_active_status?: boolean;
          license_number?: string | null;
          license_image?: string | null;
          license_image_back?: string | null;
          soat_image?: string | null;
          card_prop_image?: string | null;
          card_prop_image_bk?: string | null;
          verify_id_image?: string | null;
          verify_id_image_bk?: string | null;
          push_token?: string | null;
          user_platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          auth_id?: string | null;
          email?: string;
          first_name?: string;
          last_name?: string;
          mobile?: string | null;
          user_type?: string;
          wallet_balance?: number;
          location?: Json | null;
          profile_image?: string | null;
          rating?: number;
          total_rides?: number;
          is_verified?: boolean;
          approved?: boolean;
          blocked?: boolean;
          referral_id?: string | null;
          city?: string | null;
          driver_active_status?: boolean;
          license_number?: string | null;
          license_image?: string | null;
          license_image_back?: string | null;
          soat_image?: string | null;
          card_prop_image?: string | null;
          card_prop_image_bk?: string | null;
          verify_id_image?: string | null;
          verify_id_image_bk?: string | null;
          push_token?: string | null;
          user_platform?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cars: {
        Row: {
          id: string;
          driver_id: string | null;
          make: string;
          model: string;
          year: number | null;
          color: string | null;
          plate: string;
          car_image: string | null;
          vehicle_number: string | null;
          vehicle_model: string | null;
          vehicle_make: string | null;
          vehicle_color: string | null;
          fuel_type: string;
          transmission: string;
          capacity: number;
          is_active: boolean;
          features: Json | null;
          created_at: string;
          updated_at: string;
          // Campos de documentos
          soat_image: string | null;
          soat_expiry_date: string | null;
          card_prop_image: string | null;
          card_prop_image_back: string | null;
          tecnomecanica_image: string | null;
          tecnomecanica_expiry_date: string | null;
          camara_comercio_image: string | null;
          service_type: string | null;
        };  
        Insert: {
          id?: string;
          driver_id?: string | null;
          make: string;
          model: string;
          year?: number | null;
          color?: string | null;
          plate: string;
          car_image?: string | null;
          vehicle_number?: string | null;
          vehicle_model?: string | null;
          vehicle_make?: string | null;
          vehicle_color?: string | null;
          fuel_type?: string;
          transmission?: string;
          capacity?: number;
          is_active?: boolean;
          features?: Json | null;
          created_at?: string;
          updated_at?: string;
          // Campos de documentos
          soat_image?: string | null;
          soat_expiry_date?: string | null;
          card_prop_image?: string | null;
          card_prop_image_back?: string | null;
          tecnomecanica_image?: string | null;
          tecnomecanica_expiry_date?: string | null;
          camara_comercio_image?: string | null;
          service_type?: string | null;
        };  
        Update: {
          id?: string;
          driver_id?: string | null;
          make?: string;
          model?: string;
          year?: number | null;
          color?: string | null;
          plate?: string;
          car_image?: string | null;
          vehicle_number?: string | null;
          vehicle_model?: string | null;
          vehicle_make?: string | null;
          vehicle_color?: string | null;
          fuel_type?: string;
          transmission?: string;
          capacity?: number;
          is_active?: boolean;
          features?: Json | null;
          created_at?: string;
          updated_at?: string;
          // Campos de documentos agregados
          soat_image?: string | null;
          soat_expiry_date?: string | null;
          card_prop_image?: string | null;
          card_prop_image_back?: string | null;
          tecnomecanica_image?: string | null;
          tecnomecanica_expiry_date?: string | null;
          camara_comercio_image?: string | null;
          service_type?: string | null;
        };
      };
      referral_codes: {
        Row: {
          id: string;
          driver_id: string;
          referral_code: string;
          created_at: string;
          is_active: boolean;
          total_referrals: number;
        };
        Insert: {
          id?: string;
          driver_id: string;
          referral_code: string;
          created_at?: string;
          is_active?: boolean;
          total_referrals?: number;
        };
        Update: {
          id?: string;
          driver_id?: string;
          referral_code?: string;
          created_at?: string;
          is_active?: boolean;
          total_referrals?: number;
        };
      };
      referrals: {
        Row: {
          id: string;
          referral_code_id: string;
          referred_driver_id: string;
          referral_code: string;
          referred_at: string;
          status: string;
          reward_claimed: boolean;
        };
        Insert: {
          id?: string;
          referral_code_id: string;
          referrer_id?: string | null;
          referred_driver_id: string;
          referral_code: string;
          referred_at?: string;
          status?: string;
          reward_claimed?: boolean;
        };
        Update: {
          id?: string;
          referral_code_id?: string;
          referred_driver_id?: string;
          referral_code?: string;
          referred_at?: string;
          status?: string;
          reward_claimed?: boolean;
        };
      };  
      bookings: {
        Row: {
          id: string;
          customer_id: string | null;
          driver_id: string | null;
          car_type_id: string | null;
          car_id: string | null;
          status: string;
          pickup_location: Json;
          destination_location: Json;
          drop_location: Json | null;
          distance: number | null;
          duration: number | null;
          price: number;
          payment_mode: string;
          rating: number | null;
          review: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          customer_id?: string | null;
          driver_id?: string | null;
          car_type_id?: string | null;
          car_id?: string | null;
          status?: string;
          pickup_location: Json;
          destination_location: Json;
          drop_location?: Json | null;
          distance?: number | null;
          duration?: number | null;
          price: number;
          payment_mode?: string;
          rating?: number | null;
          review?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          driver_id?: string | null;
          car_type_id?: string | null;
          car_id?: string | null;
          status?: string;
          pickup_location?: Json;
          destination_location?: Json;
          drop_location?: Json | null;
          distance?: number | null;
          duration?: number | null;
          price?: number;
          payment_mode?: string;
          rating?: number | null;
          review?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      tracking: {
        Row: {
          id: string;
          booking_id: string | null;
          status: string;
          latitude: number;
          longitude: number;
          timestamp_ms: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id?: string | null;
          status: string;
          latitude: number;
          longitude: number;
          timestamp_ms: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string | null;
          status?: string;
          latitude?: number;
          longitude?: number;
          timestamp_ms?: number;
          created_at?: string;
        };
      };
      wallet_history: {
        Row: {
          id: string;
          user_id: string | null;
          type: string;
          amount: number;
          balance: number;
          description: string;
          booking_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          type: string;
          amount: number;
          balance: number;
          description: string;
          booking_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          type?: string;
          amount?: number;
          balance?: number;
          description?: string;
          booking_id?: string | null;
          created_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string | null;
          title: string;
          message: string;
          type: string;
          is_read: boolean;
          data: Json | null;
          booking_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          title: string;
          message: string;
          type?: string;
          is_read?: boolean;
          data?: Json | null;
          booking_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          title?: string;
          message?: string;
          type?: string;
          is_read?: boolean;
          data?: Json | null;
          booking_id?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ==================== TIPOS HELPER ====================
export type UserRow = Database['public']['Tables']['users']['Row'];
export type UserInsert = Database['public']['Tables']['users']['Insert'];
export type UserUpdate = Database['public']['Tables']['users']['Update'];

export type CarRow = Database['public']['Tables']['cars']['Row'];
export type CarInsert = Database['public']['Tables']['cars']['Insert'];
export type CarUpdate = Database['public']['Tables']['cars']['Update'];

export type BookingRow = Database['public']['Tables']['bookings']['Row'];
export type NotificationRow = Database['public']['Tables']['notifications']['Row'];
export type TrackingRow = Database['public']['Tables']['tracking']['Row'];
export type WalletHistoryRow = Database['public']['Tables']['wallet_history']['Row'];

// ==================== TIPOS PERSONALIZADOS ====================
export type UserType = 'customer' | 'driver' | 'company' | 'admin';
export type BookingStatus =
  | 'NEW'
  | 'ACCEPTED'
  | 'STARTED'
  | 'REACHED'
  | 'PAID'
  | 'COMPLETE'
  | 'CANCELLED';
export type PaymentMode = 'cash' | 'wallet' | 'card';
export type FuelType = 'gasolina' | 'diesel' | 'electrico' | 'hibrido';
export type TransmissionType = 'manual' | 'automatico';
export type WalletTransactionType = 'credit' | 'debit';

export interface LocationData {
  lat: number;
  lng: number;
  address?: string;
}

// ==================== ENUMS ADICIONALES ====================

/**
 * Tipos de servicio de conductor
 */
export type DriverServiceType = 'particular' | 'servicio_especial' | 'taxi_plus';

/**
 * Tipo de documento del conductor
 */
export type DriverDocumentType =
  | 'cedula_frente'
  | 'cedula_posterior'
  | 'licencia_frente'
  | 'licencia_posterior';

/**
 * Tipo de documento del vehículo
 */
export type VehicleDocumentType =
  | 'tarjeta_propiedad'
  | 'soat'
  | 'tecnomecanica'
  | 'camara_comercio';

/**
 * Estado de aprobación de conductor
 */
export type DriverApprovalStatus = 'pending' | 'approved' | 'rejected';



// ==================== INTERFACES DE DOCUMENTOS ====================

/**
 * Documento del conductor
 */
export interface DriverDocument {
  type: DriverDocumentType;
  url: string;
  uploadedAt: string;
  verified: boolean;
}

/**
 * Documento del vehículo
 */
export interface VehicleDocument {
  type: VehicleDocumentType;
  url: string;
  uploadedAt: string;
  verified: boolean;
  expiryDate?: string;
}

/**
 * Datos de empresa para servicio especial y taxi
 */
export interface CompanyData {
  razonSocial?: string;
  nit?: string;
  direccion?: string;
  ciudad?: string;
  nombreRepresentante?: string;
  tipoDocumentoRepresentante?: string;
  numeroDocumentoRepresentante?: string;
  camaraComercioUrl?: string;
}

/**
 * Perfil completo de conductor para dashboard admin
 */
export interface DriverProfile extends UserRow {
  vehicle?: CarRow;
  companyData?: CompanyData;
  serviceType: DriverServiceType;
}

// ==================== INTERFACES DE REGISTRO ====================

/**
 * Datos para registro de nuevo conductor - Paso 1
 */
export interface DriverRegistrationStep1 {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  mobile: string;
  city: string;
  referral_code?: string;
}

/**
 * Datos para registro de nuevo conductor - Paso 2
 */
export interface DriverRegistrationStep2 {
  license_number: string;
  cedula_frente: File;
  cedula_posterior: File;
  licencia_frente: File;
  licencia_posterior: File;
}

/**
 * Datos para registro de nuevo conductor - Paso 3
 */
export interface DriverRegistrationStep3 {
  serviceType: DriverServiceType;
  vehicle: {
    make: string;
    model: string;
    year: number;
    color: string;
    plate: string;
    fuel_type: FuelType;
    transmission: TransmissionType;
    capacity: number;
  };
  tarjeta_propiedad: File;
  soat: File;
  soat_expiry_date: string;
  tecnomecanica?: File;
  tecnomecanica_expiry_date?: string;
  camara_comercio?: File;
}

/**
 * Datos para registro de nuevo conductor - Paso 4
 */
export interface DriverRegistrationStep4 {
  companyData?: CompanyData;
}

/**
 * Datos completos para registro de conductor
 */
export interface DriverRegistrationData
  extends DriverRegistrationStep1,
    DriverRegistrationStep2,
    DriverRegistrationStep3,
    DriverRegistrationStep4 {}

/**
 * Resultado del registro de conductor
 */
export interface DriverRegistrationResult {
  success: boolean;
  userId?: string;
  carId?: string;
  message: string;
  errors?: Record<string, string>;
}

// ==================== FILTROS Y CONSULTAS ====================

/**
 * Filtros para listado de conductores
 */
export interface DriverFilters {
  approved?: boolean | null;
  blocked?: boolean;
  city?: string;
  serviceType?: DriverServiceType;
  searchQuery?: string;
}

/**
 * Opciones de paginación
 */
export interface PaginationOptions {
  page: number;
  limit: number;
}

/**
 * Resultado paginado genérico
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

// ==================== STORAGE ====================

/**
 * Resultado de upload de archivo
 */
export interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  error?: string;
}

/**
 * Opciones de upload
 */
export interface UploadOptions {
  bucket: string;
  folder: string;
  file: File;
  filename?: string;
  maxSizeBytes?: number;
  allowedTypes?: readonly string[];
}

/**
 * Metadatos de archivo en Storage
 */
export interface StorageFileMetadata {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  path: string;
  uploadedAt: string;
}

// Tipos para la tabla referral_codes
export type ReferralCodeRow = Database['public']['Tables']['referral_codes']['Row'];
export type ReferralCodeInsert = Database['public']['Tables']['referral_codes']['Insert'];
export type ReferralCodeUpdate = Database['public']['Tables']['referral_codes']['Update'];

// Tipos para la tabla referrals
export type ReferralRow = Database['public']['Tables']['referrals']['Row'];
export type ReferralInsert = Database['public']['Tables']['referrals']['Insert'];
export type ReferralUpdate = Database['public']['Tables']['referrals']['Update'];

// Tipos de estado de referido
export type ReferralStatus = 'pending' | 'completed' | 'cancelled';

// Interfaz extendida para referral con información del conductor
export interface ReferralWithDriver extends ReferralRow {
  referred_driver?: UserRow;
  referrer_driver?: UserRow;
}

// Interfaz para código de referido con estadísticas
export interface ReferralCodeWithStats extends ReferralCodeRow {
  driver?: UserRow;
  referrals?: ReferralRow[];
  successful_referrals?: number;
  pending_referrals?: number;
}

// Interfaz para datos de referido en el registro
export interface ReferralData {
  referral_code: string;
}

// Estadísticas de referidos para un conductor
export interface DriverReferralStats {
  total_referrals: number;
  completed_referrals: number;
  pending_referrals: number;
  total_rewards: number;
  unclaimed_rewards: number;
}
