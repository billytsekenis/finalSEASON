import { env } from './_lib/env.js';
import { json, route } from './_lib/http.js';
import { accessToken, authStatus } from './_lib/smartthings-auth.js';
import { accumulate, snapshotMeters } from './_lib/energy.js';
import { providers } from './_lib/providers/registry.js';
import { smartthings } from './_lib/providers/smartthings.js';

/**
 * Καθημερινό cron του Vercel: ανανεώνει το SmartThings token ώστε το refresh token
 * (ισχύς 30 ημερών) να μη λήξει ποτέ, και καταγράφει την ημερήσια ένδειξη των μετρητών ενέργειας.
 */
export const GET = route(async (req) => {
  const secret = env.cronSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Unauthorized' }, 401);
  const status = await authStatus();
  let refreshed = false;
  if (status.connected && status.kind === 'oauth') {
    await accessToken({ forceRefresh: true });
    refreshed = true;
  }
  // Ημερήσια ένδειξη μετρητών ενέργειας, ώστε το ιστορικό να γράφεται ακόμα κι αν δεν ανοίξεις την εφαρμογή.
  let metered = 0;
  if (status.connected) {
    const { lights } = await smartthings.list();
    await snapshotMeters(lights);
    metered = lights.filter((l) => l.meter).length;
  }
  // Ημερήσια παρατήρηση όλων των λαμπών για την εκτίμηση κατανάλωσης.
  const all = (
    await Promise.all(providers.map(async (p) => ((await p.isConnected().catch(() => false)) ? (await p.list().catch(() => ({ lights: [] }))).lights : [])))
  ).flat();
  await accumulate(all).catch(() => {});
  return json({ refreshed, metered });
});
