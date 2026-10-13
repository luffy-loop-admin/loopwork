'use client';
import { useEffect, useState } from 'react';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function InstallPrompt({
  variant = 'button',
  className,
}: {
  variant?: 'button' | 'card';
  className?: string;
}) {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'android' | 'ios'>('android');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true;
    setInstalled(standalone);

    const ua = navigator.userAgent || '';
    const isApple = /iphone|ipad|ipod/i.test(ua) || (ua.includes('Mac') && navigator.maxTouchPoints > 1);
    const mobileDevice = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua) || navigator.maxTouchPoints > 1;

    setIsIos(isApple);
    setIsMobile(mobileDevice);
    if (isApple) setActiveTab('ios');

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };

    const onAppInstalled = () => {
      setInstalled(true);
      setEvt(null);
      setShowModal(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (evt) {
      try {
        await evt.prompt();
        await evt.userChoice;
        setEvt(null);
      } catch {
        setShowModal(true);
      }
    } else {
      setShowModal(true);
    }
  };

  if (installed) {
    if (variant === 'card') {
      return (
        <div className="rounded-xl border border-good/30 bg-good-soft p-4 text-center sm:text-left flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📱</span>
            <div>
              <p className="text-sm font-semibold text-good">App Installed on This Device</p>
              <p className="text-xs text-muted">You are running the standalone app with order sound notifications enabled.</p>
            </div>
          </div>
          <span className="badge bg-good text-white font-medium">Active</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {variant === 'card' ? (
        <div className="rounded-2xl border border-accent/20 bg-gradient-to-r from-accent-soft/60 to-accent-soft/20 p-4 sm:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-white text-2xl shadow-sm">
                📲
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">
                  Install App / Create Shortcut
                </h3>
                <p className="text-xs sm:text-sm text-muted mt-0.5">
                  Add to your home screen as an app or shortcut for full-screen view and instant order ring alerts.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleInstallClick}
              className="btn btn-primary whitespace-nowrap self-start sm:self-auto px-5 py-2.5 font-semibold shadow-sm"
            >
              📱 Install App / Create Shortcut
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleInstallClick}
          className={className || 'btn btn-ghost btn-sm flex items-center gap-1.5'}
          title="Install app or create shortcut on home screen"
        >
          <span>📱</span>
          <span className="hidden sm:inline">Install / Shortcut</span>
        </button>
      )}

      {/* Step-by-step instructions modal */}
      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-2xl text-left">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <span className="text-xl">📲</span>
                <h3 className="font-bold text-lg text-foreground">Install on Your Device</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-ghost btn-sm text-muted hover:text-ink text-lg leading-none"
              >
                ✕
              </button>
            </div>

            {/* Platform Tabs */}
            <div className="mt-4 flex rounded-lg bg-paper p-1 border border-line text-xs font-semibold gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('android')}
                className={`flex-1 rounded-md py-1.5 text-center transition ${
                  activeTab === 'android' ? 'bg-white text-accent shadow-sm' : 'text-muted'
                }`}
              >
                🤖 Android / Chrome
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ios')}
                className={`flex-1 rounded-md py-1.5 text-center transition ${
                  activeTab === 'ios' ? 'bg-white text-accent shadow-sm' : 'text-muted'
                }`}
              >
                🍎 iPhone / iPad
              </button>
            </div>

            {activeTab === 'android' ? (
              <div className="mt-4 space-y-3 text-sm text-foreground">
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">1</span>
                  <span>Tap the <strong>three dots menu (⋮)</strong> at the top-right of your browser.</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">2</span>
                  <span>Select <strong>&quot;Install app&quot;</strong>, <strong>&quot;Add to Home screen&quot;</strong>, or <strong>&quot;Create shortcut&quot;</strong>.</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">3</span>
                  <span>Tap <strong>Install / Add</strong>. The portal icon will be added to your home screen and open in full screen!</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3 text-sm text-foreground">
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">1</span>
                  <span>Open this page in <strong>Safari</strong> on your iPhone or iPad.</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">2</span>
                  <span>Tap the <strong>Share button</strong> (square icon with an arrow pointing up ⎋ at bottom).</span>
                </div>
                <div className="flex items-start gap-3 rounded-lg bg-accent-soft/30 p-3">
                  <span className="font-bold text-accent">3</span>
                  <span>Scroll down and tap <strong>&quot;Add to Home Screen&quot;</strong>, then tap <strong>Add</strong> at top-right.</span>
                </div>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="btn btn-primary w-full py-2.5 font-semibold"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
