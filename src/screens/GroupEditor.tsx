import { useEffect, useState } from 'react';
import { CheckIcon, KindIcon } from '../components/Icons';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/ui';
import { uid, updateData, useApp } from '../lib/store';

/** Δημιουργία / επεξεργασία προσωπικής ομάδας λαμπών (π.χ. «Σαλόνι», «Ταινίες»). */
export function GroupEditor({ groupId, onClose }: { groupId: string | 'new' | null; onClose: (deleted?: boolean) => void }) {
  const lights = useApp((s) => s.lights);
  const groups = useApp((s) => s.data.groups);
  const existing = groupId && groupId !== 'new' ? groups.find((g) => g.id === groupId) : undefined;

  const [name, setName] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    if (!groupId) return;
    setName(existing?.name ?? '');
    setIds(existing?.lightIds ?? []);
    setConfirm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  const save = () => {
    const g = { id: existing?.id ?? uid(), name: name.trim() || 'Ομάδα', lightIds: ids };
    updateData((d) => ({ ...d, groups: existing ? d.groups.map((x) => (x.id === g.id ? g : x)) : [...d.groups, g] }));
    onClose();
  };

  return (
    <Sheet open={!!groupId} onClose={() => onClose()} title={existing ? 'Επεξεργασία ομάδας' : 'Νέα ομάδα'}>
      <div className="space-y-6 pb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Όνομα (π.χ. Σαλόνι)"
          maxLength={40}
          enterKeyHint="done"
          className="h-14 w-full rounded-2xl bg-white/[0.06] px-4 text-[17px] font-medium outline-none placeholder:text-white/30 focus:bg-white/[0.09]"
        />
        <div className="overflow-hidden rounded-[22px] bg-white/[0.04]">
          {lights.map((l, i) => {
            const on = ids.includes(l.id);
            return (
              <button
                key={l.id}
                onClick={() => setIds((x) => (on ? x.filter((y) => y !== l.id) : [...x, l.id]))}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${i ? 'border-t border-white/[0.05]' : ''}`}
              >
                <KindIcon kind={l.kind} className="h-5 w-5 text-white/50" />
                <span className="flex-1">
                  <span className="block text-[15px] font-medium">{l.name}</span>
                  <span className="block text-[13px] text-white/40">{l.brand}{l.model ? ` ${l.model}` : ''}</span>
                </span>
                <span className={`grid h-7 w-7 place-items-center rounded-full border-2 ${on ? 'border-white bg-white text-black' : 'border-white/25'}`}>
                  {on && <CheckIcon className="h-4 w-4" />}
                </span>
              </button>
            );
          })}
        </div>
        <Button tone="primary" className="w-full" onClick={save} disabled={!ids.length}>
          Αποθήκευση
        </Button>
        {existing && (
          <Button
            tone="danger"
            className="w-full"
            onClick={() => {
              if (!confirm) return setConfirm(true);
              updateData((d) => ({ ...d, groups: d.groups.filter((g) => g.id !== existing.id) }));
              onClose(true);
            }}
          >
            {confirm ? 'Πάτα ξανά για διαγραφή' : 'Διαγραφή ομάδας'}
          </Button>
        )}
      </div>
    </Sheet>
  );
}
