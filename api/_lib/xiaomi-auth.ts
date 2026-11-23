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
export async function xiaomiCall<T>(path: string, data: unknown): Promise<T> {
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

  const res = await fetch(`${apiBase(auth.region)}${path}`, {
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
