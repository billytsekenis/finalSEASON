import { useState } from 'react';
import { Spinner } from '../components/ui';
import { signIn } from '../lib/store';

export function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError('');
    try {
      await signIn(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα');
      setBusy(false);
    }
  };

  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute top-[-20%] left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full opacity-50 blur-3xl"
        style={{ background: 'conic-gradient(from 90deg, #c97b5a, #d9a56b, #9aab7a, #7f9f9b, #9c86a8, #c97b5a)' }}
      />
      <form onSubmit={submit} className="relative w-full max-w-sm">
        <div className="mx-auto mb-8 grid h-20 w-20 place-items-center rounded-[26px] bg-black/40 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
          <img src="/icons/icon-192.png" alt="" className="h-20 w-20 rounded-[26px]" />
        </div>
        <h1 className="text-center text-[30px] font-bold tracking-tight">Lumen</h1>
        <p className="mt-1 text-center text-[15px] text-white/55">Όλα τα φώτα σου, σε ένα μέρος</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Κωδικός πρόσβασης"
          autoComplete="current-password"
          enterKeyHint="go"
          autoFocus
          className="mt-10 h-14 w-full rounded-2xl border border-white/10 bg-white/[0.07] px-5 text-[17px] outline-none backdrop-blur-xl placeholder:text-white/35 focus:border-white/30"
        />
        {error && <p className="mt-3 text-center text-[14px] text-[#e8957f]">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-4 grid h-14 w-full place-items-center rounded-2xl bg-white text-[17px] font-semibold text-black transition active:scale-[0.98] disabled:opacity-50"
        >
          {busy ? <Spinner className="h-5 w-5 border-black/20 border-t-black/80" /> : 'Είσοδος'}
        </button>
      </form>
    </div>
  );
}
