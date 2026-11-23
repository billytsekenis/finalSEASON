import { createHash, randomBytes } from 'node:crypto';
import { decrypt, encrypt } from './crypto.js';
import { HttpError } from './http.js';
import { ProviderError } from './providers/types.js';
import { store } from './store.js';

/**
 * Σύνδεση με το Xiaomi Cloud (λογαριασμός Mi Home), όπως κάνει η επίσημη εφαρμογή.
 * Ο κωδικός χρησιμοποιείται μόνο τη στιγμή της σύνδεσης (ως MD5 hash) και ΔΕΝ αποθηκεύεται.
 * Αποθηκεύονται κρυπτογραφημένα μόνο τα serviceToken/ssecurity.
 */

const AUTH_KEY = 'xm:auth';
const DEVICE_KEY = 'xm:device-id';
const UA = 'Android-7.1.1-1.0.0-ONEPLUS A3010-136-AAAAAAAAAAAAA APP/xiaomi.smarthome APPV/62830';

export type XiaomiRegion = 'de' | 'cn' | 'us' | 'ru' | 'sg' | 'i2';

export interface XiaomiAuth {
  userId: string;
  ssecurity: string;
  serviceToken: string;
  region: XiaomiRegion;
  deviceId: string;
  connectedAt: number;
  /** true όταν έχει εντοπιστεί αυτόματα ο server όπου είναι πραγματικά online οι συσκευές */
  regionDetected?: boolean;
}

export async function loadXiaomiAuth(): Promise<XiaomiAuth | null> {
  const raw = await store().get(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as XiaomiAuth;
  } catch {
    return null;
  }
}

export async function disconnectXiaomi() {
  await store().del(AUTH_KEY);
}

async function deviceId(): Promise<string> {
  // Σταθερό deviceId: μετά την επαλήθευση (2FA) η Xiaomi «εμπιστεύεται» αυτή τη συσκευή.
  const existing = await store().get(DEVICE_KEY);
  if (existing) return existing;
  const id = randomBytes(8).toString('hex').toUpperCase();
  await store().set(DEVICE_KEY, id);
  return id;
}

function parseXmJson<T>(text: string): T {
  return JSON.parse(text.replace('&&&START&&&', '')) as T;
}

function cookieValue(res: Response, name: string): string | null {
  for (const c of res.headers.getSetCookie()) {
    const m = c.match(new RegExp(`^${name}=([^;]*)`));
    if (m && m[1] && m[1] !== 'EXPIRED') return m[1];
  }
  return null;
}

export type XiaomiLoginResult =
  | { status: 'connected' }
  | { status: 'verify'; url: string }
  | { status: 'captcha' };

export async function loginXiaomi(username: string, password: string, region: XiaomiRegion): Promise<XiaomiLoginResult> {
  if (!username || !password) throw new HttpError(400, 'Συμπλήρωσε λογαριασμό και κωδικό');
  const did = await deviceId();
  const baseCookies = `sdkVersion=accountsdk-18.8.15; deviceId=${did}`;

  const r1 = await fetch('https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true', {
    headers: { 'User-Agent': UA, Cookie: `${baseCookies}; userId=${encodeURIComponent(username)}` },
  });
  const s1 = parseXmJson<{ _sign?: string }>(await r1.text());
  const sign = s1._sign ?? '';

  const body = new URLSearchParams({
    sid: 'xiaomiio',
    hash: createHash('md5').update(password).digest('hex').toUpperCase(),
    callback: 'https://sts.api.io.mi.com/sts',
    qs: '%3Fsid%3Dxiaomiio%26_json%3Dtrue',
    user: username,
    _sign: sign,
    _json: 'true',
  });
  const r2 = await fetch('https://account.xiaomi.com/pass/serviceLoginAuth2', {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: baseCookies },
    body: body.toString(),
  });
  const s2 = parseXmJson<{
    ssecurity?: string;
    userId?: number | string;
    location?: string;
    code?: number;
    desc?: string;
    notificationUrl?: string;
    captchaUrl?: string;
  }>(await r2.text());

  if (s2.notificationUrl) {
    const url = s2.notificationUrl.startsWith('http') ? s2.notificationUrl : `https://account.xiaomi.com${s2.notificationUrl}`;
    return { status: 'verify', url };
  }
  if (s2.captchaUrl) return { status: 'captcha' };
  if (!s2.ssecurity || !s2.location || !s2.userId) {
    throw new HttpError(401, s2.code === 70016 ? 'Λάθος λογαριασμός ή κωδικός Xiaomi' : `Η Xiaomi απέρριψε τη σύνδεση (${s2.desc ?? s2.code ?? 'άγνωστο'})`);
  }

  const r3 = await fetch(s2.location, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const serviceToken = cookieValue(r3, 'serviceToken');
  if (!serviceToken) throw new HttpError(502, 'Δεν δόθηκε serviceToken από τη Xiaomi');

  const auth: XiaomiAuth = {
    userId: String(s2.userId),
    ssecurity: s2.ssecurity,
    serviceToken,
    region,
    deviceId: did,
    connectedAt: Date.now(),
  };
  await store().set(AUTH_KEY, encrypt(JSON.stringify(auth)));
  return { status: 'connected' };
}

