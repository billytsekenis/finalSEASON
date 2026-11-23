import { useEffect, useMemo, useState } from 'react';
import type { EnergyMeterInfo, EnergyResponse } from '../../shared/types';
import { BackIcon, PlugIcon } from '../components/Icons';
import { Section, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { updateData, useApp } from '../lib/store';

const AMBER = '#ffb340';
const fmtKwh = (v: number) => (v < 1 ? `${Math.round(v * 1000)} Wh` : `${v.toFixed(v < 10 ? 2 : 1)} kWh`);
const fmtEur = (v: number) => `${v < 1 ? v.toFixed(2) : v.toFixed(2)} €`;
const fmtW = (v: number) => `${v < 10 ? v.toFixed(1) : Math.round(v)} W`;

export function Energy({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<EnergyResponse | null>(null);
  const [error, setError] = useState('');
  const price = useApp((s) => s.data.kwhPrice) ?? data?.kwhPrice ?? 0.18;

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .energy()
        .then((d) => alive && (setData(d), setError('')))
        .catch((e: Error) => alive && setError(e.message));
    void load();
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const meterW = data?.meters.reduce((s, m) => s + (m.online && m.watts ? m.watts : 0), 0) ?? 0;
  const totalW = meterW + (data?.estimatedTotalW ?? 0);
  const maxEst = Math.max(1, ...(data?.estimates.map((e) => e.ratedW) ?? [1]));

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 pt-3">
        <button onClick={onBack} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 active:bg-white/10" aria-label="Πίσω">
          <BackIcon className="h-6 w-6" />
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">Ενέργεια</h1>
      </header>

      {error && <p className="mt-4 rounded-2xl bg-[#ff453a]/10 px-4 py-3 text-[14px] text-[#ff8a80]">{error}</p>}
      {!data && !error && (
        <div className="grid place-items-center py-32">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {data && (
        <>
          {/* Hero: τρέχουσα ισχύς */}
          <section className="mt-6 rounded-[28px] border border-white/[0.06] bg-[#141416] p-6">
            <p className="text-[13px] font-semibold tracking-wider text-white/45 uppercase">Τώρα</p>
            <p className="mt-1 text-[52px] leading-none font-bold tracking-tight tabular-nums">
              {fmtW(totalW)}
            </p>
            <p className="mt-2 text-[14px] text-white/50">
              {fmtW(meterW)} μετρημένα · {fmtW(data.estimatedTotalW)} εκτίμηση φώτων ·{' '}
              <span className="text-white/70">≈ {fmtEur((totalW / 1000) * 24 * price)}/ημέρα</span>
            </p>
          </section>

          {data.meters.map((m) => (
            <MeterCard key={m.id} meter={m} price={price} />
          ))}

          <Section title="Φώτα · εκτίμηση">
            <div className="overflow-hidden rounded-[22px] bg-white/[0.04]">
              {data.estimates.map((e, i) => (
                <div key={e.id} className={`px-4 py-3 ${i ? 'border-t border-white/[0.05]' : ''}`}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[15px] font-medium">{e.name}</span>
                    <span className="text-[14px] font-semibold tabular-nums text-white/85">{e.watts ? fmtW(e.watts) : '—'}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-3">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(e.watts / maxEst) * 100}%`, background: AMBER }} />
                    </div>
                    <span className="shrink-0 text-right text-[12px] whitespace-nowrap text-white/40">
                      {e.brand} · max {e.ratedW} W
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 px-1 text-[12px] leading-relaxed text-white/35">
              Οι λάμπες δεν αναφέρουν κατανάλωση. Η εκτίμηση βγαίνει από την ονομαστική ισχύ κάθε μοντέλου και τη φωτεινότητα. Μια σβηστή λάμπα
              καταναλώνει ~0,4 W σε αναμονή.
            </p>
          </Section>

          <Section title="Τιμή ρεύματος">
            <PriceInput value={price} />
          </Section>
        </>
      )}
    </div>
  );
}

function MeterCard({ meter, price }: { meter: EnergyMeterInfo; price: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const days = meter.days.slice(-30);
  const max = Math.max(0.001, ...days.map((d) => d.kwh));
  const avg = days.length ? days.reduce((s, d) => s + d.kwh, 0) / days.length : null;
  const picked = sel != null ? days[sel] : null;
  const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('el-GR', { weekday: 'short', day: 'numeric', month: 'short' });

  const stats = useMemo(
    () => [
      { label: 'Τώρα', value: meter.watts != null ? fmtW(meter.watts) : '—', sub: 'μέσος όρος 15′' },
      { label: 'Σήμερα', value: meter.todayKwh != null ? fmtKwh(meter.todayKwh) : '—', sub: meter.todayKwh != null ? fmtEur(meter.todayKwh * price) : 'από τώρα και μετά' },
      { label: 'Μήνας (εκτ.)', value: avg != null ? fmtEur(avg * 30 * price) : meter.watts != null ? fmtEur((meter.watts / 1000) * 24 * 30 * price) : '—', sub: avg != null ? `${fmtKwh(avg)}/ημέρα` : 'με βάση το τώρα' },
    ],
    [meter, price, avg],
  );

  return (
    <Section title={`${meter.name} · πραγματική μέτρηση`}>
      <div className="rounded-[22px] bg-white/[0.04] p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70">
            <PlugIcon className="h-5 w-5" />
          </span>
          <div className="flex-1">
            <div className="text-[15px] font-semibold">
              {meter.name} <span className="font-normal text-white/40">· Tapo {meter.model}</span>
            </div>
            <div className="text-[12px] text-white/40">
              Σύνολο μετρητή {fmtKwh(meter.totalKwh)} · {meter.online ? 'ενημερώθηκε ' + new Date(meter.measuredAt).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' }) : 'εκτός σύνδεσης'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/[0.04] px-3 py-3">
              <div className="text-[11px] font-semibold tracking-wide text-white/45 uppercase">{s.label}</div>
              <div className="mt-1 text-[20px] leading-tight font-bold tabular-nums">{s.value}</div>
              <div className="mt-0.5 text-[11px] text-white/40">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <span className="text-[13px] font-semibold text-white/55">Ανά ημέρα</span>
            <span className="text-[13px] tabular-nums text-white/80">
              {picked ? `${dayLabel(picked.date)} · ${fmtKwh(picked.kwh)} · ${fmtEur(picked.kwh * price)}` : days.length ? `μέγιστο ${fmtKwh(max)}` : ''}
            </span>
          </div>
          {days.length === 0 ? (
            <p className="rounded-2xl bg-white/[0.03] px-4 py-6 text-center text-[13px] leading-relaxed text-white/40">
              Το ιστορικό ξεκινά από σήμερα. Κάθε μέρα καταγράφεται αυτόματα μία ένδειξη, οπότε από αύριο θα βλέπεις κατανάλωση ανά ημέρα.
            </p>
          ) : (
            <div className="flex h-32 items-end gap-[2px]" onPointerLeave={() => setSel(null)} role="img" aria-label="Ημερήσια κατανάλωση">
              {days.map((d, i) => (
                <button
                  key={d.date}
                  onPointerEnter={() => setSel(i)}
                  onClick={() => setSel(i)}
                  className="flex h-full flex-1 items-end"
                  aria-label={`${dayLabel(d.date)}: ${fmtKwh(d.kwh)}`}
                >
                  <span
                    className="w-full rounded-t-[4px] transition-opacity"
                    style={{ height: `${Math.max(2, (d.kwh / max) * 100)}%`, background: AMBER, opacity: sel == null || sel === i ? 1 : 0.35 }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

function PriceInput({ value }: { value: number }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => setText(String(value).replace('.', ',')), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (v > 0 && v < 5) updateData((d) => ({ ...d, kwhPrice: v }));
    else setText(String(value).replace('.', ','));
  };
  return (
    <div className="flex items-center gap-3 rounded-[22px] bg-white/[0.04] p-4">
      <div className="flex-1 text-[14px] leading-snug text-white/55">Από τον λογαριασμό ρεύματος (με χρεώσεις & ΦΠΑ). Χρησιμοποιείται για τα ποσά σε €.</div>
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.07] px-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          enterKeyHint="done"
          className="h-11 w-16 bg-transparent text-right text-[16px] font-semibold tabular-nums outline-none"
          aria-label="Τιμή €/kWh"
        />
        <span className="text-[14px] text-white/45">€/kWh</span>
      </div>
    </div>
  );
}
