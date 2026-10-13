'use client';
import { useState, useRef } from 'react';
import { playLoopRing, unlockAudio, RingController } from '@/lib/sound';

export default function SoundTestButton({ className = 'btn btn-ghost btn-sm' }: { className?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const ringRef = useRef<RingController | null>(null);

  const toggleSound = () => {
    unlockAudio();
    if (isPlaying) {
      ringRef.current?.stop();
      ringRef.current = null;
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      ringRef.current = playLoopRing(true);
      // Auto-stop after 6 seconds if not stopped manually
      setTimeout(() => {
        if (ringRef.current) {
          ringRef.current.stop();
          ringRef.current = null;
          setIsPlaying(false);
        }
      }, 6000);
    }
  };

  return (
    <button
      type="button"
      onClick={toggleSound}
      title="Test the order alert bell / ringtone on this device"
      className={`${className} ${isPlaying ? 'bg-warn-soft text-warn font-semibold' : ''}`}
    >
      <span>{isPlaying ? '⏹ Stop' : '🔔 Test Sound'}</span>
    </button>
  );
}
