import { env } from './env.js';
import { HttpError } from './http.js';

/**
 * Ελάχιστο key-value store.
 * Παραγωγή: Upstash Redis μέσω REST (δωρεάν tier, χωρίς βιβλιοθήκη).
 * Τοπικό development: αρχείο .data/store.json.
 */
export interface Store {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, opts?: { ttlSec?: number; nx?: boolean }): Promise<boolean>;
  del(key: string): Promise<void>;
  incr(key: string, ttlSec: number): Promise<number>;
}

class UpstashStore implements Store {
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async cmd<T>(args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const body = (await res.json().catch(() => ({}))) as { result?: T; error?: string };
    if (!res.ok || body.error) {
      throw new HttpError(502, `Σφάλμα αποθήκευσης: ${body.error ?? res.status}`);
    }
    return body.result as T;
  }

  get(key: string) {
    return this.cmd<string | null>(['GET', key]);
  }
  async set(key: string, value: string, opts: { ttlSec?: number; nx?: boolean } = {}) {
    const args: (string | number)[] = ['SET', key, value];
    if (opts.ttlSec) args.push('EX', opts.ttlSec);
    if (opts.nx) args.push('NX');
    const r = await this.cmd<string | null>(args);
    return r === 'OK';
  }
  async del(key: string) {
    await this.cmd(['DEL', key]);
  }
  async incr(key: string, ttlSec: number) {
    const n = await this.cmd<number>(['INCR', key]);
    if (n === 1) await this.cmd(['EXPIRE', key, ttlSec]);
    return n;
  }
}

class FileStore implements Store {
  private file = '.data/store.json';
  private async load(): Promise<Record<string, { v: string; exp?: number }>> {
    const fs = await import('node:fs/promises');
    try {
      const data = JSON.parse(await fs.readFile(this.file, 'utf8')) as Record<string, { v: string; exp?: number }>;
      const now = Date.now();
      for (const [k, e] of Object.entries(data)) if (e.exp && e.exp < now) delete data[k];
      return data;
    } catch {
      return {};
    }
  }
  private async save(data: Record<string, { v: string; exp?: number }>) {
    const fs = await import('node:fs/promises');
    await fs.mkdir('.data', { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(data), { mode: 0o600 });
  }
  async get(key: string) {
    return (await this.load())[key]?.v ?? null;
  }
  async set(key: string, value: string, opts: { ttlSec?: number; nx?: boolean } = {}) {
    const d = await this.load();
    if (opts.nx && d[key]) return false;
    d[key] = { v: value, exp: opts.ttlSec ? Date.now() + opts.ttlSec * 1000 : undefined };
    await this.save(d);
    return true;
  }
  async del(key: string) {
    const d = await this.load();
    delete d[key];
    await this.save(d);
  }
  async incr(key: string, ttlSec: number) {
    const d = await this.load();
    const n = Number(d[key]?.v ?? 0) + 1;
    d[key] = { v: String(n), exp: d[key]?.exp ?? Date.now() + ttlSec * 1000 };
    await this.save(d);
    return n;
  }
}

let cached: Store | null = null;

export function store(): Store {
  if (cached) return cached;
  const url = env.redisUrl();
  const token = env.redisToken();
  if (url && token) {
    cached = new UpstashStore(url, token);
  } else if (!process.env.VERCEL) {
    cached = new FileStore();
  } else {
    throw new HttpError(500, 'Δεν έχει συνδεθεί βάση δεδομένων (Upstash Redis) στο Vercel project');
  }
  return cached;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await store().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSec?: number): Promise<void> {
  await store().set(key, JSON.stringify(value), { ttlSec });
}
