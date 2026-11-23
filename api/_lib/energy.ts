import type { EnergyEstimate, EnergyMeterInfo, Light, UserData } from '../../shared/types.js';
import { getJson, store } from './store.js';

/**
 * Ενέργεια.
 * - Πρίζες με μετρητή (Tapo P110): πραγματικές μετρήσεις. Κρατάμε μία ένδειξη του συνολικού μετρητή ανά ημέρα,
 *   οπότε η ημερήσια κατανάλωση = διαφορά διαδοχικών ενδείξεων.
 * - Λάμπες: δεν αναφέρουν κατανάλωση, οπότε δίνουμε εκτίμηση από τα ονομαστικά Watt και τη φωτεινότητα.
 */

const TZ = 'Europe/Athens';
const DAY_TTL = 400 * 24 * 3600;
export const DEFAULT_PRICE = 0.18;

/** Ονομαστική ισχύς ανά μοντέλο (W), από τα datasheets των κατασκευαστών. */
const RATED_W: Record<string, number> = {
  L900: 13, // Tapo L930-5 (το SmartThings το αναφέρει ως L900)
  L930: 13,
  L430C: 4.8,
  L630: 5,
  L530: 8.7,
  'yeelink.light.color3': 10,
};

export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function meterKey(id: string, day: string) {
  return `energy:${id}:${day}`;
}

/** Καταγράφει (μία φορά ανά ημέρα) την ένδειξη του μετρητή. */
export async function snapshotMeters(lights: Light[]): Promise<void> {
  const today = dayKey();
  await Promise.all(
    lights
      .filter((l) => l.meter)
      .map((l) => store().set(meterKey(l.id, today), String(l.meter!.totalWh), { ttlSec: DAY_TTL, nx: true })),
  );
}

export async function buildEnergy(lights: Light[]) {
  await snapshotMeters(lights);
  const data = await getJson<UserData>('user:data:v1');
  const kwhPrice = data?.kwhPrice ?? DEFAULT_PRICE;

  // 31 ημέρες πίσω (+ σήμερα)
  const dates: string[] = [];
  for (let i = 31; i >= 0; i--) dates.push(dayKey(new Date(Date.now() - i * 86400_000)));

  const meters: EnergyMeterInfo[] = await Promise.all(
    lights
      .filter((l) => l.meter)
      .map(async (l) => {
        const m = l.meter!;
        const raw = await store().mget(dates.map((d) => meterKey(l.id, d)));
        const readings = raw.map((v) => (v == null ? null : Number(v)));
        const days: { date: string; kwh: number }[] = [];
        for (let i = 0; i < dates.length - 1; i++) {
          const a = readings[i];
          const b = readings[i + 1];
          if (a != null && b != null && b >= a) days.push({ date: dates[i]!, kwh: (b - a) / 1000 });
        }
        const todayStart = readings[readings.length - 1];
        const hours = m.start && m.end ? (Date.parse(m.end) - Date.parse(m.start)) / 3600_000 : 0;
        return {
          id: l.id,
          name: l.name,
          model: l.model,
          // Η πρίζα μπορεί να μην αναφέρει on/off στο SmartThings, αλλά μια πρόσφατη μέτρηση σημαίνει ότι είναι online.
          online: l.online || (!!m.end && Date.now() - Date.parse(m.end) < 3 * 3600_000),
          on: l.on,
          watts: hours > 0 ? Math.round((m.deltaWh / hours) * 10) / 10 : null,
          totalKwh: m.totalWh / 1000,
          todayKwh: todayStart != null ? Math.max(0, (m.totalWh - todayStart) / 1000) : null,
          days,
          measuredAt: m.end,
        };
      }),
  );

  const estimates: EnergyEstimate[] = lights
    .filter((l) => !l.meter && l.kind !== 'plug')
    .map((l) => {
      const ratedW = RATED_W[l.model ?? ''] ?? 9;
      // LED: ισχύς περίπου ανάλογη της φωτεινότητας, με ένα ελάχιστο για τα ηλεκτρονικά.
      const watts = !l.online ? 0 : !l.on ? 0.4 : ratedW * (0.1 + 0.9 * (l.brightness / 100));
      return { id: l.id, name: l.name, brand: l.brand, model: l.model, ratedW, watts: Math.round(watts * 10) / 10 };
    })
    .sort((a, b) => b.watts - a.watts);

  return {
    meters,
    estimates,
    estimatedTotalW: Math.round(estimates.reduce((s, e) => s + e.watts, 0) * 10) / 10,
    kwhPrice,
  };
}
