'use client';
import { useState, useTransition } from 'react';
import { alertOrderVendorAction } from '@/app/actions/orders';
import { playAdminDing } from '@/lib/sound';

export default function AlertBellButton({
  orderId,
  vendorName,
  alertedAt,
}: {
  orderId: string;
  vendorName?: string | null;
  alertedAt?: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [lastAlerted, setLastAlerted] = useState<string | null>(alertedAt ?? null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleRing = () => {
    playAdminDing();
    startTransition(async () => {
      const res = await alertOrderVendorAction(orderId);
      if (res.ok) {
        setLastAlerted(new Date().toISOString());
        setFeedback('Ringing! 🔔');
        setTimeout(() => setFeedback(null), 3000);
      } else {
        alert(res.message);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleRing}
      disabled={isPending}
      title={
        lastAlerted
          ? `Alerted at ${new Date(lastAlerted).toLocaleTimeString()}. Click to ring again.`
          : `Ring ${vendorName || 'vendor'}'s device for this order`
      }
      className={`btn btn-sm ${
        feedback
          ? 'bg-good text-white'
          : lastAlerted
          ? 'bg-accent-soft text-accent border border-accent/30'
          : 'btn-ghost'
      }`}
    >
      <span className={isPending ? 'animate-spin' : ''}>🔔</span>
      <span>{feedback || (lastAlerted ? 'Rung' : 'Ring')}</span>
    </button>
  );
}
