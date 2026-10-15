'use client';
import { useEffect, useState } from 'react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setInstalled(standalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!evt) return;
    try {
      await evt.prompt();
      await evt.userChoice;
      setEvt(null);
    } catch {
      /* ignore */
    }
  };

  if (installed || !evt) return null;

  return (
    <button
      type="button"
      onClick={handleInstallClick}
      className="btn btn-ghost btn-sm"
      title="Install app on this device"
    >
      📱 Install app
    </button>
  );
}
