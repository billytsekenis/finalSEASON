import type { CommandResult, Light, LightCommand, ProviderId } from '../../../shared/types.js';

/**
 * Κοινή διεπαφή για κάθε κατασκευαστή / cloud.
 * Για νέο κατασκευαστή αρκεί μια νέα υλοποίηση και καταχώριση στο registry.ts.
 */
export interface LightProvider {
  id: ProviderId;
  name: string;
  isConnected(): Promise<boolean>;
  /** Επιστρέφει όλες τις λάμπες με την τρέχουσα κατάστασή τους. */
  list(): Promise<{ lights: Light[]; stale?: boolean }>;
  /** Εκτελεί την ίδια εντολή σε πολλές συσκευές (deviceId χωρίς prefix provider). */
  command(deviceIds: string[], cmd: LightCommand): Promise<CommandResult[]>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public code: 'not_connected' | 'auth' | 'rate_limited' | 'upstream' = 'upstream',
    public retryAfterMs?: number,
  ) {
    super(message);
  }
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