// ───────────────────────── Σύνδεση με QR / link (χωρίς κωδικό στον server) ─────────────────────────

const QR_KEY = 'xm:qr';

interface QrSession {
  lp: string;
  region: XiaomiRegion;
  cookies: string;
  expiresAt: number;
}

/** Ξεκινά τη σύνδεση: η Xiaomi δίνει ένα QR και ένα link όπου ο χρήστης κάνει login στη σελίδα της. */
export async function startXiaomiQr(region: XiaomiRegion): Promise<{ qr: string; loginUrl: string }> {
  const params = new URLSearchParams({
    _qrsize: '480',
    qs: '%3Fsid%3Dxiaomiio%26_json%3Dtrue',
    callback: 'https://sts.api.io.mi.com/sts',
    _hasLogo: 'false',
    sid: 'xiaomiio',
    serviceParam: '',
    _locale: 'en_GB',
    _dc: String(Date.now()),
  });
  const res = await fetch(`https://account.xiaomi.com/longPolling/loginUrl?${params}`, { headers: { 'User-Agent': UA } });
  const data = parseXmJson<{ qr?: string; loginUrl?: string; lp?: string; timeout?: number }>(await res.text());
  if (!data.qr || !data.loginUrl || !data.lp) throw new HttpError(502, 'Η Xiaomi δεν έδωσε σύνδεσμο σύνδεσης');
  const cookies = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const ttl = Math.min(data.timeout ?? 300, 600);
  const session: QrSession = { lp: data.lp, region, cookies, expiresAt: Date.now() + ttl * 1000 };
  await store().set(QR_KEY, encrypt(JSON.stringify(session)), { ttlSec: ttl + 30 });
  return { qr: data.qr, loginUrl: data.loginUrl };
}

/** Περιμένει (long polling) μέχρι ~20″ να ολοκληρώσει ο χρήστης το login στη σελίδα της Xiaomi. */
export async function pollXiaomiQr(): Promise<{ status: 'pending' | 'connected' | 'expired' }> {
  const raw = await store().get(QR_KEY);
  if (!raw) return { status: 'expired' };
  const s = JSON.parse(decrypt(raw)) as QrSession;
  if (s.expiresAt < Date.now()) return { status: 'expired' };

  let res: Response;
  try {
    res = await fetch(s.lp, { headers: { 'User-Agent': UA, ...(s.cookies ? { Cookie: s.cookies } : {}) }, signal: AbortSignal.timeout(20_000) });
  } catch {
    return { status: 'pending' };
  }
  if (res.status !== 200) return { status: 'pending' };
  const d = parseXmJson<{ ssecurity?: string; userId?: number | string; location?: string }>(await res.text());
  if (!d.ssecurity || !d.location || !d.userId) return { status: 'pending' };

  let r3 = await fetch(d.location, { headers: { 'User-Agent': UA }, redirect: 'manual' });
  let serviceToken = cookieValue(r3, 'serviceToken');
  if (!serviceToken) {
    r3 = await fetch(d.location, { headers: { 'User-Agent': UA } });
    serviceToken = cookieValue(r3, 'serviceToken');
  }
  if (!serviceToken) throw new HttpError(502, 'Δεν δόθηκε serviceToken από τη Xiaomi');

  const auth: XiaomiAuth = {
    userId: String(d.userId),
    ssecurity: d.ssecurity,
    serviceToken,
    region: s.region,
    deviceId: await deviceId(),
    connectedAt: Date.now(),
  };
  await store().set(AUTH_KEY, encrypt(JSON.stringify(auth)));
  await store().del(QR_KEY);
  return { status: 'connected' };
}

// ───────────────────────── Κρυπτογραφημένα αιτήματα (RC4), όπως η εφαρμογή Mi Home ─────────────────────────

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i]! + key[i % key.length]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
  }
  let i = 0;
  j = 0;
  // Η Xiaomi απορρίπτει τα πρώτα 1024 bytes του keystream.
  const out = Buffer.alloc(data.length);
  for (let n = 0; n < 1024 + data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]!) & 255;
    [s[i], s[j]] = [s[j]!, s[i]!];
    const k = s[(s[i]! + s[j]!) & 255]!;
    if (n >= 1024) out[n - 1024] = data[n - 1024]! ^ k;
  }
  return out;
}

