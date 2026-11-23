import type { EnergyDevice, EnergyResponse, Light, UserData } from '../../shared/types.js';
import { getJson, setJson, store } from './store.js';

/**
 * Ενέργεια.
 * - Συσκευές με μετρητή (Tapo P110): πραγματικές μετρήσεις. Κρατάμε μία ένδειξη του συνολικού μετρητή ανά ημέρα,
 *   οπότε η κατανάλωση ημέρας = διαφορά διαδοχικών ενδείξεων.
 * - Λάμπες: δεν αναφέρουν κατανάλωση. Ο server εκτιμά την ισχύ τους (ονομαστικά W × φωτεινότητα) και την
 *   ολοκληρώνει στον χρόνο κάθε φορά που βλέπει την κατάστασή τους (εφαρμογή ανοιχτή, εντολές, καθημερινό cron).
 *   Ανάμεσα σε δύο παρατηρήσεις θεωρούμε ότι η κατάσταση έμεινε ίδια.
 */

const TZ = 'Europe/Athens';
const DAY_TTL = 400 * 24 * 3600;
const ACC_KEY = 'energy:acc:v1';
export const DEFAULT_PRICE = 0.15;

/** Ονομαστική ισχύς ανά μοντέλο (W), από τα datasheets των κατασκευαστών. */
const RATED_W: Record<string, number> = {
  L900: 13, // Tapo L930-5 (το SmartThings το αναφέρει ως L900)
  L930: 13,
  L430C: 4.8,
  L630: 5,
  L530: 8.7,
  'yeelink.light.color3': 10,
};
const STANDBY_W = 0.4;

export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function lastDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(dayKey(new Date(Date.now() - i * 86400_000)));
  return [...new Set(out)];
}

const meterKey = (id: string, day: string) => `energy:${id}:${day}`;

export function ratedWatts(l: Light): number {
  return RATED_W[l.model ?? ''] ?? 9;
}

export function estimatedWatts(l: Light): number {
  if (!l.online) return 0;
  if (!l.on) return STANDBY_W;
  // LED: ισχύς περίπου ανάλογη της φωτεινότητας, με ένα ελάχιστο για τα ηλεκτρονικά.
  return ratedWatts(l) * (0.1 + 0.9 * (l.brightness / 100));
}

// ───────────────────────── Μετρητές (P110) ─────────────────────────

/** Καταγράφει (μία φορά ανά ημέρα) την ένδειξη κάθε μετρητή. */
export async function snapshotMeters(lights: Light[]): Promise<void> {
  const today = dayKey();
  await Promise.all(
    lights.filter((l) => l.meter).map((l) => store().set(meterKey(l.id, today), String(l.meter!.totalWh), { ttlSec: DAY_TTL, nx: true })),
  );
}

// ───────────────────────── Εκτίμηση λαμπών ─────────────────────────

interface Accumulator {
  lastTs: number;
  lastW: Record<string, number>;
  /** Wh ανά συσκευή από την αρχή της καταγραφής */
  totals: Record<string, number>;
  /** Wh ανά ημέρα ανά συσκευή */
  days: Record<string, Record<string, number>>;
  since: number;
}

/** Προσθέτει την ενέργεια από την τελευταία παρατήρηση έως τώρα και κρατά τη νέα κατάσταση. */
export async function accumulate(lights: Light[]): Promise<Accumulator> {
  const now = Date.now();
  const acc = (await getJson<Accumulator>(ACC_KEY)) ?? { lastTs: now, lastW: {}, totals: {}, days: {}, since: now };
  const dtH = Math.max(0, (now - acc.lastTs) / 3600_000);
  const estimated = lights.filter((l) => !l.meter && l.kind !== 'plug');
  const currentW = Object.fromEntries(estimated.map((l) => [l.id, estimatedWatts(l)]));

  if (dtH > 0) {
    const day = dayKey(new Date(acc.lastTs));
    for (const [id, w] of Object.entries(acc.lastW)) {
      const wh = w * dtH;
      acc.totals[id] = (acc.totals[id] ?? 0) + wh;
      (acc.days[day] ??= {})[id] = (acc.days[day]![id] ?? 0) + wh;
    }
  }
  const changed = JSON.stringify(currentW) !== JSON.stringify(acc.lastW);
  // Γράφουμε μόνο όταν αλλάξει κάτι ή έχει περάσει λίγη ώρα (λιγότερες εγγραφές στη βάση).
  if (changed || now - acc.lastTs > 5 * 60_000) {
    acc.lastTs = now;
    acc.lastW = currentW;
    const keep = new Set(lastDays(60));
    for (const d of Object.keys(acc.days)) if (!keep.has(d)) delete acc.days[d];
    await setJson(ACC_KEY, acc);
  }
  return acc;
}

