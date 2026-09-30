/**
 * SyncScout (https://syncscout.courtend.net) keeps every team's matches in one
 * Supabase project. Its address and public "anon" key come from the build
 * (VITE_SYNCSCOUT_SUPABASE_URL / VITE_SYNCSCOUT_ANON_KEY, set as GitHub Actions
 * variables for the Pages deploy), so users never type them. Writing a match
 * needs the team's login (team ID + passcode), exactly like the SyncScout viewer.
 */
export const SYNCSCOUT_SUPABASE_URL = (import.meta.env.VITE_SYNCSCOUT_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
export const SYNCSCOUT_ANON_KEY = (import.meta.env.VITE_SYNCSCOUT_ANON_KEY ?? '').trim();
export const SYNCSCOUT_VIEWER_URL = 'https://app.syncscout.courtend.net/';
export const SYNCSCOUT_SITE_URL = 'https://syncscout.courtend.net/';

/** False in a build made without the SyncScout variables: sending is then unavailable. */
export function isSyncScoutAvailable(): boolean {
  return /^https:\/\/.+/.test(SYNCSCOUT_SUPABASE_URL) && SYNCSCOUT_ANON_KEY.length > 0;
}

/** A team login from SyncScout's team-login function. */
export interface SyncScoutAuth {
  token: string;
  teamId: number;
  teamCode: string;
  teamName: string;
  slug: string;
  /** Epoch ms; a little before the token itself expires. */
  expiresAt: number;
}

const AUTH_KEY = 'syncscout-live.syncscout.auth';
const LAST_SLUG_KEY = 'syncscout-live.syncscout.lastSlug';
const LAST_CATEGORY_KEY = 'syncscout-live.syncscout.lastCategory';

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode): the value just is not remembered.
  }
}

function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function loadSyncScoutAuth(): SyncScoutAuth | null {
  const raw = readStorage(AUTH_KEY);
  if (!raw) return null;
  try {
    const auth = JSON.parse(raw) as SyncScoutAuth;
    if (!auth.token || !auth.teamId || !(auth.expiresAt > Date.now())) return null;
    return auth;
  } catch {
    return null;
  }
}

export function saveSyncScoutAuth(auth: SyncScoutAuth): void {
  writeStorage(AUTH_KEY, JSON.stringify(auth));
  writeStorage(LAST_SLUG_KEY, auth.slug);
}

export function clearSyncScoutAuth(): void {
  removeStorage(AUTH_KEY);
}

/** Team ID of the last login, to prefill the login form. */
export function loadLastSyncScoutSlug(): string {
  return readStorage(LAST_SLUG_KEY) ?? '';
}

export function loadLastSyncScoutCategory(): string {
  return readStorage(LAST_CATEGORY_KEY) ?? '';
}

export function saveLastSyncScoutCategory(category: string): void {
  writeStorage(LAST_CATEGORY_KEY, category);
}

const VIDEO_SHIFT_KEY = 'syncscout-live.syncscout.videoShiftSeconds';
export const MAX_VIDEO_SHIFT_SECONDS = 15;

/** Fine-tuning applied on top of the first-serve alignment, remembered per device. */
export function loadVideoShiftSeconds(): number {
  const value = Number(readStorage(VIDEO_SHIFT_KEY));
  return Number.isFinite(value) ? Math.max(-MAX_VIDEO_SHIFT_SECONDS, Math.min(MAX_VIDEO_SHIFT_SECONDS, Math.round(value))) : 0;
}

export function saveVideoShiftSeconds(seconds: number): void {
  writeStorage(VIDEO_SHIFT_KEY, String(seconds));
}
