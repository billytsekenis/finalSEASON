import type { CommandResult, Light, LightCommand, LightKind } from '../../../shared/types.js';
import { accessToken, authStatus } from '../smartthings-auth.js';
import { getJson, setJson } from '../store.js';
import { ProviderError, clamp, type LightProvider } from './types.js';

const API = 'https://api.smartthings.com/v1';

interface AttrValue {
  value: unknown;
  timestamp?: string;
}
type CapStatus = Record<string, AttrValue>;
interface STComponent {
  id: string;
  capabilities: { id: string; status?: CapStatus }[];
  categories?: { name: string }[];
}
interface STDevice {
  deviceId: string;
  label?: string;
  name?: string;
  manufacturerName?: string;
  roomId?: string;
  locationId?: string;
  components: STComponent[];
  viper?: { manufacturerName?: string; modelName?: string };
  ocf?: { manufacturerName?: string; modelNumber?: string };
}

interface RateInfo {
  remaining?: number;
  resetMs?: number;
}

function rateInfo(res: Response): RateInfo {
  // Το SmartThings στέλνει τα headers δύο φορές (δύο επίπεδα ορίων). Κρατάμε το αυστηρότερο.
  const parse = (h: string | null) =>
    (h ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  const rem = parse(res.headers.get('x-ratelimit-remaining'));
  const reset = parse(res.headers.get('x-ratelimit-reset'));
  return {
    remaining: rem.length ? Math.min(...rem) : undefined,
    resetMs: reset.length ? Math.max(...reset) : undefined,
  };
}

async function st(path: string, init: RequestInit = {}, retried = false): Promise<Response> {
  const token = await accessToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401 && !retried) {
    await accessToken({ forceRefresh: true }).catch(() => {});
    return st(path, init, true);
  }
  return res;
}

function attr(comp: STComponent, cap: string, name: string): AttrValue | undefined {
  return comp.capabilities.find((c) => c.id === cap)?.status?.[name];
}

function has(comp: STComponent, cap: string): boolean {
  return comp.capabilities.some((c) => c.id === cap);
}

function brandOf(d: STDevice): { brand: string; model: string | null } {
  const manu = d.viper?.manufacturerName ?? d.ocf?.manufacturerName ?? d.manufacturerName ?? '';
  const model = d.viper?.modelName ?? d.ocf?.modelNumber ?? null;
  if (/tp-?link/i.test(manu)) return { brand: 'Tapo', model };
  if (/yeelight/i.test(manu)) return { brand: 'Yeelight', model };
  if (/xiaomi/i.test(manu)) return { brand: 'Xiaomi', model };
  return { brand: manu || 'SmartThings', model };
}

function kindOf(model: string | null, comp: STComponent): LightKind {
  if (!has(comp, 'switchLevel') && !has(comp, 'colorControl')) return 'plug';
  const m = (model ?? '').toUpperCase();
  if (/^L9\d\d/.test(m) || /STRIP/.test(m)) return 'strip';
  if (/^L6\d\d/.test(m)) return 'spot';
  return 'bulb';
}

function ts(v?: AttrValue): number {
  return v?.timestamp ? Date.parse(v.timestamp) : 0;
}

function isLightLike(d: STDevice): boolean {
  const main = d.components.find((c) => c.id === 'main');
  if (!main || !has(main, 'switch')) return false;
  if (has(main, 'colorControl') || has(main, 'switchLevel') || has(main, 'colorTemperature')) return true;
  // Πρίζες Tapo (π.χ. P110) με λάμπα: μόνο on/off.
  const manu = d.viper?.manufacturerName ?? d.manufacturerName ?? '';
  return /tp-?link/i.test(manu);
}

function toLight(d: STDevice, rooms: Record<string, string>): Light {
  const main = d.components.find((c) => c.id === 'main')!;
  const { brand, model } = brandOf(d);
  const kind = kindOf(model, main);

  const health = attr(main, 'healthCheck', 'DeviceWatch-DeviceStatus')?.value;
  const switchVal = attr(main, 'switch', 'switch')?.value;
  const online = health ? health === 'online' : switchVal != null;

  const level = Number(attr(main, 'switchLevel', 'level')?.value ?? 100);
  const hueAttr = attr(main, 'colorControl', 'hue');
  const satAttr = attr(main, 'colorControl', 'saturation');
  const ctAttr = attr(main, 'colorTemperature', 'colorTemperature');
  const ctRange = attr(main, 'colorTemperature', 'colorTemperatureRange')?.value as { minimum?: number; maximum?: number } | null;

  const hueRaw = Number(hueAttr?.value ?? 0);
  const sat = Number(satAttr?.value ?? 0);
  const ct = ctAttr?.value != null ? Number(ctAttr.value) : null;

  const supportsCt = has(main, 'colorTemperature');
  const supportsColor = has(main, 'colorControl');
  // Αν η θερμοκρασία λευκού άλλαξε πιο πρόσφατα από το χρώμα, η λάμπα είναι σε λειτουργία λευκού.
  const mode: Light['mode'] =
    !supportsColor || (supportsCt && ct != null && ts(ctAttr) > Math.max(ts(hueAttr), ts(satAttr))) ? 'white' : 'color';

  return {
    id: `smartthings:${d.deviceId}`,
    provider: 'smartthings',
    name: d.label || d.name || 'Λάμπα',
    brand,
    model,
    kind,
    room: d.roomId ? (rooms[d.roomId] ?? null) : null,
    online,
    on: switchVal === 'on',
    brightness: clamp(Math.round(level || 1), 1, 100),
    mode,
    hue: clamp((hueRaw / 100) * 360, 0, 360),
    saturation: clamp(sat, 0, 100),
    colorTemp: ct,
    caps: {
      power: true,
      brightness: has(main, 'switchLevel'),
      color: supportsColor,
      colorTemp: supportsCt
        ? { min: ctRange?.minimum ?? (brand === 'Tapo' ? 2500 : 1700), max: ctRange?.maximum ?? 6500 }
        : null,
    },
  };
}

