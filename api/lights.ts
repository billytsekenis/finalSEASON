import type { Light, LightsResponse, ProviderStatus } from '../shared/types.js';
import { requireAuth } from './_lib/auth.js';
import { json, route } from './_lib/http.js';
import { providers } from './_lib/providers/registry.js';
import { ProviderError } from './_lib/providers/types.js';
import { accumulate } from './_lib/energy.js';

/** Όλες οι λάμπες από όλους τους συνδεδεμένους providers, σε κοινή μορφή. */
export const GET = route(async (req) => {
  requireAuth(req);
  const lights: Light[] = [];
  const statuses: ProviderStatus[] = [];
  let stale = false;

  await Promise.all(
    providers.map(async (p) => {
      try {
        if (!(await p.isConnected())) {
          statuses.push({ id: p.id, name: p.name, connected: false });
          return;
        }
        const r = await p.list();
        lights.push(...r.lights);
        stale ||= !!r.stale;
        statuses.push({ id: p.id, name: p.name, connected: true, ...(r.warning ? { error: r.warning } : {}) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Σφάλμα';
        const connected = !(e instanceof ProviderError && (e.code === 'not_connected' || e.code === 'auth'));
        statuses.push({ id: p.id, name: p.name, connected, error: msg });
      }
    }),
  );

  // Καταγραφή εκτιμώμενης κατανάλωσης (δεν επηρεάζει την απάντηση αν αποτύχει).
  await accumulate(lights).catch(() => {});

  lights.sort((a, b) => a.name.localeCompare(b.name, 'el', { numeric: true }));
  const body: LightsResponse = { lights, providers: statuses, stale, fetchedAt: Date.now() };
  return json(body);
});
