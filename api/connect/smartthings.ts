import { requireAuth } from '../_lib/auth.js';
import { HttpError, json, readJson, route } from '../_lib/http.js';
import { authStatus, completeAuthorization, disconnect, startAuthorization } from '../_lib/smartthings-auth.js';
import { store } from '../_lib/store.js';

/** GET: κατάσταση · GET ?start=1: URL για login · POST {input}: ολοκλήρωση · DELETE: αποσύνδεση */
export const GET = route(async (req) => {
  requireAuth(req);
  const url = new URL(req.url);
  if (url.searchParams.get('start')) return json({ authorizeUrl: await startAuthorization() });
  return json(await authStatus());
});

export const POST = route(async (req) => {
  requireAuth(req);
  const { input } = await readJson<{ input?: string }>(req, 8192);
  if (typeof input !== 'string') throw new HttpError(400, 'Λείπει το κείμενο');
  const r = await completeAuthorization(input);
  await store().del('st:rooms');
  return json({ connected: true, kind: r.kind });
});

export const DELETE = route(async (req) => {
  requireAuth(req);
  await disconnect();
  return json({ connected: false });
});
