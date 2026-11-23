import { useSyncExternalStore } from 'react';
import type { CommandAction, Light, LightCommand, ProviderStatus, UserData } from '../../shared/types';
import { ApiError, api } from './api';
import { CommandScheduler } from './scheduler';

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
  action?: { label: string; run: () => void };
}

export interface AppState {
  phase: 'boot' | 'login' | 'ready';
  lights: Light[];
  providers: ProviderStatus[];
  lightsLoaded: boolean;
  lightsError: string | null;
  stale: boolean;
  data: UserData;
  toast: Toast | null;
}

const EMPTY_DATA: UserData = { scenes: [], groups: [], favorites: [], updatedAt: 0 };

let state: AppState = {
  phase: 'boot',
  lights: [],
  providers: [],
  lightsLoaded: false,
  lightsError: null,
  stale: false,
  data: EMPTY_DATA,
  toast: null,
};

const listeners = new Set<() => void>();

function set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
}

export function useApp<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(state),
  );
}

export const getState = () => state;

// ───────────────────────── Toasts ─────────────────────────
let toastTimer: ReturnType<typeof setTimeout> | null = null;
export function toast(message: string, tone: Toast['tone'] = 'info', ms = 3200, action?: Toast['action']) {
  if (toastTimer) clearTimeout(toastTimer);
  set({ toast: { id: Date.now(), message, tone, action } });
  toastTimer = setTimeout(() => set({ toast: null }), ms);
}

export function dismissToast() {
  if (toastTimer) clearTimeout(toastTimer);
  set({ toast: null });
}

// ───────────────────────── Optimistic updates ─────────────────────────
/** Για λίγα δευτερόλεπτα μετά από τοπική αλλαγή, αγνοούμε τις (πιθανώς παλιές) τιμές του polling. */
const locks = new Map<string, number>();
const LOCK_MS = 6000;

function applyToLight(l: Light, cmd: LightCommand): Light {
  const next = { ...l };
  if (cmd.on != null) next.on = cmd.on;
  if (cmd.brightness != null) next.brightness = Math.round(cmd.brightness);
  if (cmd.color && l.caps.color) {
    next.mode = 'color';
    next.hue = cmd.color.h;
    next.saturation = cmd.color.s;
  }
  if (cmd.colorTemp != null && l.caps.colorTemp) {
    next.mode = 'white';
    next.colorTemp = cmd.colorTemp;
  }
  return next;
}

function optimistic(actions: CommandAction[]) {
  const until = Date.now() + LOCK_MS;
  set((s) => {
    let lights = s.lights;
    for (const a of actions) {
      const ids = new Set(a.ids);
      ids.forEach((id) => locks.set(id, until));
      lights = lights.map((l) => (ids.has(l.id) ? applyToLight(l, a.cmd) : l));
    }
    return { lights };
  });
}

// ───────────────────────── Commands ─────────────────────────
let rateToastAt = 0;
const scheduler = new CommandScheduler({
  onRateLimited(ms) {
    if (Date.now() - rateToastAt > 8000) {
      rateToastAt = Date.now();
      toast(`Όριο SmartThings: η τελευταία τιμή θα εφαρμοστεί σε ${Math.ceil(ms / 1000)}″`);
    }
  },
  onError(msg) {
    toast(friendlyError(msg), 'error');
  },
  onResults(results) {
    // Αν μια λάμπα απέτυχε (π.χ. offline), δεν κρατάμε άλλο την αισιόδοξη τιμή.
    for (const r of results) if (!r.ok && r.error !== 'rate_limited') locks.delete(r.id);
  },
});

function friendlyError(msg: string) {
  if (/offline/i.test(msg)) return 'Η λάμπα είναι εκτός σύνδεσης';
  return msg.length > 120 ? `${msg.slice(0, 117)}…` : msg;
}

/** Ζωντανός έλεγχος (sliders, color wheel) με throttling. */
export function control(ids: string[], cmd: LightCommand, final = false) {
  if (!ids.length) return;
  // Αλλαγή χρώματος/φωτεινότητας σε σβηστή λάμπα: την ανάβουμε.
  const anyOff = state.lights.some((l) => ids.includes(l.id) && !l.on);
  const full: LightCommand =
    cmd.on == null && anyOff && (cmd.brightness != null || cmd.color || cmd.colorTemp != null) ? { on: true, ...cmd } : cmd;
  optimistic([{ ids, cmd: full }]);
  scheduler.push(ids, full, final);
}

