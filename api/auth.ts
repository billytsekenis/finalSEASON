import { isAuthenticated, login, logoutCookie, requireAuth } from './_lib/auth.js';
import { json, readJson, route } from './_lib/http.js';

/** GET: κατάσταση session · POST: σύνδεση με κωδικό · DELETE: αποσύνδεση */
export const GET = route(async (req) => json({ authenticated: isAuthenticated(req) }));

export const POST = route(async (req) => {
  const { password } = await readJson<{ password?: string }>(req, 1024);
  const cookie = await login(req, password ?? '');
  return json({ authenticated: true }, 200, { 'Set-Cookie': cookie });
});

export const DELETE = route(async (req) => {
  requireAuth(req);
  return json({ authenticated: false }, 200, { 'Set-Cookie': logoutCookie() });
});
