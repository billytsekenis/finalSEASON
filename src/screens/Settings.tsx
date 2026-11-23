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
  const xm = providers.find((p) => p.id === 'xiaomi');
  const xmCount = lights.filter((l) => l.provider === 'xiaomi').length;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-5 pt-[max(18px,env(safe-area-inset-top))] pb-[max(40px,env(safe-area-inset-bottom))]">
      <header className="flex items-center gap-2 pt-3">
        <button onClick={onBack} className="-ml-2 grid h-11 w-11 place-items-center rounded-full text-white/80 active:bg-white/10" aria-label="Πίσω">
          <BackIcon className="h-6 w-6" />
        </button>
        <h1 className="text-[24px] font-bold tracking-tight">Ρυθμίσεις</h1>
      </header>

      <Section title="Συνδέσεις">
        <SmartThingsCard connected={!!st?.connected} error={st?.error} deviceCount={stCount} />
        <XiaomiCard connected={!!xm?.connected} error={xm?.error} deviceCount={xmCount} />
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
          <span className="flex items-center gap-1 rounded-full bg-[#9aab7a]/15 px-3 py-1 text-[12px] font-semibold text-[#b5c494]">
            <CheckIcon className="h-3.5 w-3.5" /> Ενεργό
          </span>
        )}
      </div>

      {isPat && status?.expiresAt && (
        <p className="mt-3 rounded-xl bg-[#b08a5a]/10 px-3 py-2 text-[13px] text-[#e8c79a]">
          Το προσωρινό token λήγει {new Date(status.expiresAt).toLocaleString('el-GR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}. Κάνε
          μόνιμη σύνδεση παρακάτω.
        </p>
      )}
      {error && !connected && <p className="mt-3 text-[13px] text-[#e8957f]">{error}</p>}

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
      {err && <p className="mt-3 text-[13px] text-[#e8957f]">{err}</p>}
    </div>
  );
}

const REGIONS = [
  { v: 'de', label: 'Ευρώπη' },
  { v: 'cn', label: 'Κίνα' },
  { v: 'us', label: 'ΗΠΑ' },
  { v: 'ru', label: 'Ρωσία' },
  { v: 'sg', label: 'Σιγκαπούρη' },
  { v: 'i2', label: 'Ινδία' },
];

