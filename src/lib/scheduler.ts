import type { CommandResult, LightCommand } from '../../shared/types';
import { api } from './api';

/**
 * Έξυπνο throttling εντολών.
 *
 * Το SmartThings επιτρέπει ~10 εντολές/λεπτό ανά συσκευή. Όταν σύρεις τον επιλογέα χρώματος:
 *  - στέλνεται αμέσως η πρώτη αλλαγή,
 *  - οι ενδιάμεσες τιμές συγχωνεύονται (στέλνεται μόνο η πιο πρόσφατη),
 *  - το διάστημα προσαρμόζεται στο υπόλοιπο όριο που επιστρέφει το API,
 *  - η τελική τιμή (όταν αφήνεις το δάχτυλο) στέλνεται πάντα, ακόμα κι αν χρειαστεί να περιμένει.
 */

export function mergeCommands(a: LightCommand, b: LightCommand): LightCommand {
  const out: LightCommand = { ...a, ...b };
  if (b.color) delete out.colorTemp;
  if (b.colorTemp != null) delete out.color;
  return out;
}

interface Channel {
  ids: string[];
  pending: LightCommand | null;
  inflight: boolean;
  lastSent: number;
  interval: number;
  blockedUntil: number;
  /** Η εκκρεμής εντολή περιέχει τελική τιμή */
  final: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface SchedulerHooks {
  onRateLimited(waitMs: number): void;
  onError(message: string): void;
  onResults(results: CommandResult[]): void;
}

const BASE_INTERVAL = 450;

export class CommandScheduler {
  private channels = new Map<string, Channel>();
  constructor(private hooks: SchedulerHooks) {}

  /** final=true: ο χρήστης άφησε τον έλεγχο, στείλε όσο πιο γρήγορα επιτρέπεται. */
  push(ids: string[], cmd: LightCommand, final = false) {
    const key = [...ids].sort().join('|');
    let ch = this.channels.get(key);
    if (!ch) {
      ch = { ids, pending: null, inflight: false, lastSent: 0, interval: BASE_INTERVAL, blockedUntil: 0, final: false, timer: null };
      this.channels.set(key, ch);
    }
    ch.pending = ch.pending ? mergeCommands(ch.pending, cmd) : cmd;
    if (final) ch.final = true;
    this.pump(ch);
  }

  private pump(ch: Channel) {
    if (ch.inflight || !ch.pending) return;
    const now = Date.now();
    const throttleWait = ch.final ? 0 : ch.lastSent + ch.interval - now;
    const wait = Math.max(throttleWait, ch.blockedUntil - now, 0);
    if (wait > 0) {
      if (ch.timer) clearTimeout(ch.timer);
      ch.timer = setTimeout(() => {
        ch.timer = null;
        this.pump(ch);
      }, wait);
      return;
    }
    if (ch.timer) {
      clearTimeout(ch.timer);
      ch.timer = null;
    }
    const cmd = ch.pending;
    const wasFinal = ch.final;
    ch.pending = null;
    ch.final = false;
    ch.inflight = true;
    ch.lastSent = now;
    api
      .command([{ ids: ch.ids, cmd }])
      .then(({ results }) => {
        this.hooks.onResults(results);
        const remaining = Math.min(...results.map((r) => r.remaining ?? 10));
        // Όσο λιγοστεύει το όριο, αραιώνουμε τις ενδιάμεσες εντολές για να μείνει χώρος για την τελική.
        ch.interval = remaining >= 6 ? BASE_INTERVAL : remaining >= 3 ? 1500 : 4000;
        const limited = results.filter((r) => !r.ok && r.error === 'rate_limited');
        if (limited.length) {
          const waitMs = Math.max(...limited.map((r) => r.retryAfterMs ?? 10_000)) + 300;
          ch.blockedUntil = Date.now() + waitMs;
          // Ξαναβάζουμε την εντολή στην ουρά, κάτω από τυχόν νεότερη.
          ch.pending = ch.pending ? mergeCommands(cmd, ch.pending) : cmd;
          ch.final ||= wasFinal;
          this.hooks.onRateLimited(waitMs);
        }
        const failed = results.find((r) => !r.ok && r.error !== 'rate_limited');
        if (failed) this.hooks.onError(failed.error ?? 'Η εντολή απέτυχε');
      })
      .catch((e: Error) => this.hooks.onError(e.message))
      .finally(() => {
        ch.inflight = false;
        this.pump(ch);
      });
  }
}
