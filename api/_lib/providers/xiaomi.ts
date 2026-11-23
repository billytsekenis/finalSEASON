import type { CommandResult, Light, LightCommand } from '../../../shared/types.js';
import { getJson, setJson } from '../store.js';
import { ensureRegion, loadXiaomiAuth, xiaomiCall } from '../xiaomi-auth.js';
import { ProviderError, clamp, type LightProvider } from './types.js';

/**
 * Yeelight / Xiaomi λάμπες μέσω Xiaomi Cloud.
 * Οι Yeelight δέχονται τις εντολές του πρωτοκόλλου τους (set_hsv, set_bright, …) μέσω cloud RPC,
 * και υποστηρίζουν ομαλή μετάβαση (smooth), την οποία χρησιμοποιούμε.
 */

interface XmDevice {
  did: string;
  name: string;
  model: string;
  isOnline: boolean;
}

const PROPS = ['power', 'bright', 'ct', 'rgb', 'hue', 'sat', 'color_mode'] as const;
const SMOOTH_MS = 400;
const LIST_CACHE = 'xm:devices';

const isLight = (m: string) => /^(yeelink|xiaomi|mijia|philips)\.(light|bhf_light)\./.test(m);

async function devices(): Promise<XmDevice[]> {
  await ensureRegion();
  const cached = await getJson<XmDevice[]>(LIST_CACHE);
  if (cached) return cached;
  const r = await xiaomiCall<{ list?: XmDevice[] }>('/home/device_list', {
    getVirtualModel: false,
    getHuamiDevices: 0,
  });
  const list = (r.list ?? []).filter((d) => isLight(d.model)).map((d) => ({ did: String(d.did), name: d.name, model: d.model, isOnline: !!d.isOnline }));
  // Η λίστα συσκευών αλλάζει σπάνια: cache 60″ (η κατάσταση on/χρώμα διαβάζεται πάντα φρέσκια).
  await setJson(LIST_CACHE, list, 60);
  return list;
}

async function rpc<T>(did: string, method: string, params: unknown[]): Promise<T> {
  const r = await xiaomiCall<T>(`/home/rpc/${did}`, { id: Math.floor(Math.random() * 1e6), method, params });
  return r;
}

function rgbIntToHs(rgb: number): { h: number; s: number } {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  return { h: (h + 360) % 360, s: max ? (d / max) * 100 : 0 };
}

function toLight(d: XmDevice, props: unknown[] | null): Light {
  const [power, bright, ct, rgb, hue, sat, mode] = props ?? [];
  const colorMode = Number(mode);
  const fromRgb = colorMode === 1 ? rgbIntToHs(Number(rgb)) : null;
  return {
    id: `xiaomi:${d.did}`,
    provider: 'xiaomi',
    name: d.name,
    brand: d.model.startsWith('yeelink') ? 'Yeelight' : 'Xiaomi',
    model: d.model,
    kind: /strip|lightstrip/.test(d.model) ? 'strip' : 'bulb',
    room: null,
    online: props != null,
    on: power === 'on',
    brightness: clamp(Number(bright) || 1, 1, 100),
    mode: colorMode === 2 ? 'white' : 'color',
    hue: fromRgb ? fromRgb.h : Number(hue) || 0,
    saturation: fromRgb ? fromRgb.s : Number(sat) || 0,
    colorTemp: Number(ct) || null,
    caps: { power: true, brightness: true, color: true, colorTemp: { min: 1700, max: 6500 } },
  };
}

export const xiaomi: LightProvider = {
  id: 'xiaomi',
  name: 'Xiaomi / Yeelight',

  async isConnected() {
    return !!(await loadXiaomiAuth());
  },

  async list() {
    const devs = await devices();
    const errors: string[] = [];
    const lights = await Promise.all(
      devs.map(async (d) => {
        try {
          return toLight(d, await rpc<unknown[]>(d.did, 'get_prop', [...PROPS]));
        } catch (e) {
          if (e instanceof ProviderError && e.code === 'auth') throw e;
          errors.push(`${d.name}: ${e instanceof Error ? e.message : 'σφάλμα'}`);
          return toLight(d, null);
        }
      }),
    );
    return { lights, warning: errors.length ? errors.join(' · ') : undefined };
  },

  async command(deviceIds, cmd: LightCommand) {
    return Promise.all(
      deviceIds.map(async (did): Promise<CommandResult> => {
        const id = `xiaomi:${did}`;
        try {
          if (cmd.on === false) {
            await rpc(did, 'set_power', ['off', 'smooth', SMOOTH_MS]);
            return { id, ok: true };
          }
          if (cmd.on === true) await rpc(did, 'set_power', ['on', 'smooth', SMOOTH_MS]);
          // Χρώμα και φωτεινότητα παράλληλα, για πιο γρήγορη απόκριση.
          const jobs: Promise<unknown>[] = [];
          if (cmd.color) {
            jobs.push(rpc(did, 'set_hsv', [Math.round(clamp(cmd.color.h, 0, 359)), Math.round(clamp(cmd.color.s, 0, 100)), 'smooth', SMOOTH_MS]));
          } else if (cmd.colorTemp != null) {
            jobs.push(rpc(did, 'set_ct_abx', [Math.round(clamp(cmd.colorTemp, 1700, 6500)), 'smooth', SMOOTH_MS]));
          }
          if (cmd.brightness != null) {
            jobs.push(rpc(did, 'set_bright', [Math.round(clamp(cmd.brightness, 1, 100)), 'smooth', SMOOTH_MS]));
          }
          await Promise.all(jobs);
          return { id, ok: true };
        } catch (e) {
          return { id, ok: false, error: e instanceof Error ? e.message : 'Σφάλμα' };
        }
      }),
    );
  },
};
