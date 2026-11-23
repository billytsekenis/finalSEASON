import { useMemo, useState } from 'react';
import type { Light, Scene } from '../../shared/types';
import { EditIcon, GearIcon, PlusIcon, SparkIcon, WifiOffIcon } from '../components/Icons';
import { LightCard } from '../components/LightCard';
import { LightSheet } from '../components/LightSheet';
import { Spinner } from '../components/ui';
import { lightRgb, rgbCss } from '../lib/color';
import { applyScene, sceneGradient } from '../lib/scenes';
import { refreshLights, setPower, useApp } from '../lib/store';
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

export function Home({ onSettings }: { onSettings: () => void }) {
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
    if (filter.kind === 'room') return lights.filter((l) => l.room === filter.name);
    if (filter.kind === 'group') {
      const g = groups.find((x) => x.id === filter.id);
      return g ? lights.filter((l) => g.lightIds.includes(l.id)) : lights;
    }
    return lights;
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
        className="pointer-events-none fixed inset-x-0 top-0 -z-0 h-[420px] opacity-40 transition-[background] duration-1000"
        style={{ background: ambient ? `radial-gradient(70% 60% at 50% 0%, ${ambient}55, transparent 75%)` : 'none' }}
      />

      <header className="relative flex items-start justify-between pt-3">
        <div>
          <p className="text-[15px] font-medium text-white/45">{greeting()}</p>
          <h1 className="mt-0.5 text-[34px] leading-tight font-bold tracking-tight">Φώτα</h1>
          <p className="mt-1 text-[15px] text-white/55">
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
            className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95"
            aria-label="Ανανέωση"
          >
            {refreshing ? <Spinner className="h-4 w-4" /> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>}
          </button>
          <button onClick={onSettings} className="grid h-11 w-11 place-items-center rounded-full bg-white/[0.08] text-white/70 active:scale-95" aria-label="Ρυθμίσεις">
            <GearIcon className="h-5 w-5" />
          </button>
        </div>
      </header>

      {(error || stale || providerError) && (
        <div className="relative mt-5 flex items-start gap-3 rounded-2xl bg-[#ff9f0a]/10 px-4 py-3 text-[14px] text-[#ffd18a]">
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
          <button onClick={onSettings} className="mt-6 h-12 rounded-2xl bg-white px-6 text-[15px] font-semibold text-black active:scale-95">
            Σύνδεση
          </button>
        </div>
      ) : (
        <>
          {/* Συνολικός έλεγχος */}
          <section className="relative mt-6 flex items-center gap-3 rounded-[26px] border border-white/[0.06] bg-[#141416]/90 p-3 backdrop-blur-xl">
            <button
              onClick={() => setPower(visible.map((l) => l.id), visibleOn.length === 0)}
              className="flex h-14 flex-1 items-center gap-3 rounded-[20px] px-3 text-left transition active:scale-[0.98]"
            >
              <span
                className="grid h-10 w-10 place-items-center rounded-full text-[18px] transition-all"
                style={{ background: visibleOn.length ? '#fff' : 'rgba(255,255,255,0.1)', color: visibleOn.length ? '#000' : '#fff' }}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
              </span>
              <span>
                <span className="block text-[16px] font-semibold">{filterTitle}</span>
                <span className="block text-[13px] text-white/50">{visibleOn.length ? 'Πάτα για σβήσιμο' : 'Πάτα για άναμμα'}</span>
              </span>
            </button>
            <button
              onClick={() => setSheet({ ids: visible.filter((l) => l.kind !== 'plug').map((l) => l.id), title: filterTitle })}
              className="h-14 rounded-[20px] px-5 text-[15px] font-semibold text-black transition active:scale-95"
              style={{ background: 'conic-gradient(from 200deg, #ff6b6b, #ffd93d, #6bff95, #6bd5ff, #b06bff, #ff6b6b)' }}
            >
              Χρώμα
            </button>
          </section>

          {/* Σκηνές */}
          <section className="relative mt-8">
            <div className="mb-3 flex items-center justify-between px-1">
              <h2 className="text-[20px] font-semibold tracking-tight">Σκηνές</h2>
              <button onClick={() => setSceneEdit('new')} className="flex items-center gap-1 text-[15px] font-medium text-white/60 active:opacity-60">
                <PlusIcon className="h-4 w-4" /> Νέα
              </button>
            </div>
            <div className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-2 [scrollbar-width:none]">
              {scenes.length === 0 && (
                <button
                  onClick={() => setSceneEdit('new')}
                  className="flex h-[104px] w-full items-center justify-center rounded-[22px] border border-dashed border-white/15 text-[15px] text-white/50"
                >
                  Δημιούργησε την πρώτη σου σκηνή
                </button>
              )}
              {scenes.map((s) => (
                <div key={s.id} className="relative shrink-0">
                  <button
                    onClick={() => applyScene(s, lights)}
                    className="flex h-[104px] w-[150px] flex-col justify-end overflow-hidden rounded-[22px] p-3.5 text-left shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition active:scale-95"
                    style={{ background: sceneGradient(s) }}
                  >
                    <span className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
                    <span className="relative text-[15px] leading-tight font-semibold drop-shadow">{s.name}</span>
                    <span className="relative text-[12px] text-white/75">{s.entries.length} λάμπες</span>
                  </button>
                  <button
                    onClick={() => setSceneEdit(s)}
                    className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-black/30 text-white/85 backdrop-blur active:scale-90"
                    aria-label={`Επεξεργασία ${s.name}`}
                  >
                    <EditIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Φίλτρα: δωμάτια και ομάδες */}
          <div className="relative -mx-5 mt-7 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
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
          <section className="relative mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
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

function Chip({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold transition active:scale-95 ${
        active ? 'bg-white text-black' : 'bg-white/[0.08] text-white/75'
      }`}
    >
      {children}
    </button>
  );
}