function XiaomiCard({ connected, error, deviceCount }: { connected: boolean; error?: string; deviceCount: number }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ qr: string; loginUrl: string } | null>(null);
  const [qrBusy, setQrBusy] = useState(false);

  // Όσο είναι ανοιχτή η σύνδεση με link, ρωτάμε τον server αν ολοκληρώθηκε το login στη Xiaomi.
  useEffect(() => {
    if (!qr) return;
    let alive = true;
    (async () => {
      while (alive) {
        if (document.visibilityState !== 'visible') {
          await new Promise((r) => setTimeout(r, 1000));
          continue;
        }
        try {
          const r = await api.xmQrPoll();
          if (!alive) return;
          if (r.status === 'connected') {
            setQr(null);
            toast('Το Xiaomi συνδέθηκε');
            await refreshLights();
            return;
          }
          if (r.status === 'expired') {
            setQr(null);
            setErr('Ο σύνδεσμος έληξε. Πάτα ξανά «Σύνδεση μέσω Xiaomi».');
            return;
          }
        } catch (e) {
          if (!alive) return;
          setErr(e instanceof Error ? e.message : 'Σφάλμα');
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [qr]);

  const startQr = async () => {
    setErr('');
    setQrBusy(true);
    try {
      setQr(await api.xmQrStart(region));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Σφάλμα');
    } finally {
      setQrBusy(false);
    }
  };
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState('de');
  const [verifyUrl, setVerifyUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.xmLogin(username, password, region);
      if (r.status === 'verify' && r.url) {
        setVerifyUrl(r.url);
      } else if (r.status === 'captcha') {
        setErr('Η Xiaomi ζητά captcha. Περίμενε λίγα λεπτά και δοκίμασε ξανά.');
      } else {
        setOpen(false);
        setVerifyUrl('');
        setPassword('');
        toast('Το Xiaomi συνδέθηκε');
        await refreshLights();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Σφάλμα');
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-12 w-full rounded-2xl bg-white/[0.06] px-4 text-[16px] outline-none placeholder:text-white/30 focus:bg-white/[0.09]';

  return (
    <div className="mt-3 rounded-[22px] bg-white/[0.04] p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[17px] font-semibold">Xiaomi · Yeelight</div>
          <div className="mt-0.5 text-[14px] text-white/45">{connected ? `${deviceCount} λάμπες` : 'Δεν έχει συνδεθεί'}</div>
        </div>
        {connected && (
          <span className="flex items-center gap-1 rounded-full bg-[#9aab7a]/15 px-3 py-1 text-[12px] font-semibold text-[#b5c494]">
            <CheckIcon className="h-3.5 w-3.5" /> Ενεργό
          </span>
        )}
      </div>
      {error && <p className="mt-3 text-[13px] text-[#e8957f]">{error}</p>}
      {err && !open && <p className="mt-3 text-[13px] text-[#e8957f]">{err}</p>}

      {qr ? (
        <div className="mt-4 space-y-3">
          <ol className="space-y-2 text-[14px] leading-relaxed text-white/70">
            <li>
              <b className="text-white">1.</b> Άνοιξε τη σελίδα της Xiaomi και συνδέσου όπως στο Xiaomi Home (με την επιβεβαίωση που θα σου ζητήσει).
            </li>
            <li>
              <b className="text-white">2.</b> Γύρνα εδώ — η σύνδεση ολοκληρώνεται αυτόματα.
            </li>
          </ol>
          <a
            href={qr.loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-12 place-items-center rounded-2xl bg-white text-[15px] font-semibold text-black active:scale-[0.98]"
          >
            Άνοιγμα σελίδας Xiaomi
          </a>
          <details className="rounded-2xl bg-white/[0.04] p-3 text-[13px] text-white/55">
            <summary>Ή σκάναρε το QR από το Xiaomi Home σε άλλη συσκευή</summary>
            <img src={qr.qr} alt="QR σύνδεσης Xiaomi" className="mx-auto mt-3 w-48 rounded-xl bg-white p-2" />
          </details>
          <div className="flex items-center justify-center gap-2 py-1 text-[13px] text-white/45">
            <Spinner className="h-4 w-4" /> Αναμονή για σύνδεση…
          </div>
          <button type="button" onClick={() => setQr(null)} className="w-full py-2 text-[14px] text-white/45">
            Ακύρωση
          </button>
        </div>
      ) : !open ? (
        <div className="mt-4 space-y-2">
          <Button tone={connected ? 'default' : 'primary'} className="w-full" onClick={startQr} disabled={qrBusy}>
            {qrBusy ? <Spinner /> : connected ? 'Επανασύνδεση μέσω Xiaomi' : 'Σύνδεση μέσω Xiaomi (προτείνεται)'}
          </Button>
          <button type="button" onClick={() => setOpen(true)} className="w-full py-2 text-[14px] text-white/45">
            Σύνδεση με email και κωδικό
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-white/50">
            Ο λογαριασμός της εφαρμογής Xiaomi Home. Ο κωδικός χρησιμοποιείται μόνο για τη σύνδεση και δεν αποθηκεύεται πουθενά.
          </p>
          <input className={field} placeholder="Email, τηλέφωνο ή Xiaomi ID" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="off" autoCorrect="off" />
          <input className={field} type="password" placeholder="Κωδικός Xiaomi" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          <select className={field} value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Περιοχή server">
            {REGIONS.map((r) => (
              <option key={r.v} value={r.v}>
                Server: {r.label}
              </option>
            ))}
          </select>
          {verifyUrl && (
            <div className="space-y-2 rounded-2xl bg-[#b08a5a]/10 p-4 text-[14px] text-[#e8c79a]">
              <p>Η Xiaomi ζητά επιβεβαίωση ταυτότητας (κωδικός σε email ή SMS).</p>
              <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className="block rounded-xl bg-white py-3 text-center font-semibold text-black">
                1. Επιβεβαίωση στη Xiaomi
              </a>
              <p>2. Όταν ολοκληρωθεί, γύρνα εδώ και πάτα ξανά «Σύνδεση».</p>
            </div>
          )}
          <Button type="submit" tone="primary" className="w-full" disabled={busy || !username || !password}>
            {busy ? <Spinner /> : 'Σύνδεση'}
          </Button>
          <button type="button" onClick={() => setOpen(false)} className="w-full py-2 text-[14px] text-white/45">
            Ακύρωση
          </button>
          {err && <p className="text-[13px] text-[#e8957f]">{err}</p>}
        </form>
      )}
    </div>
  );
}
