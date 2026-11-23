import { useEffect, useState } from 'react';
import type { LightCommand, Scene, SceneEntry } from '../../shared/types';
import { ControlPanel } from '../components/ControlPanel';
import { CheckIcon, ChevronIcon, KindIcon } from '../components/Icons';
import { commonCaps } from '../components/LightSheet';
import { Sheet } from '../components/Sheet';
import { Button, Switch } from '../components/ui';
import { TEMPLATES, applyScene, buildTemplate, entryColor, entryFromLight, sceneGradient } from '../lib/scenes';
import { runActions, uid, updateData, useApp } from '../lib/store';

/**
 * Δημιουργία / επεξεργασία σκηνής.
 * Κάθε λάμπα έχει δικές της ρυθμίσεις. Με τη «Ζωντανή προεπισκόπηση» οι αλλαγές φαίνονται αμέσως στις λάμπες.
 */
export function SceneEditor({ scene, onClose }: { scene: Scene | 'new' | null; onClose: () => void }) {
  const lights = useApp((s) => s.lights);
  const usable = lights;

  const [name, setName] = useState('');
  const [entries, setEntries] = useState<SceneEntry[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!scene) return;
    setEditing(null);
    setConfirmDelete(false);
    setPreview(false);
    if (scene === 'new') {
      setName('');
      setEntries(lights.filter((l) => l.online && l.kind !== 'plug').map(entryFromLight));
    } else {
      setName(scene.name);
      setEntries(scene.entries);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const included = new Set(entries.map((e) => e.lightId));
  const editingLight = lights.find((l) => l.id === editing);
  const editingEntry = entries.find((e) => e.lightId === editing);

  const toggleLight = (id: string) => {
    if (included.has(id)) setEntries((es) => es.filter((e) => e.lightId !== id));
    else {
      const l = lights.find((x) => x.id === id);
      if (l) setEntries((es) => [...es, entryFromLight(l)]);
    }
  };

  const patchEntry = (id: string, cmd: LightCommand, final: boolean) => {
    setEntries((es) =>
      es.map((e) => {
        if (e.lightId !== id) return e;
        const n = { ...e };
        if (cmd.on != null) n.on = cmd.on;
        if (cmd.brightness != null) {
          n.brightness = Math.round(cmd.brightness);
          n.on = true;
        }
        if (cmd.color) Object.assign(n, { mode: 'color', hue: cmd.color.h, saturation: cmd.color.s, on: true });
        if (cmd.colorTemp != null) Object.assign(n, { mode: 'white', colorTemp: cmd.colorTemp, on: true });
        return n;
      }),
    );
    // Η προεπισκόπηση στέλνει μόνο την τελική τιμή κάθε κίνησης, για να μένει χώρος στο όριο του API.
    if (preview && final) void runActions([{ ids: [id], cmd }]);
  };

  const applyTemplate = (tplName: string) => {
    const targets = lights.filter((l) => (included.size ? included.has(l.id) : l.online));
    setEntries(buildTemplate(tplName, targets));
    if (!name.trim() || TEMPLATES.some((t) => t.name === name)) setName(tplName);
  };

  const captureCurrent = () => setEntries((es) => es.map((e) => {
    const l = lights.find((x) => x.id === e.lightId);
    return l ? entryFromLight(l) : e;
  }));

  const save = () => {
    const now = Date.now();
    const finalName = name.trim() || 'Νέα σκηνή';
    const saved: Scene =
      scene === 'new' || !scene
        ? { id: uid(), name: finalName, entries, createdAt: now, updatedAt: now }
        : { ...scene, name: finalName, entries, updatedAt: now };
    updateData((d) => ({
      ...d,
      scenes: d.scenes.some((s) => s.id === saved.id) ? d.scenes.map((s) => (s.id === saved.id ? saved : s)) : [...d.scenes, saved],
    }));
    onClose();
  };

  const remove = () => {
    if (scene && scene !== 'new') updateData((d) => ({ ...d, scenes: d.scenes.filter((s) => s.id !== scene.id) }));
    onClose();
  };

  const draft: Scene = { id: 'draft', name, entries, createdAt: 0, updatedAt: 0 };

  return (
    <>
      <Sheet open={!!scene} onClose={onClose} title={scene === 'new' ? 'Νέα σκηνή' : 'Επεξεργασία σκηνής'}>
        <div className="space-y-7 pb-4">
          <div className="h-20 rounded-[22px] transition-[background] duration-500" style={{ background: sceneGradient(draft) }} />

          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Όνομα σκηνής"
            maxLength={60}
            enterKeyHint="done"
            className="h-14 w-full rounded-2xl bg-white/[0.06] px-4 text-[17px] font-medium outline-none placeholder:text-white/30 focus:bg-white/[0.09]"
          />

          <div>
            <div className="mb-2 px-1 text-[13px] font-medium tracking-wide text-white/55 uppercase">Πρότυπα</div>
            <div className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
              {TEMPLATES.map((t) => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t.name)}
                  className="h-10 shrink-0 rounded-full bg-white/[0.07] px-4 text-[14px] font-medium active:scale-95"
                >
                  {t.name}
                </button>
              ))}
              <button onClick={captureCurrent} className="h-10 shrink-0 rounded-full bg-white/[0.07] px-4 text-[14px] font-medium active:scale-95">
                Τρέχουσα κατάσταση
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl bg-white/[0.04] px-4 py-3">
            <div>
              <div className="text-[15px] font-medium">Ζωντανή προεπισκόπηση</div>
              <div className="text-[13px] text-white/45">Οι αλλαγές εφαρμόζονται αμέσως στις λάμπες</div>
            </div>
            <Switch
              checked={preview}
              label="Ζωντανή προεπισκόπηση"
              onChange={(v) => {
                setPreview(v);
                if (v) void applyScene(draft, lights);
              }}
            />
          </div>

          <div>
            <div className="mb-2 px-1 text-[13px] font-medium tracking-wide text-white/55 uppercase">Λάμπες</div>
            <div className="overflow-hidden rounded-[22px] bg-white/[0.04]">
              {usable.map((l, i) => {
                const e = entries.find((x) => x.lightId === l.id);
                return (
                  <div key={l.id} className={`flex items-center gap-3 px-4 py-3 ${i ? 'border-t border-white/[0.05]' : ''}`}>
                    <button
                      onClick={() => toggleLight(l.id)}
                      aria-label={e ? `Αφαίρεση ${l.name}` : `Προσθήκη ${l.name}`}
                      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition ${e ? 'border-white bg-white text-black' : 'border-white/25'}`}
                    >
                      {e && <CheckIcon className="h-4 w-4" />}
                    </button>
                    <button
                      disabled={!e}
                      onClick={() => setEditing(l.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-40"
                    >
                      <span
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-black/70"
                        style={{ background: e ? entryColor(e) : 'rgba(255,255,255,0.06)', boxShadow: e?.on ? `0 0 18px ${entryColor(e)}` : 'none' }}
                      >
                        <KindIcon kind={l.kind} className={`h-5 w-5 ${e?.on ? '' : 'text-white/50'}`} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium">{l.name}</span>
                        <span className="block truncate text-[13px] text-white/45">
                          {!e ? `${l.brand} · δεν περιλαμβάνεται` : !e.on ? 'Σβηστή' : `${e.mode === 'white' ? `${e.colorTemp} K` : 'Χρώμα'} · ${e.brightness}%`}
                        </span>
                      </span>
                      {e && <ChevronIcon className="h-4 w-4 shrink-0 text-white/30" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 px-1 text-[12px] text-white/35">
              Οι λάμπες Tapo μέσω SmartThings δεν υποστηρίζουν ομαλή μετάβαση (fade), οπότε οι σκηνές εφαρμόζονται άμεσα.
            </p>
          </div>

          <div className="flex gap-3">
            <Button tone="default" className="flex-1" onClick={() => applyScene(draft, lights)} disabled={!entries.length}>
              Δοκιμή
            </Button>
            <Button tone="primary" className="flex-[2]" onClick={save} disabled={!entries.length}>
              Αποθήκευση
            </Button>
          </div>
          {scene && scene !== 'new' && (
            <Button tone="danger" className="w-full" onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}>
              {confirmDelete ? 'Πάτα ξανά για οριστική διαγραφή' : 'Διαγραφή σκηνής'}
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={!!editing && !!editingLight && !!editingEntry}
        onClose={() => setEditing(null)}
        title={editingLight?.name}
        subtitle={preview ? 'Ζωντανή προεπισκόπηση ενεργή' : 'Ρύθμιση για τη σκηνή'}
        glow={editingEntry?.on ? entryColor(editingEntry) : undefined}
        headerRight={
          editingEntry && (
            <Switch checked={editingEntry.on} label="Αναμμένη στη σκηνή" onChange={(v) => patchEntry(editingEntry.lightId, { on: v }, true)} />
          )
        }
      >
        {editingLight && editingEntry && (
          <ControlPanel
            state={editingEntry}
            caps={commonCaps([editingLight])}
            onChange={(cmd, final) => patchEntry(editingLight.id, cmd, final)}
          />
        )}
      </Sheet>
    </>
  );
}
