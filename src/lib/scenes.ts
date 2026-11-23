import type { CommandAction, Light, Scene, SceneEntry } from '../../shared/types';
import { hsvToRgb, kelvinToRgb, rgbCss } from './color';
import { runActions, toast } from './store';

export function entryColor(e: SceneEntry): string {
  if (!e.on) return 'rgb(40,40,44)';
  return rgbCss(e.mode === 'white' ? kelvinToRgb(e.colorTemp ?? 3000) : hsvToRgb({ h: e.hue, s: e.saturation, v: 100 }));
}

export function sceneGradient(scene: Pick<Scene, 'entries'>): string {
  const colors = [...new Set(scene.entries.filter((e) => e.on).map(entryColor))].slice(0, 5);
  if (!colors.length) return 'linear-gradient(135deg, #2a2a2e, #18181b)';
  if (colors.length === 1) return `linear-gradient(135deg, ${colors[0]}, ${colors[0]}88)`;
  return `linear-gradient(135deg, ${colors.join(', ')})`;
}

export function entryFromLight(l: Light): SceneEntry {
  return {
    lightId: l.id,
    on: l.on,
    brightness: l.brightness,
    mode: l.caps.color ? l.mode : 'white',
    hue: l.hue,
    saturation: l.saturation,
    colorTemp: l.colorTemp ?? (l.caps.colorTemp ? 3000 : null),
  };
}

export function sceneActions(scene: Scene, lights: Light[]): CommandAction[] {
  const actions: CommandAction[] = [];
  for (const e of scene.entries) {
    const l = lights.find((x) => x.id === e.lightId);
    if (!l) continue;
    if (!e.on) {
      actions.push({ ids: [e.lightId], cmd: { on: false } });
      continue;
    }
    actions.push({
      ids: [e.lightId],
      cmd: {
        on: true,
        ...(l.caps.brightness ? { brightness: e.brightness } : {}),
        ...(e.mode === 'color' && l.caps.color
          ? { color: { h: e.hue, s: e.saturation } }
          : l.caps.colorTemp && e.colorTemp
            ? { colorTemp: e.colorTemp }
            : {}),
      },
    });
  }
  return actions;
}

export async function applyScene(scene: Scene, lights: Light[]) {
  const actions = sceneActions(scene, lights);
  if (!actions.length) {
    toast('Η σκηνή δεν περιέχει διαθέσιμες λάμπες', 'error');
    return;
  }
  const ok = await runActions(actions);
  if (ok) toast(`«${scene.name}» ενεργοποιήθηκε`);
}

type Tpl = (i: number, l: Light) => Omit<SceneEntry, 'lightId'>;
const white = (k: number, b: number): Omit<SceneEntry, 'lightId'> => ({ on: true, brightness: b, mode: 'white', hue: 0, saturation: 0, colorTemp: k });
const color = (h: number, s: number, b: number): Omit<SceneEntry, 'lightId'> => ({ on: true, brightness: b, mode: 'color', hue: h, saturation: s, colorTemp: null });

/** Έτοιμα πρότυπα σκηνών. Ο χρήστης μπορεί να τα αλλάξει ελεύθερα. */
export const TEMPLATES: { name: string; build: Tpl }[] = [
  { name: 'Cozy Evening', build: (i) => (i % 2 ? color(28, 75, 45) : white(2500, 40)) },
  { name: 'Movie Night', build: (_i, l) => (l.kind === 'strip' ? color(250, 90, 25) : l.kind === 'spot' ? { ...white(2700, 1), on: false } : color(265, 80, 8)) },
  { name: 'Relax', build: (i) => color(i % 2 ? 300 : 25, i % 2 ? 45 : 65, 35) },
  { name: 'Focus', build: () => white(5000, 100) },
  { name: 'Gaming', build: (i) => color([285, 190, 320][i % 3]!, 100, 85) },
  { name: 'Sleep', build: (_i, l) => (l.kind === 'bulb' || l.kind === 'strip' ? color(14, 100, 3) : { ...white(2500, 1), on: false }) },
];

export function buildTemplate(name: string, lights: Light[]): SceneEntry[] {
  const tpl = TEMPLATES.find((t) => t.name === name);
  if (!tpl) return [];
  return lights
    .filter((l) => l.kind !== 'plug')
    .map((l, i) => {
      const e = tpl.build(i, l);
      // Προσαρμογή στις δυνατότητες κάθε λάμπας
      if (e.mode === 'color' && !l.caps.color) return { lightId: l.id, ...white(2700, e.brightness), on: e.on };
      return { lightId: l.id, ...e };
    });
}
