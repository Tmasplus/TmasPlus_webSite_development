/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_APP_NAME: string;
    readonly VITE_APP_VERSION: string;
    readonly VITE_NODE_ENV: string;
    readonly VITE_STORAGE_BUCKET_PROFILES: string;
    readonly VITE_STORAGE_BUCKET_DOCUMENTS: string;
    readonly VITE_STORAGE_BUCKET_CARS: string;
    readonly VITE_STORAGE_BUCKET_BOOKINGS: string;
    readonly VITE_POLLING_INTERVAL: string;
    /** "true": el módulo Empresas usa datos de demostración del navegador en vez de core. */
    readonly VITE_COMPANIES_DEMO?: string;
    /** Solo desarrollo: acceso de prueba al portal de empresas (no es una cuenta real). */
    readonly VITE_DEMO_COMPANY_EMAIL?: string;
    readonly VITE_DEMO_COMPANY_PASSWORD?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  