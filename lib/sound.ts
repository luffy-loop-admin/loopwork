'use client';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

/** Plays a crisp, cheerful 2-tone chime (ding-dong) */
export function playSimpleRing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const tones = [
    { freq: 784, start: 0, dur: 0.25 }, // G5
    { freq: 659.25, start: 0.22, dur: 0.45 }, // E5
  ];

  for (const t of tones) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(t.freq, now + t.start);

    gain.gain.setValueAtTime(0.001, now + t.start);
    gain.gain.exponentialRampToValueAtTime(0.3, now + t.start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t.start + t.dur);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + t.start);
    osc.stop(now + t.start + t.dur);
  }
}

/** Short crisp confirmation ding for admin bell clicks */
export function playAdminDing(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(1046.5, now); // C6

  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + 0.35);
}

/** Speaks "New order from Loop" using browser speech synthesis if available */
export function speakNewOrder(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance('New order from Loop');
    u.rate = 1.0;
    u.pitch = 1.1;
    window.speechSynthesis.speak(u);
  } catch {
    /* ignore */
  }
}

export type RingController = {
  stop: () => void;
};

/**
 * Loops a melodic telephone/order ring every 2.4 seconds until stopped.
 * Also announces "New order from Loop" once.
 */
export function playLoopRing(withVoice = true): RingController {
  unlockAudio();
  if (withVoice) {
    speakNewOrder();
  }

  const playChimeSequence = () => {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [
      { freq: 880, start: 0, dur: 0.18 },      // A5
      { freq: 659.25, start: 0.16, dur: 0.22 }, // E5
      { freq: 880, start: 0.36, dur: 0.18 },    // A5
      { freq: 1174.66, start: 0.54, dur: 0.5 }, // D6
    ];

    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.start);

      gain.gain.setValueAtTime(0.001, now + n.start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + n.start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur);
    }
  };

  playChimeSequence();
  const intervalId = setInterval(playChimeSequence, 2400);

  return {
    stop: () => {
      clearInterval(intervalId);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          /* ignore */
        }
      }
    },
  };
}
