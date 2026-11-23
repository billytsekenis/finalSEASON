import type { Light } from '../shared/types.js';
import { requireAuth } from './_lib/auth.js';
import { buildEnergy } from './_lib/energy.js';
import { json, route } from './_lib/http.js';
import { providers } from './_lib/providers/registry.js';

/** Κατανάλωση: πραγματικές μετρήσεις από πρίζες με μετρητή + εκτίμηση για τις λάμπες. */
export const GET = route(async (req) => {
  requireAuth(req);
  const lights: Light[] = [];
  await Promise.all(
    providers.map(async (p) => {
      try {
        if (await p.isConnected()) lights.push(...(await p.list()).lights);
      } catch {
        /* ένας provider που αποτυγχάνει δεν μπλοκάρει τους υπόλοιπους */
      }
    }),
  );
  return json(await buildEnergy(lights));
});
