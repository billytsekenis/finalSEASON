import { useEffect, useState } from 'react';
import { WifiOffIcon } from './components/Icons';
import { Spinner, ToastHost } from './components/ui';
import { boot, useApp } from './lib/store';
import { Home } from './screens/Home';
import { Login } from './screens/Login';
import { Energy } from './screens/Energy';
import { Settings } from './screens/Settings';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function App() {
  const phase = useApp((s) => s.phase);
  const [screen, setScreen] = useState<'home' | 'settings' | 'energy'>('home');
  const online = useOnline();

  useEffect(() => {
    void boot();
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [screen]);

  return (
    <>
      {!online && (
        <div className="fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 bg-[#3a2a10]/95 px-4 pt-[max(8px,env(safe-area-inset-top))] pb-2 text-[13px] font-medium text-[#ffd18a] backdrop-blur">
          <WifiOffIcon className="h-4 w-4" /> Χωρίς σύνδεση στο internet — οι λάμπες δεν μπορούν να ελεγχθούν
        </div>
      )}
      {phase === 'boot' ? (
        <div className="grid min-h-dvh place-items-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : phase === 'login' ? (
        <Login />
      ) : screen === 'energy' ? (
        <div className="animate-in">
          <Energy onBack={() => setScreen('home')} />
        </div>
      ) : screen === 'settings' ? (
        <div className="animate-in">
          <Settings onBack={() => setScreen('home')} />
        </div>
      ) : (
        <div className="animate-in">
          <Home onSettings={() => setScreen('settings')} onEnergy={() => setScreen('energy')} />
        </div>
      )}
      <ToastHost />
    </>
  );
}
