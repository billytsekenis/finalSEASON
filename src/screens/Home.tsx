import { useMemo, useState } from 'react';
import type { Light, Scene } from '../../shared/types';
import { EditIcon, GearIcon, PlusIcon, SparkIcon, WifiOffIcon } from '../components/Icons';
import { LightCard } from '../components/LightCard';
import { LightSheet } from '../components/LightSheet';
import { Spinner } from '../components/ui';
import { lightRgb, rgbCss } from '../lib/color';
import { applyScene, sceneGradient } from '../lib/scenes';
import { averageBrightness, refreshLights, scaleBrightness, setPower, setWhiteAll, useApp } from '../lib/store';
import { Slider } from '../components/Slider';
import { SunIcon } from '../components/Icons';
import { GroupEditor } from './GroupEditor';
import { SceneEditor } from './SceneEditor';

type Filter = { kind: 'all' } | { kind: 'room'; name: string } | { kind: 'group'; id: string };

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Καληνύχτα';
  if (h < 12) return 'Καλημέρα';
  if (h < 18) return 'Καλό απόγευμα';
  return 'Καλησπέρα';
}

export function Home({ onSettings, onEnergy }: { onSettings: () => void; onEnergy: () => void }) {
  const lights = useApp((s) => s.lights);
  const loaded = useApp((s) => s.lightsLoaded);
  const error = useApp((s) => s.lightsError);
  const stale = useApp((s) => s.stale);
  const providers = useApp((s) => s.providers);
  const { scenes, groups } = useApp((s) => s.data);

  const [filter, setFilter] = useState<Filter>({ kind: 'all' });
  const [sheet, setSheet] = useState<{ ids: string[]; title?: string } | null>(null);
  const [sceneEdit, setSceneEdit] = useState<Scene | 'new' | null>(null);
  const [groupEdit, setGroupEdit] = useState<string | 'new' | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const rooms = useMemo(() => [...new Set(lights.map((l) => l.room).filter((r): r is string => !!r))], [lights]);
  const showRooms = rooms.length > 1;

  const visible: Light[] = useMemo(() => {
    let list = lights;
    if (filter.kind === 'room') list = lights.filter((l) => l.room === filter.name);
    if (filter.kind === 'group') {
      const g = groups.find((x) => x.id === filter.id);
      if (g) list = lights.filter((l) => g.lightIds.includes(l.id));
    }
    // Αναμμένες πρώτα, μετά οι διαθέσιμες, οι offline στο τέλος.
    const rank = (l: Light) => (!l.online ? 2 : l.on ? 0 : 1);
    return [...list].sort((a, b) => rank(a) - rank(b));
  }, [lights, filter, groups]);

  const onCount = lights.filter((l) => l.on && l.online).length;
  const visibleOn = visible.filter((l) => l.on && l.online);
  const filterTitle =
    filter.kind === 'all' ? 'Όλα τα φώτα' : filter.kind === 'room' ? filter.name : (groups.find((g) => g.id === filter.id)?.name ?? 'Ομάδα');
  const notConnected = providers.length > 0 && providers.every((p) => !p.connected);
  const providerError = providers.find((p) => p.error)?.error;

  const ambient = visibleOn[0] ? rgbCss(lightRgb(visibleOn[0])) : null;

  return (
    <div className="relative mx-auto min-h-dvh max-w-3xl px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(32px,env(safe-area-inset-bottom))]">
      {/* Διακριτική ατμοσφαιρική λάμψη από τα αναμμένα φώτα */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[320px] opacity-20 transition-[background] duration-1000"
        style={{ background: ambient ? `radial-gradient(70% 60% at 50% 0%, ${ambient}55, transparent 75%)` : 'none' }}
      />

      <header className="relative flex items-start justify-between pt-3">
        <div>
          <p className="text-[13px] font-medium text-white/45">{greeting()}</p>
          <h1 className="mt-0.5 text-[24px] leading-tight font-bold tracking-tight">Φώτα</h1>
          <p className="mt-0.5 text-[13px] text-white/50">
            {loaded ? (onCount ? `${onCount} από ${lights.length} αναμμένα` : lights.length ? 'Όλα σβηστά' : ' ') : 'Φόρτωση…'}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={async () => {
              setRefreshing(true);
              await refreshLights();
              setRefreshing(false);
            }}
            className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95"
            aria-label="Ανανέωση"
          >
            {refreshing ? <Spinner className="h-4 w-4" /> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>}
          </button>
          <button onClick={onEnergy} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95" aria-label="Ενέργεια">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
          </button>
          <button onClick={onSettings} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95" aria-label="Ρυθμίσεις">
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {(error || stale || providerError) && (
        <div className="relative mt-5 flex items-start gap-3 rounded-2xl bg-[#b08a5a]/10 px-4 py-3 text-[14px] text-[#e8c79a]">
          <WifiOffIcon className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error ?? providerError ?? 'Το SmartThings περιόρισε προσωρινά τα αιτήματα — εμφανίζεται η τελευταία γνωστή κατάσταση.'}</span>
        </div>
      )}

      {!loaded ? (
        <div className="grid place-items-center py-32">
          <Spinner className="h-8 w-8" />
        </div>
      ) : notConnected && lights.length === 0 ? (
        <div className="relative mt-16 rounded-[28px] bg-white/[0.04] p-8 text-center">
          <SparkIcon className="mx-auto h-10 w-10 text-white/60" />
          <h2 className="mt-4 text-[20px] font-semibold">Σύνδεσε τις λάμπες σου</h2>
          <p className="mx-auto mt-2 max-w-sm text-[15px] text-white/55">
            Χρειάζεται μία φορά σύνδεση με το SmartThings, όπου είναι ήδη οι λάμπες Tapo.
          </p>
          <button onClick={onEnergy} className="grid h-10 w-10 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95" aria-label="Ενέργεια">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
          </button>
          <button onClick={onSettings} className="mt-6 h-12 rounded-2xl bg-white px-6 text-[15px] font-semibold text-black active:scale-95">
            Σύνδεση
          </button>
        </div>
      ) : (
        <>
          {/* Συνολικός έλεγχος */}
          <section className="relative mt-4 rounded-[18px] bg-[#181a16] p-2 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setPower(visible.map((l) => l.id), visibleOn.length === 0)}
                className="flex h-10 flex-1 items-center gap-2.5 rounded-[14px] px-1.5 text-left transition active:scale-[0.98]"
              >
                <span
                  className="grid h-8 w-8 place-items-center rounded-full text-[14px] transition-all"
                  style={{ background: visibleOn.length ? '#ebe7de' : 'rgba(235,231,222,0.1)', color: visibleOn.length ? '#121410' : '#ebe7de' }}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
                </span>
                <span>
                  <span className="block text-[14px] font-semibold">{filterTitle}</span>
                  <span className="block text-[11px] text-white/45">{visibleOn.length ? `${visibleOn.length} αναμμένα` : 'Πάτα για άναμμα'}</span>
                </span>
              </button>
              <button
                onClick={() => setSheet({ ids: visible.filter((l) => l.kind !== 'plug').map((l) => l.id), title: filterTitle })}
                className="h-9 rounded-[12px] px-3.5 text-[13px] font-semibold text-black transition active:scale-95"
                style={{ background: 'conic-gradient(from 200deg, #d98b6a, #e3b87a, #a9b98a, #8fb3b0, #a893b8, #d98b6a)' }}
              >
                Χρώμα
              </button>
            </div>
            {visibleOn.some((l) => l.caps.brightness) && (
              <div className="mt-2 space-y-2.5 px-1 pb-1">
                <MasterDimmer ids={visible.map((l) => l.id)} />
                <div className="grid grid-cols-4 gap-2">
                  {WHITES.map((w) => (
                    <button
                      key={w.k}
                      onClick={() => setWhiteAll(visible.map((l) => l.id), w.k, w.label)}
                      className="flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-white/[0.05] text-[12px] font-medium text-white/80 transition active:scale-95"
                    >
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: w.color }} />
                      {w.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Σκηνές */}
          <section className="relative mt-5">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-[15px] font-semibold tracking-tight">Σκηνές</h2>
              <button onClick={() => setSceneEdit('new')} className="flex items-center gap-1 text-[14px] font-medium text-white/60 active:opacity-60">
                <PlusIcon className="h-4 w-4" /> Νέα
              </button>
            </div>
            <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
              {scenes.length === 0 && (
                <button
                  onClick={() => setSceneEdit('new')}
                  className="flex h-[60px] w-full items-center justify-center rounded-[14px] border border-dashed border-white/15 text-[15px] text-white/50"
                >
                  Δημιούργησε την πρώτη σου σκηνή
                </button>
              )}
              {scenes.map((s) => (
                <div key={s.id} className="relative shrink-0">
                  <button
                    onClick={() => applyScene(s, lights)}
                    className="flex h-[60px] w-[104px] flex-col justify-end overflow-hidden rounded-[14px] p-2.5 text-left transition active:scale-95"
                    style={{ background: sceneGradient(s) }}
                  >
                    <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <span className="relative text-[12px] leading-tight font-semibold drop-shadow">{s.name}</span>
                    
                  </button>
                  <button
                    onClick={() => setSceneEdit(s)}
                    className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-black/30 text-white/85 backdrop-blur active:scale-90"
                    aria-label={`Επεξεργασία ${s.name}`}
                  >
                    <EditIcon className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Φίλτρα: δωμάτια και ομάδες */}
          <div className="relative -mx-5 mt-4 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none]">
            <Chip active={filter.kind === 'all'} onClick={() => setFilter({ kind: 'all' })}>
              Όλα
            </Chip>
            {showRooms &&
              rooms.map((r) => (
                <Chip key={r} active={filter.kind === 'room' && filter.name === r} onClick={() => setFilter({ kind: 'room', name: r })}>
                  {r}
                </Chip>
              ))}
            {groups.map((g) => (
              <Chip
                key={g.id}
                active={filter.kind === 'group' && filter.id === g.id}
                onClick={() => (filter.kind === 'group' && filter.id === g.id ? setGroupEdit(g.id) : setFilter({ kind: 'group', id: g.id }))}
              >
                {g.name}
              </Chip>
            ))}
            <Chip onClick={() => setGroupEdit('new')}>
              <PlusIcon className="h-4 w-4" /> Ομάδα
            </Chip>
          </div>
          {filter.kind === 'group' && <p className="relative mt-2 px-1 text-[12px] text-white/35">Πάτα ξανά την ομάδα για επεξεργασία</p>}

          {/* Λάμπες */}
          <section className="relative mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {visible.map((l) => (
              <LightCard key={l.id} light={l} onOpen={() => setSheet({ ids: [l.id] })} />
            ))}
            {visible.length === 0 && <p className="col-span-full py-10 text-center text-white/45">Δεν υπάρχουν λάμπες εδώ.</p>}
          </section>
        </>
      )}

      <LightSheet ids={sheet?.ids ?? null} title={sheet?.title} onClose={() => setSheet(null)} />
      <SceneEditor scene={sceneEdit} onClose={() => setSceneEdit(null)} />
      <GroupEditor
        groupId={groupEdit}
        onClose={(deleted) => {
          if (deleted) setFilter({ kind: 'all' });
          setGroupEdit(null);
        }}
      />
    </div>
  );
}

const WHITES = [
  { k: 2500, label: 'Κερί', color: '#ffb25e' },
  { k: 2800, label: 'Ζεστό', color: '#ffc78a' },
  { k: 4000, label: 'Φυσικό', color: '#ffe4cc' },
  { k: 5500, label: 'Ημέρα', color: '#f4f1ff' },
];

/** Συνολική ένταση: αναλογική αλλαγή σε όλα τα αναμμένα φώτα της επιλογής. */
function MasterDimmer({ ids }: { ids: string[] }) {
  useApp((s) => s.lights);
  const avg = averageBrightness(ids);
  const [drag, setDrag] = useState<number | null>(null);
  return (
    <Slider
      label="Ένταση όλων"
      value={drag ?? avg}
      min={1}
      max={100}
      format={(v) => `${Math.round(v)}%`}
      icon={<SunIcon className="h-5 w-5" />}
      fillColor="rgba(235,231,222,0.88)"
      onChange={(v) => {
        setDrag(v);
        scaleBrightness(ids, v, false);
      }}
      onCommit={(v) => {
        scaleBrightness(ids, v, true);
        setDrag(null);
      }}
    />
  );
}

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-full px-3 text-[12px] font-semibold transition active:scale-95 ${
        active ? 'bg-white text-black' : 'bg-white/[0.08] text-white/75'
      }`}
    >
      {children}
    </button>
  );
}
