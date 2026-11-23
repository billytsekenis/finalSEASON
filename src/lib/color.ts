import type { Light } from '../../shared/types';

export interface RGB {
  r: number;
  g: number;
  b: number;
}
export interface HSV {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  v: number;
}

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const S = s / 100;
  const V = v / 100;
  const C = V * S;
  const hh = ((h % 360) + 360) % 360 / 60;
  const X = C * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) [r, g, b] = [C, X, 0];
  else if (hh < 2) [r, g, b] = [X, C, 0];
  else if (hh < 3) [r, g, b] = [0, C, X];
  else if (hh < 4) [r, g, b] = [0, X, C];
  else if (hh < 5) [r, g, b] = [X, 0, C];
  else [r, g, b] = [C, 0, X];
  const m = V - C;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = 60 * (((G - B) / d) % 6);
    else if (max === G) h = 60 * ((B - R) / d + 2);
    else h = 60 * ((R - G) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max ? (d / max) * 100 : 0, v: max * 100 };
}

export function rgbToHex({ r, g, b }: RGB): string {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('')}`;
}

export function hexToRgb(hex: string): RGB | null {
  let h = hex.trim().replace(/^#/, '');
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const hsvToHex = (c: HSV) => rgbToHex(hsvToRgb(c));

/** Προσέγγιση χρώματος για θερμοκρασία λευκού (Tanner Helland). */
export function kelvinToRgb(k: number): RGB {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return { r: c(r), g: c(g), b: c(b) };
}

/** Το χρώμα που «βγάζει» η λάμπα, για προβολή στο UI (πάντα σε πλήρη φωτεινότητα για ζωντάνια). */
export function lightRgb(l: Pick<Light, 'mode' | 'hue' | 'saturation' | 'colorTemp' | 'caps'>): RGB {
  if (l.mode === 'white' || !l.caps.color) return kelvinToRgb(l.colorTemp ?? 3000);
  return hsvToRgb({ h: l.hue, s: l.saturation, v: 100 });
}

export const rgba = ({ r, g, b }: RGB, a: number) => `rgba(${r}, ${g}, ${b}, ${a})`;
export const rgbCss = ({ r, g, b }: RGB) => `rgb(${r}, ${g}, ${b})`;

/** Σχετική φωτεινότητα: για επιλογή σκούρου/ανοιχτού κειμένου πάνω σε χρώμα. */
export function isLight({ r, g, b }: RGB): boolean {
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