function apiBase(region: XiaomiRegion) {
  return region === 'cn' ? 'https://api.io.mi.com/app' : `https://${region}.api.io.mi.com/app`;
}

function encSignature(method: string, path: string, params: [string, string][], signedNonce: string) {
  const parts = [method, path, ...params.map(([k, v]) => `${k}=${v}`), signedNonce];
  return createHash('sha1').update(parts.join('&')).digest('base64');
}

/** Καλεί ένα endpoint του Xiaomi Cloud, π.χ. `/home/device_list`. */
export async function xiaomiCall<T>(path: string, data: unknown, regionOverride?: XiaomiRegion): Promise<T> {
  const auth = await loadXiaomiAuth();
  if (!auth) throw new ProviderError('Το Xiaomi δεν έχει συνδεθεί', 'not_connected');

  const nonceBuf = Buffer.concat([randomBytes(8), Buffer.alloc(4)]);
  nonceBuf.writeUInt32BE(Math.floor(Date.now() / 60000), 8);
  const nonce = nonceBuf.toString('base64');
  const signedNonce = createHash('sha256')
    .update(Buffer.concat([Buffer.from(auth.ssecurity, 'base64'), Buffer.from(nonce, 'base64')]))
    .digest('base64');
  const key = Buffer.from(signedNonce, 'base64');

  let params: [string, string][] = [['data', JSON.stringify(data)]];
  params.push(['rc4_hash__', encSignature('POST', path, params, signedNonce)]);
  params = params.map(([k, v]) => [k, rc4(key, Buffer.from(v, 'utf8')).toString('base64')]);
  params.push(['signature', encSignature('POST', path, params, signedNonce)]);
  params.push(['ssecurity', auth.ssecurity], ['_nonce', nonce]);

  const res = await fetch(`${apiBase(regionOverride ?? auth.region)}${path}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Accept-Encoding': 'identity',
      'Content-Type': 'application/x-www-form-urlencoded',
      'x-xiaomi-protocal-flag-cli': 'PROTOCAL-HTTP2',
      'MIOT-ENCRYPT-ALGORITHM': 'ENCRYPT-RC4',
      Cookie: [
        `userId=${auth.userId}`,
        `yetAnotherServiceToken=${auth.serviceToken}`,
        `serviceToken=${auth.serviceToken}`,
        'locale=en_GB',
        'timezone=GMT+02:00',
        'is_daylight=0',
        'dst_offset=0',
        'channel=MI_APP_STORE',
      ].join('; '),
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new ProviderError('Η σύνδεση Xiaomi έληξε. Σύνδεσε ξανά το Xiaomi.', 'auth');
  if (!res.ok) throw new ProviderError(`Xiaomi HTTP ${res.status}`);
  let body: { code?: number; message?: string; result?: unknown };
  try {
    body = JSON.parse(rc4(key, Buffer.from(text, 'base64')).toString('utf8'));
  } catch {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ProviderError('Μη αναγνώσιμη απάντηση από Xiaomi');
    }
  }
  if (body.code === 3 || body.code === 2) throw new ProviderError('Η σύνδεση Xiaomi έληξε. Σύνδεσε ξανά το Xiaomi.', 'auth');
  if (body.code !== 0) throw new ProviderError(`Xiaomi: ${body.message ?? `κωδικός ${body.code}`}`);
  return body.result as T;
}

const ALL_REGIONS: XiaomiRegion[] = ['de', 'sg', 'us', 'ru', 'cn', 'i2'];

/**
 * Οι συσκευές μπορεί να υπάρχουν σε περισσότερους από έναν servers της Xiaomi (π.χ. παλιό αντίγραφο στην Ευρώπη
 * και η πραγματική, online συσκευή στη Σιγκαπούρη). Διαλέγουμε τον server με τις περισσότερες online λάμπες.
 */
export async function ensureRegion(): Promise<XiaomiAuth | null> {
  const auth = await loadXiaomiAuth();
  if (!auth || auth.regionDetected) return auth;
  const scores = await Promise.all(
    ALL_REGIONS.map(async (r) => {
      try {
        const res = await xiaomiCall<{ list?: { model: string; isOnline: boolean }[] }>('/home/device_list', { getVirtualModel: false, getHuamiDevices: 0 }, r);
        const lights = (res.list ?? []).filter((d) => /\.light\./.test(d.model));
        return { r, score: lights.filter((d) => d.isOnline).length * 100 + lights.length };
      } catch {
        return { r, score: -1 };
      }
    }),
  );
  const best = scores.sort((a, b) => b.score - a.score)[0];
  const next: XiaomiAuth = { ...auth, region: best && best.score > 0 ? best.r : auth.region, regionDetected: true };
  await store().set(AUTH_KEY, encrypt(JSON.stringify(next)));
  return next;
}
