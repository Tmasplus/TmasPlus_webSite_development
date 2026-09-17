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

const getSupabaseProjectRef = (url: string, fallback: string): string => {
  try {
    return new URL(url).hostname.split('.')[0] || fallback;
  } catch {
    return fallback;
  }
};

const primaryProjectRef = getSupabaseProjectRef(supabaseUrl, 'primary');

// This branch is a test delivery, not a production rollout.
if (primaryProjectRef !== 'lhqhdnjmewyipuwifzsl') {
  throw new Error('La rama booking_v2 requiere la base Prueba. Revisa .env.local antes de iniciar.');
}

// ==================== CONFIGURACIÓN DEL CLIENTE PRINCIPAL ====================
const supabaseConfig = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: `tmasplus_dashboard_auth_${primaryProjectRef}`,
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

// ==================== CLIENTE SECUNDARIO (MEMBERSHIPS DB) ====================
const supabaseSecondaryUrl = import.meta.env.VITE_SUPABASE_SECONDARY_URL;
const supabaseSecondaryAnonKey = import.meta.env.VITE_SUPABASE_SECONDARY_ANON_KEY;
const secondaryProjectRef = supabaseSecondaryUrl
  ? getSupabaseProjectRef(supabaseSecondaryUrl, 'secondary')
  : 'secondary';

if (supabaseSecondaryUrl && secondaryProjectRef !== primaryProjectRef) {
  throw new Error('Las dos conexiones de esta entrega deben apuntar a Prueba.');
}

if (!supabaseSecondaryUrl || !supabaseSecondaryAnonKey) {
  console.warn(
    '⚠️ WARNING: Supabase secondary credentials not found. Memberships feature will not work.'
  );
}

// Separate config for secondary client with unique storage key to avoid conflicts
const supabaseSecondaryConfig = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    storageKey: `tmasplus_dashboard_auth_secondary_${secondaryProjectRef}`,
  },
  global: {
    headers: {
      'X-Client-Info': `TmasPlus-Dashboard@${import.meta.env.VITE_APP_VERSION || '1.0.0'}`,
      'X-App-Platform': 'web-dashboard',
      'X-App-Environment': import.meta.env.VITE_NODE_ENV || 'development',
    },
  },
};

export const supabaseSecondary: SupabaseClient = supabaseSecondaryUrl && supabaseSecondaryAnonKey
  ? createClient(
      supabaseSecondaryUrl,
      supabaseSecondaryAnonKey,
      supabaseSecondaryConfig
    )
  : null as any;

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