/** Άμεση εκτέλεση πολλών ενεργειών (σκηνές, ομαδικό on/off). */
export async function runActions(actions: CommandAction[]): Promise<boolean> {
  const valid = actions.filter((a) => a.ids.length);
  if (!valid.length) return true;
  optimistic(valid);
  try {
    const { results } = await api.command(valid);
    const failed = results.filter((r) => !r.ok);
    failed.forEach((r) => locks.delete(r.id));
    if (failed.length) {
      const names = failed
        .map((r) => state.lights.find((l) => l.id === r.id)?.name)
        .filter(Boolean)
        .join(', ');
      const limited = failed.every((r) => r.error === 'rate_limited');
      toast(limited ? 'Όριο αιτημάτων SmartThings — δοκίμασε ξανά σε λίγα δευτερόλεπτα' : `Δεν ανταποκρίθηκαν: ${names}`, 'error');
      setTimeout(refreshLights, 1500);
      return false;
    }
    return true;
  } catch (e) {
    actions.flatMap((a) => a.ids).forEach((id) => locks.delete(id));
    toast(e instanceof Error ? e.message : 'Σφάλμα', 'error');
    setTimeout(refreshLights, 500);
    return false;
  }
}

export function setPower(ids: string[], on: boolean) {
  const targets = state.lights.filter((l) => ids.includes(l.id) && l.online).map((l) => l.id);
  if (!targets.length) {
    toast(ids.length === 1 ? 'Η λάμπα είναι εκτός σύνδεσης' : 'Καμία διαθέσιμη λάμπα', 'error');
    return;
  }
  void runActions([{ ids: targets, cmd: { on } }]);
}

// ───────────────────────── Loading ─────────────────────────
let refreshing: Promise<void> | null = null;

export function refreshLights(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const r = await api.lights();
      const now = Date.now();
      set((s) => ({
        lights: r.lights.map((fresh) => {
          const lock = locks.get(fresh.id);
          if (lock && lock > now) {
            const local = s.lights.find((l) => l.id === fresh.id);
            if (local) return { ...fresh, on: local.on, brightness: local.brightness, mode: local.mode, hue: local.hue, saturation: local.saturation, colorTemp: local.colorTemp };
          }
          return fresh;
        }),
        providers: r.providers,
        stale: !!r.stale,
        lightsLoaded: true,
        lightsError: null,
      }));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      set({ lightsError: e instanceof Error ? e.message : 'Σφάλμα', lightsLoaded: true });
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function loadData() {
  try {
    set({ data: await api.data() });
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) toast('Δεν φορτώθηκαν οι σκηνές', 'error');
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** Αλλάζει σκηνές/ομάδες/αγαπημένα τοπικά και τα αποθηκεύει στον server. */
export function updateData(fn: (d: UserData) => UserData) {
  set((s) => ({ data: fn(s.data) }));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api.saveData(state.data);
    } catch (e) {
      toast(`Δεν αποθηκεύτηκε: ${e instanceof Error ? e.message : ''}`, 'error');
    }
  }, 350);
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) void refreshLights();
  }, 12_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshLights();
  });
  window.addEventListener('online', () => void refreshLights());
}

export async function boot() {
  window.addEventListener('lumen:unauthorized', () => set({ phase: 'login' }));
  try {
    const { authenticated } = await api.session();
    if (!authenticated) {
      set({ phase: 'login' });
      return;
    }
    set({ phase: 'ready' });
    await Promise.all([refreshLights(), loadData()]);
    startPolling();
  } catch (e) {
    set({ phase: 'ready', lightsError: e instanceof Error ? e.message : 'Σφάλμα', lightsLoaded: true });
    startPolling();
  }
}

export async function signIn(password: string) {
  await api.login(password);
  set({ phase: 'ready' });
  await Promise.all([refreshLights(), loadData()]);
  startPolling();
}

export async function signOut() {
  await api.logout().catch(() => {});
  set({ phase: 'login', lights: [], data: EMPTY_DATA, lightsLoaded: false });
}

