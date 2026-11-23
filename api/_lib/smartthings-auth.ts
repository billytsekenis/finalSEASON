import { decrypt, encrypt, randomToken, sha256b64url } from './crypto.js';
import { HttpError } from './http.js';
import { ProviderError } from './providers/types.js';
import { store } from './store.js';

/**
 * Σύνδεση με SmartThings.
 *
 * Ο λογαριασμός Samsung δεν επιτρέπει τη δημιουργία δικού μας OAuth app (το /v1/apps επιστρέφει 403),
 * οπότε χρησιμοποιούμε τη δημόσια ροή OAuth + PKCE του επίσημου SmartThings CLI. Δίνει access token
 * (24 ώρες) και refresh token (30 ημέρες, ανανεώνεται σε κάθε χρήση). Ένα καθημερινό cron το ανανεώνει,
 * οπότε η σύνδεση δεν λήγει ποτέ. Τα tokens αποθηκεύονται κρυπτογραφημένα (AES-GCM) στον server.
 */

const CLIENT_ID = 'd18cf96e-c626-4433-bf51-ddbb10c5d1ed';
const OAUTH_BASE = 'https://oauthin-regional.api.smartthings.com/oauth';
const REFRESH_URL = 'https://auth-global.api.smartthings.com/oauth/token';
const REDIRECT_URI = 'http://localhost:61973/finish';

const AUTH_KEY = 'st:auth';
const PKCE_KEY = 'st:pkce';
const LOCK_KEY = 'st:refresh-lock';

interface StoredAuth {
  kind: 'oauth' | 'pat';
  accessToken: string;
  refreshToken?: string;
  /** epoch ms */
  expiresAt: number;
  connectedAt: number;
}

async function load(): Promise<StoredAuth | null> {
  const raw = await store().get(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as StoredAuth;
  } catch {
    return null;
  }
}

async function save(a: StoredAuth): Promise<void> {
  await store().set(AUTH_KEY, encrypt(JSON.stringify(a)));
}

export async function disconnect(): Promise<void> {
  await store().del(AUTH_KEY);
}

export async function authStatus(): Promise<{ connected: boolean; kind?: string; expiresAt?: number }> {
  const a = await load();
  if (!a) return { connected: false };
  if (a.kind === 'pat' && a.expiresAt < Date.now()) return { connected: false, kind: a.kind };
  return { connected: true, kind: a.kind, expiresAt: a.expiresAt };
}

/** Ξεκινά τη ροή σύνδεσης: επιστρέφει το URL που ανοίγει ο χρήστης στο Safari. */
export async function startAuthorization(): Promise<string> {
  const verifier = randomToken(32);
  await store().set(PKCE_KEY, encrypt(verifier), { ttlSec: 15 * 60 });
  const url = new URL(`${OAUTH_BASE}/authorize`);
  url.search = new URLSearchParams({
    scope: 'controller:stCli',
    response_type: 'code',
    client_id: CLIENT_ID,
    code_challenge: sha256b64url(verifier),
    code_challenge_method: 'S256',
    redirect_uri: REDIRECT_URI,
    client_type: 'USER_LEVEL',
  }).toString();
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!res.ok || !data.access_token) {
    throw new HttpError(400, `SmartThings: ${data.error_description ?? data.error ?? `HTTP ${res.status}`}`);
  }
  return data as TokenResponse;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ολοκληρώνει τη σύνδεση. Δέχεται:
 *  - το URL `http://localhost:61973/finish?code=…` που εμφανίζει το Safari μετά το login, ή σκέτο το code
 *  - ή ένα Personal Access Token (ισχύει 24 ώρες, χρήσιμο μόνο για γρήγορη δοκιμή)
 */
