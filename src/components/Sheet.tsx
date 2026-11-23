import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from './Icons';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Χρώμα για τη διακριτική λάμψη στο πάνω μέρος */
  glow?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  headerRight?: ReactNode;
}

/** Bottom sheet τύπου iOS με ομαλή είσοδο/έξοδο και κλείσιμο με σύρσιμο προς τα κάτω. */
export function Sheet({ open, onClose, children, glow, title, subtitle, headerRight }: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const start = useRef<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      document.body.style.overflow = 'hidden';
    } else if (mounted) {
      setVisible(false);
      const t = setTimeout(() => setMounted(false), 320);
      document.body.style.overflow = '';
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  useEffect(() => () => void (document.body.style.overflow = ''), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  const onHandleDown = (e: React.PointerEvent) => {
    start.current = e.clientY;
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (start.current == null) return;
    setDragY(Math.max(0, e.clientY - start.current));
  };
  const onHandleUp = () => {
    if (start.current == null) return;
    start.current = null;
    if (dragY > 110) onClose();
    setDragY(0);
  };

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300"
        style={{ opacity: visible ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[94dvh] max-w-xl flex-col overflow-hidden rounded-t-[32px] border-t border-white/[0.07] bg-[#121214] shadow-[0_-20px_60px_rgba(0,0,0,0.6)]"
        style={{
          transform: visible ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: start.current != null ? 'none' : 'transform 340ms cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        {glow && (
          <div
            className="pointer-events-none absolute inset-x-0 -top-24 h-64 opacity-60 transition-[background] duration-500"
            style={{ background: `radial-gradient(60% 70% at 50% 0%, ${glow}, transparent 70%)` }}
          />
        )}
        <div
          className="relative shrink-0 touch-none px-6 pt-3 pb-2"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-white/25" />
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {title && <h2 className="truncate text-[22px] font-semibold tracking-tight">{title}</h2>}
              {subtitle && <p className="truncate text-[14px] text-white/50">{subtitle}</p>}
            </div>
            <div onPointerDown={(e) => e.stopPropagation()} className="flex items-center gap-2">
              {headerRight}
              <button
                onClick={onClose}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white/70 active:scale-95"
                aria-label="Κλείσιμο"
              >
                <CloseIcon className="h-[18px] w-[18px]" />
              </button>
            </div>
          </div>
        </div>
        <div ref={scroller} className="relative flex-1 overflow-y-auto overscroll-contain px-6 pt-2 pb-[max(28px,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
