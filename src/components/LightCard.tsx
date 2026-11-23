import type { Light } from '../../shared/types';
import { lightRgb, rgba, rgbCss } from '../lib/color';
import { setPower } from '../lib/store';
import { KindIcon, PowerIcon } from './Icons';

/** Μικρή, μίνιμαλ κάρτα (3 ανά σειρά). Πάτημα στο εικονίδιο: on/off · πάτημα στην κάρτα: έλεγχος. */
export function LightCard({ light, onOpen }: { light: Light; onOpen: () => void }) {
  const rgb = lightRgb(light);
  const lit = light.on && light.online;
  const status = !light.online ? 'Offline' : !light.on ? 'Σβηστή' : light.caps.brightness ? `${light.brightness}%` : 'Αναμμένη';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
      className="relative flex aspect-square flex-col justify-between overflow-hidden rounded-[18px] p-2.5 text-left transition-[transform,background-color] duration-300 active:scale-[0.96]"
      style={{
        background: lit ? `linear-gradient(160deg, ${rgba(rgb, 0.16)}, transparent 65%), #1c1e19` : '#181a16',
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
          className="grid h-8 w-8 place-items-center rounded-full transition-colors duration-300 active:scale-90 disabled:opacity-40"
          style={{
            background: lit ? rgbCss(rgb) : 'rgba(235,231,222,0.07)',
            color: lit ? 'rgba(18,20,16,0.8)' : 'rgba(235,231,222,0.55)',
          }}
        >
          {lit ? <KindIcon kind={light.kind} className="h-4 w-4" /> : <PowerIcon className="h-[15px] w-[15px]" />}
        </button>
        {!light.online && <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#c9735c]" title="Εκτός σύνδεσης" />}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[13px] leading-tight font-semibold">{light.name}</div>
        <div className={`mt-0.5 text-[11px] tabular-nums ${!light.online ? 'text-[#d38b77]' : lit ? 'text-white/65' : 'text-white/40'}`}>{status}</div>
      </div>
      {lit && light.caps.brightness && (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.05]">
          <div className="h-full transition-all duration-500" style={{ width: `${light.brightness}%`, background: rgbCss(rgb) }} />
        </div>
      )}
    </div>
  );
}
