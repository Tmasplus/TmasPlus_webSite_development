import { createClient, SupabaseClient } from '@supabase/supabase-js';
// Tipos generados del esquema CONSOLIDADO (aplicacioncore). Los servicios aún
// no migrados que importan tipos del viejo database.types.ts mostrarán errores
// de tipo (no bloquean en dev) hasta que se reescriban.
import type { Database } from './database.new.types';

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

// The consolidated model is tested alongside booking_v2 in Prueba, never in core's source project.
const EXPECTED_PROJECT_REF = 'lhqhdnjmewyipuwifzsl';
if (primaryProjectRef !== EXPECTED_PROJECT_REF ||
    new URL(supabaseUrl).origin !== `https://${EXPECTED_PROJECT_REF}.supabase.co`) {
  throw new Error(
    `Esta rama requiere el proyecto Prueba de booking_v2. Revisa VITE_SUPABASE_URL en .env.local — se esperaba el proyecto ${EXPECTED_PROJECT_REF}.`
  );
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

// ==================== CLIENTE SECUNDARIO (OBSOLETO) ====================
// Tras la consolidación NO hay base secundaria: memberships, complaints, etc.
// viven en el mismo proyecto. `supabaseSecondary` queda como ALIAS del cliente
// único para que los servicios que aún lo importan sigan funcionando; se
// eliminará cuando esos servicios se migren al esquema nuevo.
export const supabaseSecondary: SupabaseClient = supabase;

// ==================== FUNCIONES DE UTILIDAD ====================

/**
 * Verifica la conexión con Supabase
 */
export const testConnection = async (): Promise<{
  isConnected: boolean;
  error?: string;
}> => {
  try {
    // Esquema consolidado: `users` ya no existe; se valida contra `persona`.
    const { error } = await supabase
      .from('persona')
      .select('*', { count: 'exact', head: true });

    // Si llegamos aquí (sin throw), el servidor RESPONDIÓ → hay conexión.
    // Un `error` aquí (p.ej. 401 por RLS en petición anónima) NO es desconexión;
    // solo un fallo de red (catch) lo es.
    return { isConnected: true, error: error?.message };
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

// Nota: la prueba automática de conexión se retiró porque corría como anónima y
// generaba un 401 (RLS) cosmético en consola. testConnection() sigue disponible
// para invocarse manualmente si se necesita.

export default supabase;
