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
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
  