'use client';
import { useEffect, useState } from 'react';
import { LATEST_UPDATE } from '@/lib/config';

export default function UpdateNotificationModal() {
  const [showUpdate, setShowUpdate] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Check if user has seen this release version
    const seenVersion = localStorage.getItem('gp_portal_seen_version');
    if (seenVersion !== LATEST_UPDATE.version) {
      // Small delay so page renders smoothly first
      const timer = setTimeout(() => {
        setShowUpdate(true);
      }, 600);
      return () => clearTimeout(timer);
    }

    // 2. Listen for service worker background update event
    const handleSwUpdate = () => {
      setSwUpdateAvailable(true);
    };
    const handleManualOpen = () => {
      setShowUpdate(true);
    };
    window.addEventListener('sw_update_ready', handleSwUpdate);
    window.addEventListener('show_update_modal', handleManualOpen);
    return () => {
      window.removeEventListener('sw_update_ready', handleSwUpdate);
      window.removeEventListener('show_update_modal', handleManualOpen);
    };
  }, []);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gp_portal_seen_version', LATEST_UPDATE.version);
    }
    setShowUpdate(false);
  };

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gp_portal_seen_version', LATEST_UPDATE.version);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg && reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
          window.location.reload();
        });
      } else {
        window.location.reload();
      }
    }
  };

  if (!showUpdate && !swUpdateAvailable) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl border-2 border-accent/30 bg-white p-6 shadow-2xl text-left max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <span className="badge bg-accent text-white font-semibold text-xs">
                {swUpdateAvailable ? '🚀 Update Ready' : `Version ${LATEST_UPDATE.version}`}
              </span>
              <span className="text-xs text-muted">{LATEST_UPDATE.date}</span>
            </div>
            <h2 className="mt-1.5 text-xl font-bold text-foreground">
              {swUpdateAvailable ? 'New Deployment Available!' : LATEST_UPDATE.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="btn btn-ghost btn-sm text-muted hover:text-ink text-lg leading-none"
            title="Close"
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="mt-3 text-sm text-muted">
          {swUpdateAvailable
            ? 'A fresh update has just been deployed to the portal. Refresh to load the latest features and fixes.'
            : 'Welcome to the latest version of Guest Post Portal! Here is what was just updated:'}
        </p>

        {/* Highlights List */}
        <div className="mt-4 space-y-3">
          {LATEST_UPDATE.highlights.map((h, i) => (
            <div
              key={i}
              className="flex items-start gap-3.5 rounded-xl border border-line bg-paper/60 p-3.5 transition hover:bg-paper"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent text-xl">
                {h.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-foreground">{h.title}</h3>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{h.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="mt-6 flex flex-col sm:flex-row gap-2.5 justify-end">
          {swUpdateAvailable ? (
            <button
              type="button"
              onClick={handleReload}
              className="btn btn-primary w-full sm:w-auto px-6 py-2.5 font-semibold text-sm shadow-sm"
            >
              🔄 Refresh &amp; Update Now
            </button>
          ) : (
            <button
              type="button"
              onClick={handleDismiss}
              className="btn btn-primary w-full sm:w-auto px-6 py-2.5 font-semibold text-sm shadow-sm"
            >
              ✨ Got It / Continue to Portal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
