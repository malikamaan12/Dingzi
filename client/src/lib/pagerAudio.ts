// Zero-dependency Web Audio API synthesizer + Vibration + Wake Lock + Notification helper
// Unlocks cleanly on guest's first tap so mobile Safari & Chrome ring reliably.

let sharedAudioCtx: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

export async function unlockGuestAlerts(): Promise<{
  audioUnlocked: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  wakeLockActive: boolean;
}> {
  const ctx = ensureAudioContext();
  if (ctx) {
    // Play a silent 10ms oscillator pulse to unlock iOS Safari audio
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.02);
    } catch {}
  }

  let notificationPermission: NotificationPermission | 'unsupported' = 'unsupported';
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'default') {
      try {
        notificationPermission = await Notification.requestPermission();
      } catch {
        notificationPermission = Notification.permission;
      }
    } else {
      notificationPermission = Notification.permission;
    }
  }

  let wakeLockActive = false;
  if ('wakeLock' in navigator && navigator.wakeLock) {
    try {
      await navigator.wakeLock.request('screen');
      wakeLockActive = true;
    } catch {
      wakeLockActive = false;
    }
  }

  return {
    audioUnlocked: Boolean(ctx),
    notificationPermission,
    wakeLockActive,
  };
}

export function playPagerReadyAlert(title = 'Order Ready!', body = 'Please head to the pickup counter.') {
  const ctx = ensureAudioContext();
  if (ctx) {
    try {
      // Three-note warm hospitality marimba/chime chord (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const start = ctx.currentTime + idx * 0.14;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.32, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.58);
      });
    } catch {}
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([280, 110, 280, 110, 460]);
    } catch {}
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(title, { body });
    } catch {}
  }
}

export function playStaffArrivalChime() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    // Crisp two-tone drive-thru bay arrival chime (A5 -> E6)
    [880, 1318.5].forEach((freq, idx) => {
      const start = ctx.currentTime + idx * 0.12;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.24, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.38);
    });
  } catch {}
}
