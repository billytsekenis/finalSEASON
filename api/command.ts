import type { CommandAction, CommandResult, LightCommand } from '../shared/types.js';
import { requireAuth } from './_lib/auth.js';
import { HttpError, json, readJson, route } from './_lib/http.js';
import { providerFor } from './_lib/providers/registry.js';
import type { LightProvider } from './_lib/providers/types.js';

function validCommand(c: LightCommand): LightCommand {
  const out: LightCommand = {};
  if (typeof c.on === 'boolean') out.on = c.on;
  if (typeof c.brightness === 'number' && Number.isFinite(c.brightness)) out.brightness = c.brightness;
  if (c.color && Number.isFinite(c.color.h) && Number.isFinite(c.color.s)) out.color = { h: c.color.h, s: c.color.s };
  if (typeof c.colorTemp === 'number' && Number.isFinite(c.colorTemp)) out.colorTemp = c.colorTemp;
  return out;
}

/**
 * Εκτελεί μία ή περισσότερες ενέργειες. Κάθε ενέργεια = ίδια εντολή σε πολλές λάμπες.
 * Οι λάμπες ομαδοποιούνται ανά provider και όλα τρέχουν παράλληλα.
 * Body: { actions: [{ ids: string[], cmd: LightCommand }] }
 */
export const POST = route(async (req) => {
  requireAuth(req);
  const { actions } = await readJson<{ actions?: CommandAction[] }>(req);
  if (!Array.isArray(actions) || actions.length === 0 || actions.length > 100) {
    throw new HttpError(400, 'Μη έγκυρες ενέργειες');
  }

  const jobs: Promise<CommandResult[]>[] = [];
  for (const action of actions) {
    if (!Array.isArray(action.ids)) throw new HttpError(400, 'Μη έγκυρα ids');
    const cmd = validCommand(action.cmd ?? {});
    const byProvider = new Map<LightProvider, string[]>();
    for (const id of action.ids) {
      const hit = providerFor(String(id));
      if (!hit) continue;
      byProvider.set(hit.provider, [...(byProvider.get(hit.provider) ?? []), hit.deviceId]);
    }
    for (const [provider, ids] of byProvider) jobs.push(provider.command(ids, cmd));
  }
  const results = (await Promise.all(jobs)).flat();
  return json({ results });
});
