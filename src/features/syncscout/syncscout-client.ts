import { SYNCSCOUT_ANON_KEY, SYNCSCOUT_SUPABASE_URL, SYNCSCOUT_VIEWER_URL, type SyncScoutAuth } from './syncscout-settings';

export interface SyncScoutUpload {
  dvwText: string;
  /** Original .dvw file name, shown in the SyncScout match list. */
  fileName: string;
  category: string;
  youtubeId: string;
}

export interface SyncScoutUploadResult {
  dvwUrl: string;
  /** Opens the match in the SyncScout viewer. */
  viewerLink: string;
}

/** Why a login failed, mirroring the SyncScout viewer's own messages. */
export type SyncScoutLoginFailure = 'network' | 'locked' | 'payment' | 'inactive' | 'expired' | 'server' | 'invalid';

export type SyncScoutLoginResult =
  | { ok: true; auth: SyncScoutAuth }
  | { ok: false; reason: SyncScoutLoginFailure };

/** The login is no longer accepted (expired or revoked): log in again. */
export class SyncScoutAuthError extends Error {}

const anonHeaders = {
  apikey: SYNCSCOUT_ANON_KEY,
  Authorization: `Bearer ${SYNCSCOUT_ANON_KEY}`,
};

function teamHeaders(auth: SyncScoutAuth) {
  return { apikey: SYNCSCOUT_ANON_KEY, Authorization: `Bearer ${auth.token}` };
}

/** Same team login as the SyncScout viewer: team ID (slug) + passcode. */
export async function loginToSyncScout(slugInput: string, passcode: string): Promise<SyncScoutLoginResult> {
  const slug = slugInput.trim().toLowerCase();
  let response: Response;
  try {
    response = await fetch(`${SYNCSCOUT_SUPABASE_URL}/functions/v1/team-login`, {
      method: 'POST',
      headers: { ...anonHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ slug, passcode: passcode.trim() }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  const data = await response.json().catch(() => ({})) as {
    token?: string;
    error?: string;
    team_id?: number;
    team_code?: string;
    team_name?: string;
    slug?: string;
    expires_in?: number;
  };

  if (response.ok && data.token && data.team_id) {
    return {
      ok: true,
      auth: {
        token: data.token,
        teamId: data.team_id,
        teamCode: data.team_code ?? '',
        teamName: data.team_name ?? slug,
        slug: data.slug ?? slug,
        expiresAt: Date.now() + ((data.expires_in || 3600) - 60) * 1000,
      },
    };
  }
  if (response.status === 429) return { ok: false, reason: 'locked' };
  if (response.status === 403 && data.error === 'payment_required') return { ok: false, reason: 'payment' };
  if (response.status === 403 && data.error === 'team_inactive') return { ok: false, reason: 'inactive' };
  if (response.status === 403) return { ok: false, reason: 'expired' };
  if (response.status >= 500) return { ok: false, reason: 'server' };
  return { ok: false, reason: 'invalid' };
}

async function describeFailure(step: string, response: Response): Promise<Error> {
  if (response.status === 401 || response.status === 403) {
    return new SyncScoutAuthError(`${step} (${response.status})`);
  }
  let detail = '';
  try {
    detail = (await response.text()).slice(0, 300);
  } catch {
    // ignore unreadable bodies
  }
  return new Error(`${step} (${response.status}) ${detail}`.trim());
}

/** Categories the team already uses, for suggestions. */
export async function fetchSyncScoutCategories(auth: SyncScoutAuth): Promise<string[]> {
  try {
    const response = await fetch(`${SYNCSCOUT_SUPABASE_URL}/rest/v1/matches?select=category&is_deleted=eq.false`, {
      headers: teamHeaders(auth),
    });
    if (!response.ok) return [];
    const rows = (await response.json()) as Array<{ category?: string }>;
    return [...new Set(rows.map((row) => row.category?.trim()).filter((c): c is string => Boolean(c)))].sort();
  } catch {
    return [];
  }
}

/**
 * Uploads a match the same way the SyncScout viewer's "add match" form does:
 * the .dvw goes to the `dvw_files` storage bucket and a row for the logged-in
 * team is added to the `matches` table.
 */
export async function uploadMatchToSyncScout(
  auth: SyncScoutAuth,
  upload: SyncScoutUpload,
): Promise<SyncScoutUploadResult> {
  // Storage keys must be plain ASCII; the readable name goes into the table.
  const storageName = `${Date.now()}_${upload.fileName.replace(/[^\w.-]+/g, '_')}`;
  const storageResponse = await fetch(`${SYNCSCOUT_SUPABASE_URL}/storage/v1/object/dvw_files/${encodeURIComponent(storageName)}`, {
    method: 'POST',
    headers: { ...teamHeaders(auth), 'Content-Type': 'text/plain; charset=utf-8' },
    body: upload.dvwText,
  });
  if (!storageResponse.ok) {
    throw await describeFailure('Storage upload failed', storageResponse);
  }

  const dvwUrl = `${SYNCSCOUT_SUPABASE_URL}/storage/v1/object/public/dvw_files/${encodeURIComponent(storageName)}`;
  const insertResponse = await fetch(`${SYNCSCOUT_SUPABASE_URL}/rest/v1/matches`, {
    method: 'POST',
    headers: { ...teamHeaders(auth), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify([{
      category: upload.category,
      dvw_filename: upload.fileName,
      dvw_url: dvwUrl,
      youtube_id: upload.youtubeId,
      team_code: auth.teamCode,
      team_id: auth.teamId,
    }]),
  });
  if (!insertResponse.ok) {
    throw await describeFailure('Match registration failed', insertResponse);
  }

  return { dvwUrl, viewerLink: `${SYNCSCOUT_VIEWER_URL}?match=${encodeURIComponent(dvwUrl)}` };
}
