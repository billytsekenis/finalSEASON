import type { Group, Scene, UserData } from '../shared/types.js';
import { requireAuth } from './_lib/auth.js';
import { HttpError, json, readJson, route } from './_lib/http.js';
import { getJson, setJson } from './_lib/store.js';

const KEY = 'user:data:v1';
const EMPTY: UserData = { scenes: [], groups: [], favorites: [], updatedAt: 0 };

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.slice(0, max) : '');
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function sanitize(d: Partial<UserData>): UserData {
  const scenes: Scene[] = (Array.isArray(d.scenes) ? d.scenes : []).slice(0, 100).map((s) => ({
    id: str(s.id, 64),
    name: str(s.name, 60) || 'Σκηνή',
    createdAt: num(s.createdAt, Date.now()),
    updatedAt: num(s.updatedAt, Date.now()),
    entries: (Array.isArray(s.entries) ? s.entries : []).slice(0, 100).map((e) => ({
      lightId: str(e.lightId, 200),
      on: !!e.on,
      brightness: num(e.brightness, 100),
      mode: e.mode === 'white' ? 'white' : 'color',
      hue: num(e.hue),
      saturation: num(e.saturation),
      colorTemp: typeof e.colorTemp === 'number' ? e.colorTemp : null,
    })),
  }));
  const groups: Group[] = (Array.isArray(d.groups) ? d.groups : []).slice(0, 50).map((g) => ({
    id: str(g.id, 64),
    name: str(g.name, 40) || 'Ομάδα',
    lightIds: (Array.isArray(g.lightIds) ? g.lightIds : []).slice(0, 100).map((x) => str(x, 200)),
  }));
  const favorites = (Array.isArray(d.favorites) ? d.favorites : [])
    .filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
    .slice(0, 48);
  const kwhPrice = typeof d.kwhPrice === 'number' && d.kwhPrice > 0 && d.kwhPrice < 5 ? d.kwhPrice : undefined;
  return { scenes, groups, favorites, kwhPrice, updatedAt: Date.now() };
}

/** Σκηνές, ομάδες και αγαπημένα χρώματα. Αποθηκεύονται στον server ώστε να μένουν σε κάθε συσκευή. */
export const GET = route(async (req) => {
  requireAuth(req);
  return json((await getJson<UserData>(KEY)) ?? EMPTY);
});

export const PUT = route(async (req) => {
  requireAuth(req);
  const body = await readJson<Partial<UserData>>(req);
  if (typeof body !== 'object' || body === null) throw new HttpError(400, 'Μη έγκυρα δεδομένα');
  const data = sanitize(body);
  await setJson(KEY, data);
  return json(data);
});
