/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_ACCESS_CODES?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
