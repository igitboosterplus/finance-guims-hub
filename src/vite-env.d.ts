/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_AI_REPORT_PROVIDER?: string;
  readonly VITE_AI_REPORT_AVAILABLE_PROVIDERS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
