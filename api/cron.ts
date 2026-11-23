import { env } from './_lib/env.js';
import { json, route } from './_lib/http.js';
import { accessToken, authStatus } from './_lib/smartthings-auth.js';

/**
 * Καθημερινό cron του Vercel: ανανεώνει το SmartThings token ώστε το refresh token
 * (ισχύς 30 ημερών) να μη λήξει ποτέ, ακόμα κι αν δεν ανοίξεις την εφαρμογή για καιρό.
 */
export const GET = route(async (req) => {
  const secret = env.cronSecret();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return json({ error: 'Unauthorized' }, 401);
  const status = await authStatus();
  if (status.connected && status.kind === 'oauth') {
    await accessToken({ forceRefresh: true });
    return json({ refreshed: true });
  }
  return json({ refreshed: false, status });
});
