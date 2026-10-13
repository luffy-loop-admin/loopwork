'use client';
import { useEffect, useState } from 'react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/**
 * "Install app" button.
 * Android / desktop Chrome & Edge: one-tap install.  iPhone / iPad: shows the Share -> Add to Home Screen steps.
 * Hidden once the app is already installed.
 */
export default function InstallPrompt({ className = 'btn btn-ghost btn-sm' }: { className?: string }) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(true); // hidden until we know
  const [ios, setIos] = useState(false);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    setInstalled(standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1));
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setEvt(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;
  if (!evt && !ios) return null;

  return (
    <div className="relative">
      <button
        type="button"
        className={className}
        onClick={async () => {
          if (evt) {
            await evt.prompt();
            await evt.userChoice;
            setEvt(null);
          } else setHelp((h) => !h);
        }}
      >
        Install app
      </button>
      {help && (
        <div role="dialog" aria-label="Install on iPhone" className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-line bg-white p-3 text-left text-sm shadow-lg">
          <p className="font-medium">Install on iPhone / iPad</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted">
            <li>Open this page in <strong>Safari</strong>.</li>
            <li>Tap the <strong>Share</strong> button (square with an arrow).</li>
            <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          </ol>
          <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={() => setHelp(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
