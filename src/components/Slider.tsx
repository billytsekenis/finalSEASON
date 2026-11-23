import { useRef, useState, type ReactNode } from 'react';

interface Props {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  /** 'fill': γεμίζει από αριστερά (φωτεινότητα) · 'thumb': gradient με λαβή (θερμοκρασία, κορεσμός) */
  variant?: 'fill' | 'thumb';
  /** CSS background της μπάρας */
  track?: string;
  fillColor?: string;
  label: string;
  icon?: ReactNode;
  format?: (v: number) => string;
  disabled?: boolean;
}

/** Μεγάλος slider τύπου iOS, φιλικός στο δάχτυλο. */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  variant = 'fill',
  track,
  fillColor = 'rgba(243,234,221,0.92)',
  label,
  icon,
  format = (v) => `${Math.round(v)}`,
  disabled,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef(value);
  const pct = ((value - min) / (max - min)) * 100;

  const fromEvent = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const raw = min + t * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    const v = fromEvent(e.clientX);
    last.current = v;
    onChange(v);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const v = fromEvent(e.clientX);
    if (v !== last.current) {
      last.current = v;
      onChange(v);
    }
  };
  const onUp = () => {
    if (!dragging) return;
    setDragging(false);
    onCommit?.(last.current);
  };

  const onKey = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    e.preventDefault();
    const v = Math.min(max, Math.max(min, value + delta * (e.shiftKey ? 10 : 1)));
    onChange(v);
    onCommit?.(v);
  };

  return (
    <div className={disabled ? 'opacity-40' : ''}>
      <div className="mb-1.5 flex items-baseline justify-between px-1 text-[12px]">
        <span className="font-medium tracking-wide text-white/55 uppercase">{label}</span>
        <span className="font-semibold tabular-nums text-white/90">{format(value)}</span>
      </div>
      <div
        ref={ref}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(value)}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
        className={`relative h-11 touch-none overflow-hidden rounded-[14px] select-none transition-transform duration-200 ${
          dragging ? 'scale-[1.015]' : ''
        }`}
        style={{ background: track ?? 'rgba(243,234,221,0.07)' }}
      >
        {variant === 'fill' && (
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${pct}%`, background: fillColor, transition: dragging ? 'none' : 'width 180ms ease' }}
          />
        )}
        {icon && variant === 'fill' && (
          <div className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-black/55 mix-blend-difference">
            <span className="text-white/80">{icon}</span>
          </div>
        )}
        {variant === 'thumb' && (
          <div
            className="pointer-events-none absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_2px_10px_rgba(0,0,0,0.45)]"
            style={{
              left: `clamp(18px, ${pct}%, calc(100% - 18px))`,
              background: fillColor,
              transition: dragging ? 'none' : 'left 180ms ease',
            }}
          />
        )}
      </div>
    </div>
  );
}
