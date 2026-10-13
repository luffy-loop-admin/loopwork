'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { acknowledgeOrderAlertAction, getActiveOrderAlertAction } from '@/app/actions/orders';
import { playLoopRing, playSimpleRing, unlockAudio, RingController } from '@/lib/sound';
import { money } from '@/lib/format';

type ActiveOrder = {
  id: string;
  domain: string;
  price_paid: number | null;
  currency: string;
  order_date: string | null;
  alerted_at: string;
};

export default function OrderAlertClient({
  role,
  vendorId,
}: {
  role: 'admin' | 'vendor';
  vendorId: string | null;
}) {
  const router = useRouter();
  const [activeAlert, setActiveAlert] = useState<ActiveOrder | null>(null);
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const ringRef = useRef<RingController | null>(null);

  // Unlock audio on any initial user touch or click
  useEffect(() => {
    const handleInteraction = () => {
      unlockAudio();
      setIsAudioUnlocked(true);
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  // Poll for alerts if logged in as a vendor
  useEffect(() => {
    if (role !== 'vendor' || !vendorId) return;

    let mounted = true;

    const checkAlerts = async () => {
      try {
        const res = await getActiveOrderAlertAction();
        if (!mounted) return;
        if (res.hasAlert && res.order) {
          if (!activeAlert || activeAlert.id !== res.order.id) {
            setActiveAlert(res.order);
            // Trigger vibration if device supports it
            if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
              try {
                navigator.vibrate([400, 200, 400, 200, 600]);
              } catch {
                /* ignore */
              }
            }
            // Start looping ringtone
            if (!ringRef.current) {
              ringRef.current = playLoopRing(true);
            }
          }
        } else {
          // No active alert
          if (ringRef.current) {
            ringRef.current.stop();
            ringRef.current = null;
          }
          setActiveAlert(null);
        }
      } catch {
        /* ignore polling errors */
      }
    };

    // Check immediately on mount
    checkAlerts();

    // Check every 7 seconds
    const interval = setInterval(checkAlerts, 7000);

    return () => {
      mounted = false;
      clearInterval(interval);
      if (ringRef.current) {
        ringRef.current.stop();
        ringRef.current = null;
      }
    };
  }, [role, vendorId, activeAlert]);

  const handleAcknowledge = async (andNavigate = false) => {
    if (ringRef.current) {
      ringRef.current.stop();
      ringRef.current = null;
    }
    const orderId = activeAlert?.id;
    setActiveAlert(null);

    if (orderId) {
      await acknowledgeOrderAlertAction(orderId);
    }
    if (andNavigate) {
      router.push('/orders');
    }
  };

  const handleTapForSound = () => {
    unlockAudio();
    setIsAudioUnlocked(true);
    if (!ringRef.current) {
      ringRef.current = playLoopRing(true);
    }
  };

  if (!activeAlert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-2xl border-2 border-accent bg-white p-6 shadow-2xl text-center">
        {/* Pulsing Bell Icon */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent text-3xl animate-bounce">
          🔔
        </div>

        <h2 className="mt-4 text-2xl font-bold tracking-tight text-accent">
          New Order from Loop!
        </h2>
        <p className="mt-1 text-sm text-muted">
          You received a new guest post order.
        </p>

        {/* Order Card Preview */}
        <div className="mt-4 rounded-xl border border-line bg-paper p-4 text-left space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Website</span>
            <span className="text-base font-bold text-foreground">{activeAlert.domain}</span>
          </div>
          {activeAlert.price_paid !== null && (
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Price</span>
              <span className="text-base font-semibold text-good">
                {money(activeAlert.price_paid, activeAlert.currency)}
              </span>
            </div>
          )}
          {activeAlert.order_date && (
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Date</span>
              <span className="text-sm text-foreground">{activeAlert.order_date}</span>
            </div>
          )}
        </div>

        {!isAudioUnlocked && (
          <button
            type="button"
            onClick={handleTapForSound}
            className="mt-3 w-full rounded-lg bg-warn-soft p-2.5 text-xs font-semibold text-warn animate-pulse border border-warn/30"
          >
            🔊 Sound paused by browser: Tap here to turn on sound
          </button>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={() => handleAcknowledge(false)}
            className="btn btn-outline flex-1 py-3 text-sm font-semibold"
          >
            🔇 Stop Ring / Got it
          </button>
          <button
            type="button"
            onClick={() => handleAcknowledge(true)}
            className="btn btn-primary flex-1 py-3 text-sm font-semibold"
          >
            View Orders →
          </button>
        </div>
      </div>
    </div>
  );
}
