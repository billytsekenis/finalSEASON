import { useEffect, useMemo, useState } from 'react';
import type { LightCaps, LightCommand } from '../../shared/types';
import { hexToRgb, hsvToHex, hsvToRgb, kelvinToRgb, rgbCss, rgbToHex, rgbToHsv } from '../lib/color';
import { getRecent, pushRecent, updateData, useApp } from '../lib/store';
import { ColorWheel } from './ColorWheel';
import { PlusIcon, SunIcon } from './Icons';
import { Slider } from './Slider';
import { Segmented } from './ui';

export interface ControlState {
  on: boolean;
  brightness: number;
  mode: 'color' | 'white';
  hue: number;
  saturation: number;
  colorTemp: number | null;
}

interface Props {
  state: ControlState;
  caps: LightCaps;
  /** final=true όταν ο χρήστης ολοκληρώσει την κίνηση (άφησε το δάχτυλο / πάτησε Enter) */
  onChange: (cmd: LightCommand, final: boolean) => void;
  disabled?: boolean;
}

const WHITE_PRESETS = [
  { k: 2500, label: 'Κερί' },
  { k: 2700, label: 'Ζεστό' },
  { k: 3500, label: 'Απαλό' },
  { k: 4000, label: 'Φυσικό' },
  { k: 5000, label: 'Ημέρα' },
  { k: 6500, label: 'Ψυχρό' },
];

