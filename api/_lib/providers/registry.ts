import type { ProviderId } from '../../../shared/types.js';
import { smartthings } from './smartthings.js';
import { xiaomi } from './xiaomi.js';
import type { LightProvider } from './types.js';

/** Όλοι οι διαθέσιμοι providers. Νέος κατασκευαστής = μία γραμμή εδώ. */
export const providers: LightProvider[] = [smartthings, xiaomi];

export function providerFor(id: string): { provider: LightProvider; deviceId: string } | null {
  const i = id.indexOf(':');
  if (i < 0) return null;
  const pid = id.slice(0, i) as ProviderId;
  const provider = providers.find((p) => p.id === pid);
  return provider ? { provider, deviceId: id.slice(i + 1) } : null;
}
