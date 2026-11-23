import { useMemo } from 'react';
import type { Light, LightCaps } from '../../shared/types';
import { lightRgb, rgbCss } from '../lib/color';
import { control, setPower, useApp } from '../lib/store';
import { ControlPanel, type ControlState } from './ControlPanel';
import { Sheet } from './Sheet';
import { Switch } from './ui';

/** Κοινές δυνατότητες όλων των επιλεγμένων λαμπών. */
export function commonCaps(lights: Light[]): LightCaps {
  if (!lights.length) return { power: true, brightness: false, color: false, colorTemp: null };
  const withCt = lights.filter((l) => l.caps.colorTemp);
  return {
    power: true,
    brightness: lights.every((l) => l.caps.brightness),
    color: lights.every((l) => l.caps.color),
    colorTemp:
      withCt.length === lights.length
        ? { min: Math.max(...withCt.map((l) => l.caps.colorTemp!.min)), max: Math.min(...withCt.map((l) => l.caps.colorTemp!.max)) }
        : null,
  };
}

/**
 * Ζωντανός έλεγχος μίας ή περισσότερων λαμπών (διαφορετικών κατασκευαστών).
 * Κάθε κίνηση στέλνεται άμεσα στις πραγματικές λάμπες, με throttling.
 */
export function LightSheet({ ids, title, onClose }: { ids: string[] | null; title?: string; onClose: () => void }) {
  const all = useApp((s) => s.lights);
  const lights = useMemo(() => (ids ? all.filter((l) => ids.includes(l.id)) : []), [all, ids]);
  const controllable = lights.filter((l) => l.kind !== 'plug' || lights.length === 1);
  const online = controllable.filter((l) => l.online);
  const ref = online.find((l) => l.on) ?? online[0] ?? controllable[0];
  const caps = commonCaps(controllable.filter((l) => l.kind !== 'plug'));

  const anyOn = online.some((l) => l.on);
  const targetIds = online.map((l) => l.id);
  const single = lights.length === 1 ? lights[0] : null;

  const state: ControlState | null = ref
    ? { on: ref.on, brightness: ref.brightness, mode: ref.mode, hue: ref.hue, saturation: ref.saturation, colorTemp: ref.colorTemp }
    : null;

  const subtitle = single
    ? `${single.brand}${single.model ? ` ${single.model}` : ''}${single.room ? ` · ${single.room}` : ''}${single.online ? '' : ' · Εκτός σύνδεσης'}`
    : `${lights.length} συσκευές · ${online.length} διαθέσιμες`;

  return (
    <Sheet
      open={!!ids}
      onClose={onClose}
      title={title ?? single?.name ?? 'Ομάδα'}
      subtitle={subtitle}
      glow={ref && anyOn ? rgbCss(lightRgb(ref)) : undefined}
      headerRight={
        <Switch checked={anyOn} onChange={(v) => setPower(lights.map((l) => l.id), v)} label={anyOn ? 'Σβήσιμο' : 'Άναμμα'} />
      }
    >
      {!online.length ? (
        <div className="py-12 text-center text-white/55">
          <p className="text-[17px] font-medium text-white/80">Εκτός σύνδεσης</p>
          <p className="mx-auto mt-2 max-w-xs text-[14px]">
            Η λάμπα δεν είναι συνδεδεμένη στο Wi‑Fi. Έλεγξε ότι ο διακόπτης τοίχου είναι ανοιχτός.
          </p>
        </div>
      ) : state ? (
        <>
          {!single && (
            <div className="-mx-6 mb-5 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
              {lights.map((l) => (
                <span
                  key={l.id}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] ${l.online ? 'bg-white/[0.07] text-white/80' : 'bg-white/[0.03] text-white/35 line-through'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: l.on && l.online ? rgbCss(lightRgb(l)) : 'rgba(243,234,221,0.2)' }} />
                  {l.name}
                </span>
              ))}
            </div>
          )}
          <ControlPanel state={state} caps={caps} onChange={(cmd, final) => control(targetIds, cmd, final)} />
        </>
      ) : null}
    </Sheet>
  );
}
