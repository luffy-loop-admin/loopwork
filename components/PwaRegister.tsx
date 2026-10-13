'use client';
import { useEffect } from 'react';

/** Registers the tiny service worker that makes the app installable. */
export default function PwaRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return null;
}
