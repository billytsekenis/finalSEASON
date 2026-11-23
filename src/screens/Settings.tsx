import { useEffect, useState } from 'react';
import { BackIcon, CheckIcon } from '../components/Icons';
import { Button, Section, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { refreshLights, signOut, toast, useApp } from '../lib/store';

export function Settings({ onBack }: { onBack: () => void }) {
  const providers = useApp((s) => s.providers);
  const lights = useApp((s) => s.lights);
  const st = providers.find((p) => p.id === 'smartthings');
  const stCount = lights.filter((l) => l.provider === 'smartthings').length;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 pt-3">
        <button onClick={onBack} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 active:bg-white/10" aria-label="Πίσω">
          <BackIcon className="h-6 w-6" />
        </button>
        <h1 className="text-[28px] font-bold tracking-tight">Ρυθμίσεις</h1>
      </header>

      <Section title="Συνδέσεις">
        <SmartThingsCard connected={!!st?.connected} error={st?.error} deviceCount={stCount} />
        <div className="mt-3 rounded-[22px] bg-white/[0.04] p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[17px] font-semibold">Yeelight / Xiaomi</div>
              <div className="mt-0.5 text-[14px] text-white/45">Δεν έχει συνδεθεί ακόμα</div>
            </div>
            <span className="rounded-full bg-white/[0.07] px-3 py-1 text-[12px] font-semibold text-white/50">Επόμενο βήμα</span>
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-white/40">
            Οι λάμπες Yeelight δεν εμφανίστηκαν στο SmartThings. Η σύνδεσή τους θα γίνει απευθείας μέσω του cloud της Xiaomi.
          </p>
        </div>
      </Section>

      <Section title="Λογαριασμός">
        <div className="rounded-[22px] bg-white/[0.04] p-5 text-[14px] leading-relaxed text-white/55">
          Η πρόσβαση προστατεύεται με κωδικό. Τα tokens των υπηρεσιών αποθηκεύονται κρυπτογραφημένα μόνο στον διακομιστή, ποτέ στη συσκευή σου.
        </div>
        <Button tone="danger" className="mt-3 w-full" onClick={signOut}>
          Αποσύνδεση από την εφαρμογή
        </Button>
      </Section>

      <p className="mt-10 text-center text-[12px] text-white/25">Lumen · έκδοση {__APP_VERSION__}</p>
    </div>
  );
}

function SmartThingsCard({ connected, error, deviceCount }: { connected: boolean; error?: string; deviceCount: number }) {
  const [status, setStatus] = useState<{ kind?: string; expiresAt?: number } | null>(null);
  const [step, setStep] = useState<'idle' | 'paste'>('idle');
  const [authUrl, setAuthUrl] = useState('');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.stStatus().then(setStatus).catch(() => {});
  }, [connected]);

  const start = async () => {
    setErr('');
    setBusy(true);
    try {
      const { authorizeUrl } = await api.stStart();
      setAuthUrl(authorizeUrl);
      setStep('paste');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Σφάλμα');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setErr('');
    setBusy(true);
    try {
      await api.stComplete(input);
      setStep('idle');
      setInput('');
      toast('Το SmartThings συνδέθηκε');
      await refreshLights();
      setStatus(await api.stStatus());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Σφάλμα');
    } finally {
      setBusy(false);
    }
  };

  const paste = async () => {
    try {
      setInput(await navigator.clipboard.readText());
    } catch {
      setErr('Δεν επιτράπηκε η επικόλληση — κράτα πατημένο το πεδίο και επίλεξε «Επικόλληση».');
    }
  };

  const isPat = status?.kind === 'pat';

  return (
    <div className="rounded-[22px] bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[17px] font-semibold">SmartThings · Tapo</div>
          <div className="mt-0.5 text-[14px] text-white/45">
            {connected ? `${deviceCount} συσκευές${isPat ? ' · προσωρινό token' : ''}` : 'Δεν έχει συνδεθεί'}
          </div>
        </div>
        {connected && (
          <span className="flex items-center gap-1 rounded-full bg-[#34c759]/15 px-3 py-1 text-[12px] font-semibold text-[#5ee07f]">
            <CheckIcon className="h-3.5 w-3.5" /> Ενεργό
          </span>
        )}
      </div>

      {isPat && status?.expiresAt && (
        <p className="mt-3 rounded-xl bg-[#ff9f0a]/10 px-3 py-2 text-[13px] text-[#ffd18a]">
          Το προσωρινό token λήγει {new Date(status.expiresAt).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Κάνε
          μόνιμη σύνδεση παρακάτω.
        </p>
      )}
      {error && !connected && <p className="mt-3 text-[13px] text-[#ff8a80]">{error}</p>}

      {step === 'idle' ? (
        <Button tone={connected && !isPat ? 'default' : 'primary'} className="mt-4 w-full" onClick={start} disabled={busy}>
          {busy ? <Spinner /> : connected && !isPat ? 'Επανασύνδεση' : 'Μόνιμη σύνδεση με SmartThings'}
        </Button>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="rounded-xl bg-white/[0.05] px-3 py-2 text-[13px] text-white/55">
            Συμβουλή: κάνε αυτή τη σύνδεση από το <b>Safari</b> (όχι από το εικονίδιο στην αρχική οθόνη), για να μπορείς να αντιγράψεις εύκολα το URL.
          </p>
          <ol className="space-y-2 text-[14px] leading-relaxed text-white/70">
            <li>
              <b className="text-white">1.</b> Άνοιξε τη σελίδα της Samsung, συνδέσου και πάτα <b>Authorize / Allow</b>.
            </li>
            <a
              href={authUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="my-1 grid h-12 place-items-center rounded-2xl bg-white text-[15px] font-semibold text-black active:scale-[0.98]"
            >
              Άνοιγμα σελίδας Samsung
            </a>
            <li>
              <b className="text-white">2.</b> Στο τέλος το Safari θα δείξει σφάλμα «δεν μπορεί να συνδεθεί» για <i>localhost</i>. Είναι φυσιολογικό.
            </li>
            <li>
              <b className="text-white">3.</b> Πάτα στη γραμμή διευθύνσεων, αντίγραψε <b>όλο</b> το URL και επικόλλησέ το εδώ:
            </li>
          </ol>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="http://localhost:61973/finish?code=…"
            rows={3}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="w-full resize-none rounded-2xl bg-white/[0.06] p-4 font-mono text-[13px] outline-none placeholder:text-white/25 focus:bg-white/[0.09]"
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={paste}>
              Επικόλληση
            </Button>
            <Button tone="primary" className="flex-[2]" onClick={finish} disabled={busy || !input.trim()}>
              {busy ? <Spinner /> : 'Ολοκλήρωση'}
            </Button>
          </div>
          <button onClick={() => setStep('idle')} className="w-full py-2 text-[14px] text-white/45">
            Ακύρωση
          </button>
        </div>
      )}
      {err && <p className="mt-3 text-[13px] text-[#ff8a80]">{err}</p>}
    </div>
  );
}
