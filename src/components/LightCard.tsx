import type { Light } from '../../shared/types';
import { lightRgb, rgba, rgbCss } from '../lib/color';
import { setPower } from '../lib/store';
import { KindIcon, PowerIcon } from './Icons';

const KIND_LABEL: Record<Light['kind'], string> = { bulb: 'Λάμπα', strip: 'Ταινία LED', spot: 'Σποτ', plug: 'Πρίζα' };

export function LightCard({ light, onOpen }: { light: Light; onOpen: () => void }) {
  const rgb = lightRgb(light);
  const lit = light.on && light.online;
  const level = light.caps.brightness ? light.brightness : 100;
  // Η λάμψη της κάρτας ακολουθεί χρώμα και φωτεινότητα της λάμπας.
  const glowAlpha = lit ? 0.18 + (level / 100) * 0.32 : 0;

  const status = !light.online ? 'Εκτός σύνδεσης' : !light.on ? 'Σβηστή' : light.caps.brightness ? `${light.brightness}%` : 'Αναμμένη';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="group relative flex aspect-[1/0.92] flex-col justify-between overflow-hidden rounded-[26px] border p-4 text-left transition-[transform,border-color,background-color] duration-300 active:scale-[0.97]"
      style={{
        background: lit ? `radial-gradient(120% 90% at 20% 0%, ${rgba(rgb, glowAlpha)}, transparent 70%), #17171a` : '#141416',
        borderColor: lit ? rgba(rgb, 0.28) : 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setPower([light.id], !light.on);
          }}
          disabled={!light.online}
          aria-label={light.on ? `Σβήσιμο ${light.name}` : `Άναμμα ${light.name}`}
          className="grid h-12 w-12 place-items-center rounded-full transition-all duration-300 active:scale-90 disabled:opacity-40"
          style={{
            background: lit ? rgbCss(rgb) : 'rgba(255,255,255,0.08)',
            color: lit ? 'rgba(0,0,0,0.72)' : 'rgba(255,255,255,0.6)',
            boxShadow: lit ? `0 0 28px ${rgba(rgb, 0.55)}` : 'none',
          }}
        >
          {lit ? <KindIcon kind={light.kind} className="h-6 w-6" /> : <PowerIcon className="h-[22px] w-[22px]" />}
        </button>
        <span
          className={`mt-1 h-2 w-2 rounded-full ${light.online ? 'bg-[#34c759]' : 'bg-[#ff453a]'}`}
          title={light.online ? 'Συνδεδεμένη' : 'Εκτός σύνδεσης'}
        />
      </div>
      <div>
        <div className="truncate text-[16px] leading-tight font-semibold">{light.name}</div>
        <div className="mt-0.5 truncate text-[13px] text-white/45">
          {light.brand} · {KIND_LABEL[light.kind]}
        </div>
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: lit ? `${level}%` : '0%', background: rgbCss(rgb) }}
            />
          </div>
          <span className={`text-[12px] font-medium tabular-nums ${light.online ? 'text-white/60' : 'text-[#ff6961]'}`}>{status}</span>
        </div>
      </div>
    </div>
  );
}