function useWheelSize() {
  const calc = () => Math.min(260, Math.max(200, (typeof window === 'undefined' ? 360 : window.innerWidth) - 96));
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const on = () => setSize(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function ControlPanel({ state, caps, onChange, disabled }: Props) {
  const [tab, setTab] = useState<'color' | 'white'>(caps.color ? (caps.colorTemp && state.mode === 'white' ? 'white' : 'color') : 'white');
  const size = useWheelSize();
  const favorites = useApp((s) => s.data.favorites);
  const [recent, setRecent] = useState(getRecent);

  const ctMin = caps.colorTemp?.min ?? 2500;
  const ctMax = caps.colorTemp?.max ?? 6500;
  const ct = Math.min(ctMax, Math.max(ctMin, state.colorTemp ?? 3000));
  const hueHex = hsvToHex({ h: state.hue, s: 100, v: 100 });
  const currentHex = hsvToHex({ h: state.hue, s: state.saturation, v: 100 });

  const commitColor = (h: number, s: number) => {
    onChange({ color: { h, s } }, true);
    pushRecent(hsvToHex({ h, s, v: 100 }));
    setRecent(getRecent());
  };

  const applyHex = (hex: string, withBrightness: boolean) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return false;
    const { h, s, v } = rgbToHsv(rgb);
    const cmd: LightCommand = { color: { h, s } };
    if (withBrightness && caps.brightness) cmd.brightness = Math.max(1, Math.round(v));
    onChange(cmd, true);
    pushRecent(hsvToHex({ h, s, v: 100 }));
    setRecent(getRecent());
    return true;
  };

  const isFav = favorites.includes(currentHex);
  const toggleFav = () =>
    updateData((d) => ({
      ...d,
      favorites: isFav ? d.favorites.filter((f) => f !== currentHex) : [currentHex, ...d.favorites].slice(0, 48),
    }));

  const brightnessSlider = caps.brightness && (
    <Slider
      label="Φωτεινότητα"
      value={state.brightness}
      min={1}
      max={100}
      format={(v) => `${Math.round(v)}%`}
      icon={<SunIcon className="h-5 w-5" />}
      fillColor={
        state.mode === 'white' || !caps.color
          ? rgbCss(kelvinToRgb(ct))
          : rgbCss(hsvToRgb({ h: state.hue, s: Math.min(state.saturation, 85), v: 100 }))
      }
      onChange={(v) => onChange({ brightness: v }, false)}
      onCommit={(v) => onChange({ brightness: v }, true)}
      disabled={disabled}
    />
  );

  if (!caps.color && !caps.colorTemp) {
    return <div className="space-y-6 pb-4">{brightnessSlider || <p className="py-6 text-center text-white/50">Αυτή η συσκευή υποστηρίζει μόνο άναμμα και σβήσιμο.</p>}</div>;
  }

  return (
    <div className="space-y-5 pb-4">
      {caps.color && caps.colorTemp && (
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'color', label: 'Χρώμα' },
            { value: 'white', label: 'Λευκό' },
          ]}
        />
      )}

      {tab === 'color' && caps.color ? (
        <>
          <div className="flex justify-center py-2">
            <ColorWheel
              size={size}
              hue={state.hue}
              saturation={state.mode === 'color' ? state.saturation : 0}
              onChange={(h, s) => onChange({ color: { h, s } }, false)}
              onCommit={commitColor}
              disabled={disabled}
            />
          </div>

          <Slider
            label="Κορεσμός"
            variant="thumb"
            value={state.saturation}
            min={0}
            max={100}
            format={(v) => `${Math.round(v)}%`}
            track={`linear-gradient(90deg, #fff, ${hueHex})`}
            fillColor={currentHex}
            onChange={(v) => onChange({ color: { h: state.hue, s: v } }, false)}
            onCommit={(v) => commitColor(state.hue, v)}
            disabled={disabled}
          />
          {brightnessSlider}

          <ColorValues hue={state.hue} saturation={state.saturation} brightness={state.brightness} onHex={applyHex} onHsv={(h, s, v) => {
            const cmd: LightCommand = { color: { h, s } };
            if (caps.brightness) cmd.brightness = Math.max(1, v);
            onChange(cmd, true);
          }} />

          <Swatches
            title="Αγαπημένα"
            colors={favorites}
            current={currentHex}
            onPick={(hex) => applyHex(hex, false)}
            leading={
              <button
                onClick={toggleFav}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed transition active:scale-90 ${
                  isFav ? 'border-white/60 text-white' : 'border-white/25 text-white/60'
                }`}
                aria-label={isFav ? 'Αφαίρεση από αγαπημένα' : 'Αποθήκευση στα αγαπημένα'}
              >
                {isFav ? '★' : <PlusIcon className="h-5 w-5" />}
              </button>
            }
            empty="Πάτα + για να αποθηκεύσεις το τρέχον χρώμα"
          />
          <Swatches title="Πρόσφατα" colors={recent} current={currentHex} onPick={(hex) => applyHex(hex, false)} empty="Τα χρώματα που χρησιμοποιείς θα εμφανίζονται εδώ" />
        </>
      ) : (
        <>
          <div className="flex justify-center py-3">
            <div
              className="h-32 w-32 rounded-full transition-[background,box-shadow] duration-300"
              style={{
                background: `radial-gradient(circle at 50% 40%, #fff6ea 0%, ${rgbCss(kelvinToRgb(ct))} 70%)`,
                boxShadow: `0 0 90px -5px ${rgbCss(kelvinToRgb(ct))}`,
                opacity: 0.35 + (state.brightness / 100) * 0.65,
              }}
            />
          </div>
          <Slider
            label="Θερμοκρασία λευκού"
            variant="thumb"
            value={ct}
            min={ctMin}
            max={ctMax}
            step={50}
            format={(v) => `${Math.round(v)} K`}
            track={`linear-gradient(90deg, ${rgbCss(kelvinToRgb(ctMin))}, ${rgbCss(kelvinToRgb((ctMin + ctMax) / 2))}, ${rgbCss(kelvinToRgb(ctMax))})`}
            fillColor={rgbCss(kelvinToRgb(ct))}
            onChange={(v) => onChange({ colorTemp: v }, false)}
            onCommit={(v) => onChange({ colorTemp: v }, true)}
            disabled={disabled}
          />
          <div className="grid grid-cols-3 gap-2">
            {WHITE_PRESETS.filter((p) => p.k >= ctMin && p.k <= ctMax).map((p) => (
              <button
                key={p.k}
                onClick={() => onChange({ colorTemp: p.k }, true)}
                className={`flex h-12 flex-col items-center justify-center rounded-xl border transition active:scale-95 ${
                  state.mode === 'white' && Math.abs(ct - p.k) < 60 ? 'border-white/50 bg-white/10' : 'border-white/[0.06] bg-white/[0.04]'
                }`}
              >
                <span className="mb-1 h-2.5 w-2.5 rounded-full" style={{ background: rgbCss(kelvinToRgb(p.k)) }} />
                <span className="text-[13px] font-medium">{p.label}</span>
              </button>
            ))}
          </div>
          {brightnessSlider}
        </>
      )}
    </div>
  );
}

function Swatches({
  title,
  colors,
  current,
  onPick,
  leading,
  empty,
}: {
  title: string;
  colors: string[];
  current: string;
  onPick: (hex: string) => void;
  leading?: React.ReactNode;
  empty: string;
}) {
  return (
    <div>
      <div className="mb-2 px-1 text-[13px] font-medium tracking-wide text-white/55 uppercase">{title}</div>
      <div className="-mx-6 flex items-center gap-2.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none]">
        {leading}
        {colors.length === 0 && <span className="text-[13px] text-white/35">{empty}</span>}
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            aria-label={`Χρώμα ${c}`}
            className={`h-9 w-9 shrink-0 rounded-full transition active:scale-90 ${c === current ? 'ring-2 ring-white ring-offset-2 ring-offset-[#211b16]' : ''}`}
            style={{ background: c, boxShadow: `0 4px 14px ${c}55` }}
          />
        ))}
      </div>
    </div>
  );
}

