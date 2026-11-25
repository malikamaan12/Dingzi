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

export function playPagerReadyAlert(
  title = 'Ding! Your food is ready.',
  body = 'Please head to the pickup counter.',
) {
  const ctx = ensureAudioContext();
  if (ctx) {
    try {
      // Official dingzi Sonic Signature (Brand Guidelines v1.0, Section 6):
      // Rising perfect-fifth marimba-bell chime: G5 (783.99 Hz, 140ms) -> D6 (1174.66 Hz, 240ms) = 380ms total
      const phrase: Array<{ freq: number; offsetSec: number; durationSec: number }> = [
        { freq: 783.99, offsetSec: 0, durationSec: 0.14 },
        { freq: 1174.66, offsetSec: 0.14, durationSec: 0.24 },
      ];
      phrase.forEach(({ freq, offsetSec, durationSec }) => {
        const start = ctx.currentTime + offsetSec;
        const fund = ctx.createOscillator();
        const overtone = ctx.createOscillator();
        const gain = ctx.createGain();
        const overtoneGain = ctx.createGain();

        fund.type = 'triangle';
        fund.frequency.setValueAtTime(freq, start);
        overtone.type = 'sine';
        overtone.frequency.setValueAtTime(freq * 2, start);

        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.36, start + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec + 0.12);

        overtoneGain.gain.setValueAtTime(0.0001, start);
        overtoneGain.gain.exponentialRampToValueAtTime(0.14, start + 0.01);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

        fund.connect(gain);
        overtone.connect(overtoneGain);
        gain.connect(ctx.destination);
        overtoneGain.connect(ctx.destination);

        fund.start(start);
        overtone.start(start);
        fund.stop(start + durationSec + 0.14);
        overtone.stop(start + durationSec + 0.02);
      });
    } catch {}
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      // Official dingzi Haptic Ready Pattern: [180, 80, 240] ms
      navigator.vibrate([180, 80, 240]);
    } catch {}
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
    try {
      new Notification(title, { body, icon: '/brand/dingzi-favicon-192.png' });
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
