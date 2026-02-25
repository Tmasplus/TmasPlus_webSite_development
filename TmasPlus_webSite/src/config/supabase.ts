import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// ==================== VALIDACIÓN DE VARIABLES DE ENTORNO ====================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    '⚠️ CRITICAL: Supabase credentials not found. Please check your .env.local file.'
  );
}

// ==================== CONFIGURACIÓN DEL CLIENTE ====================
const supabaseConfig = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: 'tmasplus_dashboard_auth',
  },
  global: {
    headers: {
      'X-Client-Info': `TmasPlus-Dashboard@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
      'X-App-Platform': 'web-dashboard',
      'X-App-Environment': import.meta.env.VITE_NODE_ENV || 'development',
    },
  },
};

// ==================== CLIENTE PRINCIPAL SUPABASE ====================
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
  supabaseConfig
);

// ==================== FUNCIONES DE UTILIDAD ====================

/**
 * Verifica la conexión con Supabase
 */
export const testConnection = async (): Promise<{
  isConnected: boolean;
  error?: string;
}> => {
  try {
    const { error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true })
      .limit(1);

    if (error) {
      return { isConnected: false, error: error.message };
    }

    return { isConnected: true };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

/**
 * Obtiene el usuario actual autenticado
 */
export const getCurrentUser = async () => {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('Error getting current user:', error.message);
    return null;
  }

  return user;
};

/**
 * Obtiene la sesión actual
 */
export const getCurrentSession = async () => {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error.message);
    return null;
  }

  return session;
};

// ==================== CONSTANTES DE STORAGE ====================
export const STORAGE_BUCKETS = {
  PROFILES: import.meta.env.VITE_STORAGE_BUCKET_PROFILES || 'user-profiles',
  DOCUMENTS: import.meta.env.VITE_STORAGE_BUCKET_DOCUMENTS || 'user-documents',
  CARS: import.meta.env.VITE_STORAGE_BUCKET_CARS || 'car-images',
  BOOKINGS: import.meta.env.VITE_STORAGE_BUCKET_BOOKINGS || 'booking-media',
} as const;

// ==================== LOG DE CONEXIÓN (SOLO DESARROLLO) ====================
if (import.meta.env.DEV) {
  testConnection().then(({ isConnected, error }) => {
    console.log('=== SUPABASE CONNECTION STATUS ===');
    console.log('URL:', supabaseUrl);
    console.log('Status:', isConnected ? '✅ CONNECTED' : '❌ FAILED');
    if (error) {
      console.error('Error:', error);
    }
    console.log('===================================');
  });
}

export default supabase;
