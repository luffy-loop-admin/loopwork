'use client';
import { useEffect } from 'react';

/** Registers the service worker, monitors updates, and dispatches sw_update_ready when a new version deploys. */
export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (!isSecure) return;

    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        // If there's an updated worker waiting
        if (reg.waiting) {
          window.dispatchEvent(new CustomEvent('sw_update_ready'));
        }

        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('sw_update_ready'));
            }
          });
        });

        // Check for updates when user refocuses the tab
        window.addEventListener('focus', () => {
          reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  }, []);

  return null;
}
