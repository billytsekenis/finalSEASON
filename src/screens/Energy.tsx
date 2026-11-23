import { useEffect, useMemo, useState } from 'react';
import type { EnergyDevice, EnergyResponse } from '../../shared/types';
import { BackIcon, ChevronIcon } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Section, Segmented, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { updateData, useApp } from '../lib/store';

type Period = 'today' | 'd7' | 'd30' | 'all';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Σήμερα' },
  { value: 'd7', label: '7 ημ.' },
  { value: 'd30', label: '30 ημ.' },
  { value: 'all', label: 'Σύνολο' },
];

const OCHRE = '#c9a26b';
const SAGE = '#9aab7a';

const fmtKwh = (v: number) => (v < 1 ? `${Math.round(v * 1000)} Wh` : `${v.toFixed(v < 10 ? 2 : 1)} kWh`);
const fmtEur = (v: number) => (v > 0 && v < 0.01 ? '< 0,01 €' : `${v.toFixed(2).replace('.', ',')} €`);
const fmtW = (v: number) => `${v < 10 ? v.toFixed(1).replace('.', ',') : Math.round(v)} W`;
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('el-GR', { day: 'numeric', month: 'short' });

export function Energy({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<EnergyResponse | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<Period>('today');
  const [openId, setOpenId] = useState<string | null>(null);
  const storedPrice = useApp((s) => s.data.kwhPrice);
  const price = storedPrice ?? data?.kwhPrice ?? 0.15;

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

  const totals = useMemo(() => {
    if (!data) return null;
    const total = data.devices.reduce((s, d) => s + d.kwh[period], 0);
    const measured = data.devices.filter((d) => d.source === 'meter').reduce((s, d) => s + d.kwh[period], 0);
    return { total, measured, estimated: total - measured };
  }, [data, period]);

  const open = data?.devices.find((d) => d.id === openId) ?? null;
  const maxShare = Math.max(0.000001, ...(data?.devices.map((d) => d.kwh[period]) ?? [0]));

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 pt-3">
        <button onClick={onBack} className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-white/80 active:bg-white/10" aria-label="Πίσω">
          <BackIcon className="h-5 w-5" />
        </button>
        <h1 className="text-[24px] font-bold tracking-tight">Ενέργεια</h1>
      </header>

      {error && <p className="mt-4 rounded-2xl bg-[#c9735c]/10 px-4 py-3 text-[14px] text-[#e8957f]">{error}</p>}
      {!data && !error && (
        <div className="grid place-items-center py-32">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {data && totals && (
        <>
          <div className="mt-4">
            <Segmented value={period} onChange={setPeriod} options={PERIODS} />
          </div>

          {/* Συγκεντρωτικά */}
          <section className="mt-3 rounded-[18px] bg-[#181a16] p-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">{PERIODS.find((p) => p.value === period)!.label === 'Σύνολο' ? 'Έως τώρα' : PERIODS.find((p) => p.value === period)!.label}</p>
                <p className="mt-1 text-[32px] leading-none font-bold tracking-tight tabular-nums">{fmtEur(totals.total * price)}</p>
                <p className="mt-1.5 text-[13px] text-white/55 tabular-nums">{fmtKwh(totals.total)}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-semibold tracking-wider text-white/45 uppercase">Τώρα</p>
                <p className="mt-1 text-[20px] leading-none font-semibold tabular-nums">{fmtW(data.nowW)}</p>
                <p className="mt-1.5 text-[12px] text-white/45 tabular-nums">≈ {fmtEur((data.nowW / 1000) * 24 * 30 * price)}/μήνα</p>
              </div>
            </div>
            {totals.total > 0 && (
              <>
                <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div style={{ width: `${(totals.measured / totals.total) * 100}%`, background: OCHRE }} />
                  <div className="ml-[2px]" style={{ width: `${(totals.estimated / totals.total) * 100}%`, background: SAGE }} />
                </div>
                <div className="mt-2 flex gap-4 text-[11px] text-white/55">
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: OCHRE }} /> Μετρημένα · {fmtKwh(totals.measured)}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: SAGE }} /> Φώτα (εκτίμηση) · {fmtKwh(totals.estimated)}
                  </span>
                </div>
              </>
            )}
          </section>

          {/* Ανά συσκευή */}
          <Section title="Ανά συσκευή">
            <div className="overflow-hidden rounded-[18px] bg-[#181a16]">
              {data.devices.map((d, i) => {
                const v = d.kwh[period];
                return (
                  <button
                    key={d.id}
                    onClick={() => setOpenId(d.id)}
                    className={`flex w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-white/[0.04] ${i ? 'border-t border-white/[0.04]' : ''}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.source === 'meter' ? OCHRE : SAGE, opacity: d.online ? 1 : 0.35 }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[14px] font-medium">{d.name}</span>
                        <span className="shrink-0 text-[13px] font-semibold tabular-nums">{fmtEur(v * price)}</span>
                      </span>
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <span className="block h-full rounded-full" style={{ width: `${(v / maxShare) * 100}%`, background: d.source === 'meter' ? OCHRE : SAGE }} />
                        </span>
                        <span className="w-16 shrink-0 text-right text-[11px] text-white/45 tabular-nums">{fmtKwh(v)}</span>
                      </span>
                    </span>
                    <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-white/25" />
                  </button>
                );
              })}
            </div>
            <p className="mt-2 px-1 text-[11px] leading-relaxed text-white/35">
              <span style={{ color: OCHRE }}>●</span> πραγματική μέτρηση · <span style={{ color: SAGE }}>●</span> εκτίμηση από ονομαστικά Watt και φωτεινότητα.
              Η καταγραφή των φώτων ξεκίνησε {dayLabel(data.trackingSince)}.
            </p>
          </Section>

          <Section title="Τιμή ρεύματος">
            <PriceInput value={price} />
          </Section>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name} subtitle={open ? `${open.brand}${open.model ? ` ${open.model}` : ''} · ${open.source === 'meter' ? 'πραγματική μέτρηση' : 'εκτίμηση'}` : ''}>
        {open && <DeviceDetail d={open} price={price} />}
      </Sheet>
    </div>
  );
}

function DeviceDetail({ d, price }: { d: EnergyDevice; price: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const color = d.source === 'meter' ? OCHRE : SAGE;
  const max = Math.max(0.0001, ...d.days.map((x) => x.kwh));
  const picked = sel != null ? d.days[sel] : null;
  const stats = [
    { label: 'Τώρα', value: fmtW(d.nowW), sub: d.ratedW ? `max ${fmtW(d.ratedW)}` : d.online ? 'μέσος όρος 15′' : 'offline' },
    { label: 'Σήμερα', value: fmtEur(d.kwh.today * price), sub: fmtKwh(d.kwh.today) },
    { label: '30 ημέρες', value: fmtEur(d.kwh.d30 * price), sub: fmtKwh(d.kwh.d30) },
    { label: 'Έως τώρα', value: fmtEur(d.kwh.all * price), sub: fmtKwh(d.kwh.all) },
  ];
  return (
    <div className="space-y-5 pb-4">
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-[14px] bg-white/[0.04] px-3 py-2.5">
            <div className="text-[10px] font-semibold tracking-wider text-white/45 uppercase">{s.label}</div>
            <div className="mt-0.5 text-[18px] font-bold tabular-nums">{s.value}</div>
            <div className="text-[11px] text-white/45 tabular-nums">{s.sub}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <span className="text-[12px] font-semibold text-white/55">Ανά ημέρα · 30 ημέρες</span>
          <span className="text-[12px] text-white/80 tabular-nums">
            {picked ? `${dayLabel(picked.date)} · ${fmtKwh(picked.kwh)} · ${fmtEur(picked.kwh * price)}` : `μέγιστο ${fmtKwh(max)}`}
          </span>
        </div>
        <div className="flex h-28 items-end gap-[2px]" onPointerLeave={() => setSel(null)} role="img" aria-label="Κατανάλωση ανά ημέρα">
          {d.days.map((x, i) => (
            <button key={x.date} onPointerEnter={() => setSel(i)} onClick={() => setSel(i)} className="flex h-full flex-1 items-end" aria-label={`${dayLabel(x.date)}: ${fmtKwh(x.kwh)}`}>
              <span
                className="w-full rounded-t-[3px]"
                style={{ height: x.kwh > 0 ? `${Math.max(3, (x.kwh / max) * 100)}%` : '2px', background: x.kwh > 0 ? color : 'rgba(235,231,222,0.08)', opacity: sel == null || sel === i ? 1 : 0.4 }}
              />
            </button>
          ))}
        </div>
        <div className="mt-1 flex justify-between px-0.5 text-[10px] text-white/35">
          <span>{dayLabel(d.days[0]!.date)}</span>
          <span>σήμερα</span>
        </div>
      </div>

      <p className="rounded-[14px] bg-white/[0.03] px-3 py-2.5 text-[12px] leading-relaxed text-white/45">
        {d.source === 'meter'
          ? `Πραγματικές μετρήσεις από την πρίζα. «Έως τώρα» = ${d.lifetimeLabel.toLowerCase()}. Το ιστορικό ανά ημέρα γράφεται από ${dayLabel(d.trackedSince)}.`
          : `Εκτίμηση: ${d.ratedW} W στο 100%, ανάλογα με τη φωτεινότητα, ~0,4 W όταν είναι σβηστή. Καταγραφή από ${dayLabel(d.trackedSince)}.`}
      </p>
    </div>
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
    <div className="flex items-center gap-3 rounded-[18px] bg-[#181a16] p-3.5">
      <div className="flex-1 text-[13px] leading-snug text-white/55">Τιμή κιλοβατώρας με όλες τις χρεώσεις.</div>
      <div className="flex items-center gap-1 rounded-xl bg-white/[0.06] px-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value.replace(/[^\d.,]/g, '').slice(0, 6))}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          inputMode="decimal"
          enterKeyHint="done"
          className="h-10 w-14 bg-transparent text-right text-[15px] font-semibold tabular-nums outline-none"
          aria-label="Τιμή €/kWh"
        />
        <span className="text-[13px] text-white/45">€/kWh</span>
      </div>
    </div>
  );
}