async function rooms(locationIds: string[]): Promise<Record<string, string>> {
  const cached = await getJson<Record<string, string>>('st:rooms');
  if (cached) return cached;
  const map: Record<string, string> = {};
  await Promise.all(
    locationIds.map(async (loc) => {
      const res = await st(`/locations/${loc}/rooms`);
      if (!res.ok) return;
      const body = (await res.json()) as { items: { roomId: string; name: string }[] };
      for (const r of body.items) map[r.roomId] = r.name;
    }),
  );
  await setJson('st:rooms', map, 3600);
  return map;
}

const LAST_KEY = 'st:last';

export const smartthings: LightProvider = {
  id: 'smartthings',
  name: 'SmartThings',

  async isConnected() {
    return (await authStatus()).connected;
  },

  async list() {
    const res = await st('/devices?includeStatus=true');
    if (res.status === 429) {
      const last = await getJson<Light[]>(LAST_KEY);
      if (last) return { lights: last, stale: true };
      throw new ProviderError('Όριο αιτημάτων SmartThings', 'rate_limited', rateInfo(res).resetMs);
    }
    if (res.status === 401 || res.status === 403) throw new ProviderError('Το SmartThings απέρριψε τη σύνδεση. Σύνδεσε ξανά.', 'auth');
    if (!res.ok) throw new ProviderError(`SmartThings HTTP ${res.status}`);
    const body = (await res.json()) as { items: STDevice[] };
    const devices = body.items.filter(isLightLike);
    const locs = [...new Set(devices.map((d) => d.locationId).filter((x): x is string => !!x))];
    const roomMap = await rooms(locs).catch(() => ({}) as Record<string, string>);
    const lights = devices.map((d) => toLight(d, roomMap));
    await setJson(LAST_KEY, lights, 7 * 24 * 3600).catch(() => {});
    return { lights };
  },

  async command(deviceIds, cmd) {
    const commands = buildCommands(cmd);
    if (!commands.length) return deviceIds.map((id) => ({ id: `smartthings:${id}`, ok: true }));
    return Promise.all(
      deviceIds.map(async (id): Promise<CommandResult> => {
        const full = `smartthings:${id}`;
        try {
          const res = await st(`/devices/${encodeURIComponent(id)}/commands`, {
            method: 'POST',
            body: JSON.stringify({ commands }),
          });
          const rate = rateInfo(res);
          if (res.status === 429) {
            return { id: full, ok: false, error: 'rate_limited', retryAfterMs: rate.resetMs ?? 10_000, remaining: 0 };
          }
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            return { id: full, ok: false, error: `HTTP ${res.status} ${text.slice(0, 160)}`.trim() };
          }
          const body = (await res.json().catch(() => ({}))) as { results?: { status: string }[] };
          const failed = body.results?.find((r) => r.status !== 'ACCEPTED' && r.status !== 'COMPLETED');
          return {
            id: full,
            ok: !failed,
            error: failed ? `Η συσκευή απάντησε ${failed.status}` : undefined,
            remaining: rate.remaining,
            retryAfterMs: rate.remaining === 0 ? rate.resetMs : undefined,
          };
        } catch (e) {
          return { id: full, ok: false, error: e instanceof Error ? e.message : 'Σφάλμα' };
        }
      }),
    );
  },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Μετατρέπει την ενιαία εντολή σε εντολές SmartThings, με τη σωστή σειρά. */
export function buildCommands(cmd: LightCommand) {
  const out: { component: 'main'; capability: string; command: string; arguments?: unknown[] }[] = [];
  const turningOff = cmd.on === false;
  if (cmd.on === true) out.push({ component: 'main', capability: 'switch', command: 'on' });
  if (!turningOff) {
    if (cmd.color) {
      out.push({
        component: 'main',
        capability: 'colorControl',
        command: 'setColor',
        arguments: [{ hue: round2(clamp(cmd.color.h, 0, 360) / 3.6), saturation: round2(clamp(cmd.color.s, 0, 100)) }],
      });
    } else if (cmd.colorTemp != null) {
      out.push({
        component: 'main',
        capability: 'colorTemperature',
        command: 'setColorTemperature',
        arguments: [Math.round(cmd.colorTemp)],
      });
    }
    if (cmd.brightness != null) {
      out.push({
        component: 'main',
        capability: 'switchLevel',
        command: 'setLevel',
        arguments: [Math.round(clamp(cmd.brightness, 1, 100))],
      });
    }
  }
  if (turningOff) out.push({ component: 'main', capability: 'switch', command: 'off' });
  return out;
}
