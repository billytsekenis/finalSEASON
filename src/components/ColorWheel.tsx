import { useRef, useState } from 'react';
import { hsvToHex } from '../lib/color';

interface Props {
  hue: number;
  saturation: number;
  onChange: (h: number, s: number) => void;
  onCommit?: (h: number, s: number) => void;
  size: number;
  disabled?: boolean;
}

/**
 * Πλήρης τροχός HSV: γωνία = απόχρωση (hue), απόσταση από το κέντρο = κορεσμός.
 * Η φωτεινότητα (V) ελέγχεται ξεχωριστά, γιατί στις λάμπες αντιστοιχεί στη φωτεινότητα της λάμπας.
 * Δεν υπάρχει καμία προκαθορισμένη παλέτα: κάθε σημείο του τροχού είναι επιλέξιμο.
 */
export function ColorWheel({ hue, saturation, onChange, onCommit, size, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const last = useRef({ h: hue, s: saturation });

  const R = size / 2;
  const angle = (hue * Math.PI) / 180;
  const dist = (saturation / 100) * R;
  const kx = R + Math.sin(angle) * dist;
  const ky = R - Math.cos(angle) * dist;

  const fromEvent = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let h = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (h < 0) h += 360;
    const s = Math.min(1, Math.hypot(dx, dy) / (r.width / 2)) * 100;
    return { h: Math.round(h * 10) / 10, s: Math.round(s * 10) / 10 };
  };

  const down = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(true);
    const v = fromEvent(e);
    last.current = v;
    onChange(v.h, v.s);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging) return;
    const v = fromEvent(e);
    last.current = v;
    onChange(v.h, v.s);
  };
  const up = () => {
    if (!dragging) return;
    setDragging(false);
    onCommit?.(last.current.h, last.current.s);
  };

  const color = hsvToHex({ h: hue, s: saturation, v: 100 });
  const knob = dragging ? 46 : 36;

  return (
    <div
      ref={ref}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={`relative touch-none rounded-full select-none ${disabled ? 'opacity-40' : ''}`}
      style={{ width: size, height: size }}
      role="application"
      aria-label="Τροχός χρωμάτων"
    >
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle closest-side, #fff 0%, rgba(255,255,255,0) 100%), conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
          boxShadow: `0 0 80px -10px ${color}88, inset 0 0 0 1px rgba(243,234,221,0.07)`,
          transition: 'box-shadow 300ms ease',
        }}
      />
      <div
        className="pointer-events-none absolute rounded-full border-[3px] border-white"
        style={{
          width: knob,
          height: knob,
          left: kx - knob / 2,
          top: ky - knob / 2,
          background: color,
          boxShadow: '0 4px 16px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.12)',
          transition: dragging ? 'width 120ms, height 120ms, left 0ms, top 0ms' : 'all 200ms ease',
        }}
      />
    </div>
  );
}