// ───────────────────────── Recent colors (μόνο τοπικά, δεν είναι ευαίσθητα) ─────────────────────────
const RECENT_KEY = 'lumen:recent';
export function getRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}
export function pushRecent(hex: string) {
  try {
    const list = [hex, ...getRecent().filter((h) => h !== hex)].slice(0, 12);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* private mode */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ───────────────────────── Αναίρεση ─────────────────────────
/** Φωτογραφίζει την κατάσταση λαμπών ώστε να μπορεί να επαναφερθεί. */
export function snapshot(ids: string[]): CommandAction[] {
  return state.lights
    .filter((l) => ids.includes(l.id) && l.online)
    .map((l) => ({
      ids: [l.id],
      cmd: !l.on
        ? { on: false }
        : {
            on: true,
            ...(l.caps.brightness ? { brightness: l.brightness } : {}),
            ...(l.mode === 'color' && l.caps.color
              ? { color: { h: l.hue, s: l.saturation } }
              : l.caps.colorTemp && l.colorTemp
                ? { colorTemp: l.colorTemp }
                : {}),
          },
    }));
}

/** Εμφανίζει μήνυμα με κουμπί «Αναίρεση» που επαναφέρει την κατάσταση πριν από την αλλαγή. */
export function offerUndo(message: string, before: CommandAction[]) {
  if (!before.length) return toast(message);
  toast(message, 'info', 7000, {
    label: 'Αναίρεση',
    run: () => {
      dismissToast();
      void runActions(before).then((ok) => ok && toast('Επαναφέρθηκε'));
    },
  });
}

// ───────────────────────── Ομαδικός έλεγχος ─────────────────────────
let dimBase: { ids: string[]; base: Map<string, number>; ref: number; before: CommandAction[] } | null = null;

/** Μέση φωτεινότητα των αναμμένων λαμπών (για τον συνολικό slider). */
export function averageBrightness(ids: string[]): number {
  const on = state.lights.filter((l) => ids.includes(l.id) && l.on && l.online && l.caps.brightness);
  if (!on.length) return 0;
  return Math.round(on.reduce((s, l) => s + l.brightness, 0) / on.length);
}

/**
 * Αναλογική αλλαγή έντασης: κάθε λάμπα κρατά τη σχέση της με τις άλλες (π.χ. σε μια σκηνή).
 * value = νέα «μέση» ένταση. final = ο χρήστης άφησε τον slider.
 */
export function scaleBrightness(ids: string[], value: number, final: boolean) {
  if (!dimBase || dimBase.ids.join() !== ids.join()) {
    const on = state.lights.filter((l) => ids.includes(l.id) && l.on && l.online && l.caps.brightness);
    dimBase = {
      ids,
      base: new Map(on.map((l) => [l.id, l.brightness])),
      ref: Math.max(1, averageBrightness(ids)),
      before: snapshot(on.map((l) => l.id)),
    };
  }
  const factor = value / dimBase.ref;
  for (const [id, b] of dimBase.base) {
    const nb = Math.max(1, Math.min(100, Math.round(value >= 100 ? 100 : b * factor)));
    control([id], { brightness: nb }, final);
  }
  if (final) {
    const before = dimBase.before;
    dimBase = null;
    offerUndo(`Ένταση ${Math.round(value)}%`, before);
  }
}

/** Ίδιο «λευκό» σε όλα· οι Yeelight παίρνουν λίγο ζεστότερη τιμή για να ταιριάζουν οπτικά με τις Tapo. */
export function setWhiteAll(ids: string[], kelvin: number, label: string) {
  const targets = state.lights.filter((l) => ids.includes(l.id) && l.online && l.caps.colorTemp);
  if (!targets.length) return toast('Καμία διαθέσιμη λάμπα', 'error');
  const before = snapshot(targets.map((l) => l.id));
  const actions: CommandAction[] = targets.map((l) => {
    const k = l.provider === 'xiaomi' ? kelvin - 350 : kelvin;
    const ct = Math.max(l.caps.colorTemp!.min, Math.min(l.caps.colorTemp!.max, k));
    return { ids: [l.id], cmd: { on: true, colorTemp: ct } };
  });
  void runActions(actions).then((ok) => ok && offerUndo(`Όλα σε «${label}»`, before));
}
