// ==================== CONSTANTES GLOBALES T+PLUS ====================

export const APP_CONFIG = {
    NAME: 'T+Plus Dashboard',
    VERSION: '1.0.0',
    COMPANY: 'T+Plus',
  } as const;
  
  export const USER_TYPES = {
    CUSTOMER: 'customer',
    DRIVER: 'driver',
    COMPANY: 'company',
    ADMIN: 'admin',
  } as const;
  
  export const BOOKING_STATUSES = {
    NEW: 'NEW',
    ACCEPTED: 'ACCEPTED',
    STARTED: 'STARTED',
    REACHED: 'REACHED',
    PAID: 'PAID',
    COMPLETE: 'COMPLETE',
    CANCELLED: 'CANCELLED',
  } as const;
  
  export const PAYMENT_MODES = {
    CASH: 'cash',
    WALLET: 'wallet',
    CARD: 'card',
  } as const;
  
  export const FUEL_TYPES = {
    GASOLINA: 'gasolina',
    DIESEL: 'diesel',
    ELECTRICO: 'electrico',
    HIBRIDO: 'hibrido',
  } as const;
  
  export const TRANSMISSION_TYPES = {
    MANUAL: 'manual',
    AUTOMATICO: 'automatico',
  } as const;
  
  export const DEFAULT_DRIVER_VALUES = {
    wallet_balance: 0,
    rating: 0,
    total_rides: 0,
    is_verified: false,
    approved: false,
    blocked: false,
    driver_active_status: false,
  } as const;
  
  // Polling interval para simular realtime (5 segundos)
  export const POLLING_INTERVAL = Number(import.meta.env.VITE_POLLING_INTERVAL) || 5000;
  
  // Configuración de paginación
  export const PAGINATION = {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
  } as const;
  