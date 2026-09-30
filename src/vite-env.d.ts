/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.svg' {
  const src: string;
  export default src;
}

declare module '*.ttf?url' {
  const src: string;
  export default src;
}

interface ImportMetaEnv {
  /** SyncScout's Supabase address, set at build time (GitHub Actions variable). */
  readonly VITE_SYNCSCOUT_SUPABASE_URL?: string;
  /** SyncScout's public anon key, set at build time (GitHub Actions variable). */
  readonly VITE_SYNCSCOUT_ANON_KEY?: string;
}
