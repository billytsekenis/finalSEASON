import type { ReactNode } from 'react';
import { useApp } from '../lib/store';

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
}) {
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  return (
    <div className="relative grid rounded-[14px] bg-white/[0.07] p-1" style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}>
      <div
        className="absolute top-1 bottom-1 rounded-[11px] bg-white/[0.16] shadow-[0_2px_8px_rgba(0,0,0,0.3)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ width: `calc((100% - 8px) / ${options.length})`, left: 4, transform: `translateX(${idx * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`relative z-10 h-9 text-[14px] font-semibold transition-colors disabled:opacity-30 ${
            o.value === value ? 'text-white' : 'text-white/55'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${checked ? 'bg-[#34c759]' : 'bg-white/[0.16]'}`}
    >
      <span
        className="absolute top-[2px] left-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.25)] transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]"
        style={{ transform: checked ? 'translateX(20px)' : 'none' }}
      />
    </button>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-[13px] font-semibold tracking-wider text-white/45 uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  tone = 'default',
  disabled,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  const tones = {
    default: 'bg-white/[0.09] text-white',
    primary: 'bg-white text-black',
    danger: 'bg-[#ff453a]/15 text-[#ff6961]',
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`h-12 rounded-2xl px-5 text-[15px] font-semibold transition active:scale-[0.97] disabled:opacity-40 ${tones[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function ToastHost() {
  const t = useApp((s) => s.toast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(20px,env(safe-area-inset-bottom))] z-[60] flex justify-center px-6">
      {t && (
        <div
          key={t.id}
          role="status"
          className={`animate-toast flex max-w-md items-center rounded-2xl px-4 py-3 text-center text-[14px] font-medium shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl ${
            t.tone === 'error' ? 'bg-[#3a1614]/90 text-[#ffb4ae]' : 'bg-[#2a2a2e]/90 text-white'
          }`}
        >
          <span>{t.message}</span>
          {t.action && (
            <button onClick={t.action.run} className="pointer-events-auto ml-3 rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold text-white active:scale-95">
              {t.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-white/20 border-t-white/80 ${className}`} />;
}