/** Ακριβής εισαγωγή HEX / RGB / HSV. */
function ColorValues({
  hue,
  saturation,
  brightness,
  onHex,
  onHsv,
}: {
  hue: number;
  saturation: number;
  brightness: number;
  onHex: (hex: string, withBrightness: boolean) => boolean;
  onHsv: (h: number, s: number, v: number) => void;
}) {
  const hsv = useMemo(() => ({ h: hue, s: saturation, v: brightness }), [hue, saturation, brightness]);
  const rgb = hsvToRgb(hsv);
  const hex = rgbToHex(rgb);
  const [hexText, setHexText] = useState(hex);
  const [rgbText, setRgbText] = useState([rgb.r, rgb.g, rgb.b].map(String));
  const [hsvText, setHsvText] = useState([hsv.h, hsv.s, hsv.v].map((n) => String(Math.round(n))));
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState<'hex' | 'rgb' | 'hsv'>('hex');
  const [bad, setBad] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (editing) return;
    setHexText(hex.toUpperCase());
    setRgbText([rgb.r, rgb.g, rgb.b].map(String));
    setHsvText([hsv.h, hsv.s, hsv.v].map((n) => String(Math.round(n))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, editing]);

  const submit = () => {
    setEditing(false);
    if (!dirty) return;
    setDirty(false);
    if (mode === 'hex') {
      const ok = onHex(hexText, true);
      setBad(!ok);
    } else if (mode === 'rgb') {
      const [r, g, b] = rgbText.map((t) => Math.min(255, Math.max(0, Number(t) || 0)));
      setBad(false);
      onHex(rgbToHex({ r: r!, g: g!, b: b! }), true);
    } else {
      const [h, s, v] = hsvText.map((t) => Number(t) || 0);
      setBad(false);
      onHsv(((h! % 360) + 360) % 360, Math.min(100, Math.max(0, s!)), Math.min(100, Math.max(1, v!)));
    }
  };

  const input = 'h-11 w-full rounded-xl bg-white/[0.06] px-3 text-center text-[16px] font-medium tabular-nums outline-none focus:bg-white/[0.1] focus:ring-1 focus:ring-white/30';

  return (
    <div className="rounded-[22px] bg-white/[0.04] p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-xl" style={{ background: hex, boxShadow: `0 0 24px ${hex}66` }} />
        <div className="flex-1">
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              setBad(false);
            }}
            options={[
              { value: 'hex', label: 'HEX' },
              { value: 'rgb', label: 'RGB' },
              { value: 'hsv', label: 'HSV' },
            ]}
          />
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
          (document.activeElement as HTMLElement | null)?.blur();
        }}
        className="flex gap-2"
      >
        {mode === 'hex' && (
          <input
            value={hexText}
            onFocus={() => setEditing(true)}
            onBlur={submit}
            onChange={(e) => {
              setDirty(true);
              setHexText(e.target.value.toUpperCase());
            }}
            maxLength={7}
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            aria-label="HEX"
            className={`${input} font-mono tracking-wider ${bad ? 'ring-1 ring-[#d4735a]' : ''}`}
          />
        )}
        {mode !== 'hex' &&
          (mode === 'rgb' ? ['R', 'G', 'B'] : ['H°', 'S%', 'V%']).map((label, i) => (
            <label key={label} className="flex-1">
              <span className="mb-1 block text-center text-[11px] font-semibold text-white/40">{label}</span>
              <input
                inputMode="numeric"
                enterKeyHint="done"
                value={(mode === 'rgb' ? rgbText : hsvText)[i]}
                onFocus={() => setEditing(true)}
                onBlur={submit}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
                  setDirty(true);
                  (mode === 'rgb' ? setRgbText : setHsvText)((arr) => arr.map((x, j) => (j === i ? v : x)));
                }}
                className={input}
                aria-label={label}
              />
            </label>
          ))}
        <button type="submit" className="hidden" />
      </form>
      {bad && <p className="mt-2 text-[13px] text-[#e08a73]">Μη έγκυρο HEX — π.χ. #FF7A00</p>}
    </div>
  );
}
