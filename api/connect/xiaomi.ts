import { requireAuth } from '../_lib/auth.js';
import { HttpError, json, readJson, route } from '../_lib/http.js';
import { store } from '../_lib/store.js';
import { disconnectXiaomi, loadXiaomiAuth, loginXiaomi, type XiaomiRegion } from '../_lib/xiaomi-auth.js';

const REGIONS: XiaomiRegion[] = ['de', 'cn', 'us', 'ru', 'sg', 'i2'];

/** GET: κατάσταση · POST {username, password, region}: σύνδεση · DELETE: αποσύνδεση */
export const GET = route(async (req) => {
  requireAuth(req);
  const a = await loadXiaomiAuth();
  return json(a ? { connected: true, region: a.region, connectedAt: a.connectedAt } : { connected: false });
});

export const POST = route(async (req) => {
  requireAuth(req);
  const { username, password, region } = await readJson<{ username?: string; password?: string; region?: XiaomiRegion }>(req, 4096);
  if (typeof username !== 'string' || typeof password !== 'string') throw new HttpError(400, 'Λείπουν στοιχεία');
  const r = await loginXiaomi(username.trim(), password, REGIONS.includes(region as XiaomiRegion) ? (region as XiaomiRegion) : 'de');
  if (r.status === 'connected') await store().del('xm:devices');
  return json(r);
});

export const DELETE = route(async (req) => {
  requireAuth(req);
  await disconnectXiaomi();
  await store().del('xm:devices');
  return json({ connected: false });
});
