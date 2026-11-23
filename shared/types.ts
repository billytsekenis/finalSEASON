// Κοινό μοντέλο συσκευών για frontend και backend.
// Κάθε provider (SmartThings, Xiaomi, …) μετατρέπει τις συσκευές του σε αυτή τη μορφή.

export type ProviderId = 'smartthings' | 'xiaomi';

export type LightKind = 'bulb' | 'strip' | 'spot' | 'plug';

export interface LightCaps {
  /** Υποστηρίζει on/off */
  power: boolean;
  /** Υποστηρίζει ρύθμιση φωτεινότητας */
  brightness: boolean;
  /** Υποστηρίζει χρώμα (hue/saturation) */
  color: boolean;
  /** Εύρος θερμοκρασίας λευκού σε Kelvin, αν υποστηρίζεται */
  colorTemp: { min: number; max: number } | null;
}

export interface Light {
  /** Μοναδικό id της μορφής `<provider>:<deviceId>` */
  id: string;
  provider: ProviderId;
  name: string;
  brand: string;
  model: string | null;
  kind: LightKind;
  room: string | null;
  online: boolean;
  on: boolean;
  /** 1–100 */
  brightness: number;
  mode: 'color' | 'white';
  /** 0–360 */
  hue: number;
  /** 0–100 */
  saturation: number;
  /** Kelvin */
  colorTemp: number | null;
  caps: LightCaps;
  /** Πραγματικός μετρητής ενέργειας (π.χ. πρίζα P110), αν υπάρχει */
  meter?: { totalWh: number; deltaWh: number; start: string; end: string } | null;
}

/** Εντολή προς μία ή περισσότερες λάμπες. Όλα τα πεδία είναι προαιρετικά. */
export interface LightCommand {
  on?: boolean;
  /** 1–100 */
  brightness?: number;
  /** hue 0–360, saturation 0–100 */
  color?: { h: number; s: number };
  /** Kelvin */
  colorTemp?: number;
}

export interface CommandAction {
  ids: string[];
  cmd: LightCommand;
}

export interface CommandResult {
  id: string;
  ok: boolean;
  error?: string;
  /** Αν το API του κατασκευαστή περιόρισε τον ρυθμό, σε πόσα ms ξαναδοκιμάζουμε */
  retryAfterMs?: number;
  /** Πόσες εντολές απομένουν στο τρέχον παράθυρο (αν είναι γνωστό) */
  remaining?: number;
}

export interface ProviderStatus {
  id: ProviderId;
  name: string;
  connected: boolean;
  error?: string;
}

export interface LightsResponse {
  lights: Light[];
  providers: ProviderStatus[];
  /** true αν τα δεδομένα είναι από cache επειδή το API απέρριψε το αίτημα */
  stale?: boolean;
  fetchedAt: number;
}

export interface SceneEntry {
  lightId: string;
  on: boolean;
  brightness: number;
  mode: 'color' | 'white';
  hue: number;
  saturation: number;
  colorTemp: number | null;
}

export interface Scene {
  id: string;
  name: string;
  entries: SceneEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface Group {
  id: string;
  name: string;
  lightIds: string[];
}

export interface UserData {
  scenes: Scene[];
  groups: Group[];
  /** Αποθηκευμένα χρώματα σε HEX (#rrggbb) */
  favorites: string[];
  /** Τιμή ρεύματος σε €/kWh */
  kwhPrice?: number;
  updatedAt: number;
}

export interface EnergyDevice {
  id: string;
  name: string;
  brand: string;
  model: string | null;
  /** meter = πραγματική μέτρηση, estimate = εκτίμηση */
  source: 'meter' | 'estimate';
  online: boolean;
  nowW: number;
  ratedW: number | null;
  kwh: { today: number; d7: number; d30: number; all: number };
  /** Τελευταίες 30 ημέρες */
  days: { date: string; kwh: number }[];
  trackedSince: string;
  lifetimeLabel: string;
}

export interface EnergyResponse {
  devices: EnergyDevice[];
  nowW: number;
  kwhPrice: number;
  trackingSince: string;
}
