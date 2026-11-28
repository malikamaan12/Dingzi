// Zero-dependency Web Audio API synthesizer + Vibration + Notification helper
// Synchronous AudioContext priming ensures iOS Safari & Android Chrome never lose user activation before async permissions.

let sharedAudioCtx: AudioContext | null = null;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
  if (sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Synchronously creates/resumes AudioContext and schedules an inaudible 15ms unlock pulse
 * within the exact synchronous user-gesture call stack.
 */
export function primeAudioContextSync(): AudioContext | null {
  const ctx = ensureAudioContext();
  if (ctx) {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0005;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.015);
    } catch {}
  }
  return ctx;
}

export async function unlockGuestAlerts(): Promise<{
  audioUnlocked: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  wakeLockActive: boolean;
}> {
  const ctx = primeAudioContextSync();

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
  emitBrowserNotification = true,
) {
  const ctx = ensureAudioContext();
  if (ctx) {
    try {
      // Official dingzi Sonic Signature: rising 3-note marimba-bell chime (G5 -> D6 -> G6)
      const phrase: Array<{ freq: number; offsetSec: number; durationSec: number }> = [
        { freq: 783.99, offsetSec: 0, durationSec: 0.14 },
        { freq: 1174.66, offsetSec: 0.13, durationSec: 0.18 },
        { freq: 1567.98, offsetSec: 0.28, durationSec: 0.30 },
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
        gain.gain.exponentialRampToValueAtTime(0.45, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec + 0.14);

        overtoneGain.gain.setValueAtTime(0.0001, start);
        overtoneGain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
        overtoneGain.gain.exponentialRampToValueAtTime(0.0001, start + durationSec);

        fund.connect(gain);
        overtone.connect(overtoneGain);
        gain.connect(ctx.destination);
        overtoneGain.connect(ctx.destination);

        fund.start(start);
        overtone.start(start);
        fund.stop(start + durationSec + 0.16);
        overtone.stop(start + durationSec + 0.02);
      });
    } catch {}
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([260, 100, 260, 100, 460]);
    } catch {}
  }

  if (
    emitBrowserNotification &&
    typeof Notification !== 'undefined' &&
    Notification.permission === 'granted' &&
    document.hidden
  ) {
    try {
      new Notification(title, {
        body,
        icon: '/brand/dingzi-favicon-192.png',
        badge: '/brand/dingzi-favicon-192.png',
        tag: 'dingzi-foreground-pager',
      });
    } catch {}
  }
}

export function playStaffArrivalChime() {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
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