// ───────────────────────── Σύνοψη ─────────────────────────

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

export async function buildEnergy(lights: Light[]): Promise<EnergyResponse> {
  await snapshotMeters(lights);
  const acc = await accumulate(lights);
  const data = await getJson<UserData>('user:data:v1');
  const kwhPrice = data?.kwhPrice ?? DEFAULT_PRICE;

  const days30 = lastDays(30);
  const today = dayKey();
  const days7 = days30.slice(-7);

  const devices: EnergyDevice[] = [];

  // Συσκευές με μετρητή
  for (const l of lights.filter((x) => x.meter)) {
    const m = l.meter!;
    const keys = [...lastDays(31), dayKey(new Date(Date.now() + 86400_000))];
    const raw = await store().mget(keys.map((d) => meterKey(l.id, d)));
    const readings = new Map(keys.map((d, i) => [d, raw[i] == null ? null : Number(raw[i])]));
    const perDay: { date: string; kwh: number }[] = [];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = readings.get(keys[i]!);
      // Η επόμενη ένδειξη· για σήμερα, η τρέχουσα τιμή του μετρητή.
      const b = keys[i] === today ? m.totalWh : readings.get(keys[i + 1]!);
      if (a != null && b != null && b >= a) perDay.push({ date: keys[i]!, kwh: (b - a) / 1000 });
    }
    const byDate = new Map(perDay.map((d) => [d.date, d.kwh]));
    const hours = m.start && m.end ? (Date.parse(m.end) - Date.parse(m.start)) / 3600_000 : 0;
    const fresh = !!m.end && Date.now() - Date.parse(m.end) < 3 * 3600_000;
    devices.push({
      id: l.id,
      name: l.name,
      brand: l.brand,
      model: l.model,
      source: 'meter',
      online: l.online || fresh,
      nowW: hours > 0 && fresh ? Math.round((m.deltaWh / hours) * 10) / 10 : 0,
      ratedW: null,
      kwh: {
        today: byDate.get(today) ?? 0,
        d7: sum(days7.map((d) => byDate.get(d) ?? 0)),
        d30: sum(days30.map((d) => byDate.get(d) ?? 0)),
        all: m.totalWh / 1000,
      },
      days: days30.map((d) => ({ date: d, kwh: byDate.get(d) ?? 0 })),
      trackedSince: perDay[0]?.date ?? today,
      lifetimeLabel: 'Συνολικός μετρητής της πρίζας',
    });
  }

  // Λάμπες (εκτίμηση)
  for (const l of lights.filter((x) => !x.meter && x.kind !== 'plug')) {
    const dayWh = (d: string) => acc.days[d]?.[l.id] ?? 0;
    devices.push({
      id: l.id,
      name: l.name,
      brand: l.brand,
      model: l.model,
      source: 'estimate',
      online: l.online,
      nowW: Math.round(estimatedWatts(l) * 10) / 10,
      ratedW: ratedWatts(l),
      kwh: {
        today: dayWh(today) / 1000,
        d7: sum(days7.map(dayWh)) / 1000,
        d30: sum(days30.map(dayWh)) / 1000,
        all: (acc.totals[l.id] ?? 0) / 1000,
      },
      days: days30.map((d) => ({ date: d, kwh: dayWh(d) / 1000 })),
      trackedSince: dayKey(new Date(acc.since)),
      lifetimeLabel: 'Από την αρχή της καταγραφής',
    });
  }

  devices.sort((a, b) => b.kwh.d30 - a.kwh.d30 || b.nowW - a.nowW);
  return {
    devices,
    nowW: Math.round(sum(devices.map((d) => d.nowW)) * 10) / 10,
    kwhPrice,
    trackingSince: dayKey(new Date(acc.since)),
  };
}