export async function completeAuthorization(input: string): Promise<{ kind: 'oauth' | 'pat' }> {
  const value = input.trim();
  if (!value) throw new HttpError(400, 'Κενό πεδίο');

  let code: string | null = null;
  if (value.includes('code=')) {
    try {
      const u = new URL(value.startsWith('http') ? value : `http://x/?${value.split('?').pop()}`);
      code = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      if (err) throw new HttpError(400, `SmartThings: ${u.searchParams.get('error_description') ?? err}`);
    } catch (e) {
      if (e instanceof HttpError) throw e;
      const m = value.match(/code=([^&\s]+)/);
      code = m ? decodeURIComponent(m[1]!) : null;
    }
  } else if (UUID_RE.test(value)) {
    // Δοκιμάζουμε πρώτα αν είναι PAT
    const res = await fetch('https://api.smartthings.com/v1/locations', { headers: { Authorization: `Bearer ${value}` } });
    if (res.ok) {
      await save({ kind: 'pat', accessToken: value, expiresAt: Date.now() + 24 * 3600 * 1000, connectedAt: Date.now() });
      return { kind: 'pat' };
    }
    code = value;
  } else {
    code = value;
  }
  if (!code) throw new HttpError(400, 'Δεν βρέθηκε κωδικός (code=…) στο κείμενο που επικόλλησες');

  const rawVerifier = await store().get(PKCE_KEY);
  if (!rawVerifier) throw new HttpError(400, 'Η διαδικασία έληξε. Πάτησε ξανά «Σύνδεση με SmartThings».');
  const verifier = decrypt(rawVerifier);

  const t = await tokenRequest(`${OAUTH_BASE}/token`, {
    grant_type: 'authorization_code',
    client_id: CLIENT_ID,
    code_verifier: verifier,
    code,
    redirect_uri: REDIRECT_URI,
  });
  await store().del(PKCE_KEY);
  await save({
    kind: 'oauth',
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    connectedAt: Date.now(),
  });
  return { kind: 'oauth' };
}

async function refresh(a: StoredAuth): Promise<StoredAuth> {
  if (!a.refreshToken) throw new ProviderError('Το SmartThings token έληξε. Σύνδεσε ξανά το SmartThings.', 'auth');
  const gotLock = await store().set(LOCK_KEY, '1', { ttlSec: 20, nx: true });
  if (!gotLock) {
    // Άλλο αίτημα κάνει ήδη ανανέωση: περιμένουμε και ξαναδιαβάζουμε.
    await new Promise((r) => setTimeout(r, 1500));
    const again = await load();
    if (again && again.expiresAt > Date.now() + 60_000) return again;
  }
  try {
    const t = await tokenRequest(REFRESH_URL, {
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: a.refreshToken,
    });
    const next: StoredAuth = {
      ...a,
      accessToken: t.access_token,
      refreshToken: t.refresh_token ?? a.refreshToken,
      expiresAt: Date.now() + t.expires_in * 1000,
    };
    await save(next);
    return next;
  } catch (e) {
    throw new ProviderError(
      `Αποτυχία ανανέωσης σύνδεσης SmartThings${e instanceof Error ? `: ${e.message}` : ''}. Σύνδεσε ξανά το SmartThings.`,
      'auth',
    );
  } finally {
    await store().del(LOCK_KEY).catch(() => {});
  }
}

/** Επιστρέφει έγκυρο access token, ανανεώνοντάς το αν λήγει σε λιγότερο από 1 ώρα. */
export async function accessToken(opts: { forceRefresh?: boolean } = {}): Promise<string> {
  let a = await load();
  if (!a) throw new ProviderError('Το SmartThings δεν έχει συνδεθεί', 'not_connected');
  if (a.kind === 'pat') {
    if (a.expiresAt < Date.now()) throw new ProviderError('Το προσωρινό token SmartThings έληξε. Σύνδεσε ξανά.', 'auth');
    return a.accessToken;
  }
  if (opts.forceRefresh || a.expiresAt - Date.now() < 3600_000) a = await refresh(a);
  return a.accessToken;
}
