import { safeEqual, sign } from './crypto.js';
import { env } from './env.js';
import { HttpError, clientIp, parseCookies } from './http.js';
import { store } from './store.js';

const COOKIE = 'lumen_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 180; // 6 μήνες
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_MAX_FAILS = 8;

interface SessionPayload {
  v: 1;
  iat: number;
  exp: number;
}

function encode(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const [body, mac] = token.split('.');
  if (!body || !mac || !safeEqual(sign(body), mac)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (p.v !== 1 || p.exp < Date.now() / 1000) return null;
    return p;
  } catch {
    return null;
  }
}

function cookieAttrs(maxAge: number): string {
  const secure = env.isProduction() ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function isAuthenticated(req: Request): boolean {
  const token = parseCookies(req)[COOKIE];
  return !!token && !!decode(token);
}

/**
 * Ελέγχει session και, για αιτήματα που αλλάζουν κατάσταση, ότι προέρχονται από την ίδια την εφαρμογή
 * (custom header + Origin) ώστε να αποκλείεται CSRF.
 */
export function requireAuth(req: Request): void {
  if (!isAuthenticated(req)) throw new HttpError(401, 'Απαιτείται σύνδεση');
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (req.headers.get('x-lumen') !== '1') throw new HttpError(403, 'Μη έγκυρο αίτημα');
    const origin = req.headers.get('origin');
    if (origin) {
      const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
      if (!host || new URL(origin).host !== host) throw new HttpError(403, 'Μη έγκυρη προέλευση');
    }
  }
}

export async function login(req: Request, password: string): Promise<string> {
  const ip = clientIp(req);
  const key = `rl:login:${ip}`;
  const fails = Number((await store().get(key)) ?? 0);
  if (fails >= LOGIN_MAX_FAILS) {
    throw new HttpError(429, 'Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε 15 λεπτά.');
  }
  if (typeof password !== 'string' || !safeEqual(password, env.appPassword())) {
    await store().incr(key, LOGIN_WINDOW_SEC);
    // Μικρή καθυστέρηση ενάντια σε brute force
    await new Promise((r) => setTimeout(r, 400));
    throw new HttpError(401, 'Λάθος κωδικός');
  }
  await store().del(key);
  const now = Math.floor(Date.now() / 1000);
  return `${COOKIE}=${encode({ v: 1, iat: now, exp: now + MAX_AGE_SEC })}; ${cookieAttrs(MAX_AGE_SEC)}`;
}

export function logoutCookie(): string {
  return `${COOKIE}=; ${cookieAttrs(0)}`;
}
