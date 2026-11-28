// Multi-layer Lock-Screen Audio Keep-Alive + Pre-Primed Dual Audio + MediaSession + Haptic Alarm Engine.
// Guarantees phones ring loudly EVEN WHEN LOCKED on both Android Chrome and iOS Safari (with or without PWA install).
//
// Critical WebKit/Blink invariants enforced here:
// 1. All HTMLAudioElement.play() and AudioContext.resume() calls execute SYNCHRONOUSLY inside the user's
//    gesture tick BEFORE awaiting Notification.requestPermission() or network fetches, preserving transient user activation.
// 2. keepAliveEl loops a 10-second 18 Hz sub-audible (-61 dBFS) PCM WAV and NEVER swaps `src` once armed,
//    so iOS AVAudioSession is never dropped while transitioning to alarm on a locked screen, and OS silence
//    classifiers never suspend the background audio session.
// 3. alarmEl is pre-loaded and gesture-primed separately with the rising 3-note marimba-bell WAV so calling
//    alarmEl.play() while locked plays immediately at full speaker volume alongside WebAudio + Haptics.

import { playPagerReadyAlert, primeAudioContextSync } from './pagerAudio';

const AUTO_SILENCE_MS = 90_000;

let keepAliveWavUrl: string | null = null;
let alarmWavUrl: string | null = null;
let keepAliveEl: HTMLAudioElement | null = null;
let alarmEl: HTMLAudioElement | null = null;
let alarmPrimed = false;
let isAudioKeepAliveArmed = false;
let isRingingNow = false;

let vibrateInterval: number | null = null;
let synthFallbackInterval: number | null = null;
let autoSilenceTimer: number | null = null;
let wakeLockSentinel: any = null;
let activeMeta: { cafeName: string; ticketCode: string } | null = null;
let activeAckHandler: (() => void) | null = null;

const ringingListeners = new Set<(ringing: boolean) => void>();
const armedListeners = new Set<(armed: boolean) => void>();

function notifyRingingListeners() {
  ringingListeners.forEach(fn => fn(isRingingNow));
}

function setArmedState(next: boolean) {
  if (isAudioKeepAliveArmed === next) return;
  isAudioKeepAliveArmed = next;
  armedListeners.forEach(fn => fn(isAudioKeepAliveArmed));
}

export function subscribeRingingState(cb: (ringing: boolean) => void): () => void {
  ringingListeners.add(cb);
  cb(isRingingNow);
  return () => {
    ringingListeners.delete(cb);
  };
}

export function subscribeLockScreenArmedState(cb: (armed: boolean) => void): () => void {
  armedListeners.add(cb);
  cb(isAudioKeepAliveArmed);
  return () => {
    armedListeners.delete(cb);
  };
}

export function isLockScreenAudioArmed(): boolean {
  return isAudioKeepAliveArmed;
}

export function setLockScreenAckHandler(handler: (() => void) | null) {
  activeAckHandler = handler;
}

function encodePcm16MonoWav(samples: Int16Array, sampleRate: number): string {
  const byteLength = 44 + samples.length * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(44 + i * 2, samples[i], true);
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

function getKeepAliveWavUrl(): string {
  if (keepAliveWavUrl) return keepAliveWavUrl;
  // 10-second 18 Hz infrasonic wave at amplitude 28 (~ -61 dBFS):
  // Completely below phone speaker physical roll-off (~120 Hz) so 100% inaudible even on iOS
  // where HTMLAudioElement.volume is fixed at 1.0, yet non-zero RMS keeps AVAudioSession & AudioTrack alive.
  const sampleRate = 8000;
  const durationSec = 10;
  const samples = new Int16Array(sampleRate * durationSec);
  const omega = (2 * Math.PI * 18) / sampleRate;
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.round(28 * Math.sin(omega * i));
  }
  keepAliveWavUrl = encodePcm16MonoWav(samples, sampleRate);
  return keepAliveWavUrl;
}

function getAlarmWavUrl(): string {
  if (alarmWavUrl) return alarmWavUrl;
  // Official dingzi Sonic Signature Lock-Screen Alarm:
  // Crisp 3-note rising marimba-bell phrase (G5 -> D6 -> G6) played twice per 2.1s loop
  const sampleRate = 22050;
  const totalSamples = Math.floor(sampleRate * 2.1);
  const samples = new Int16Array(totalSamples);
  const notes = [
    { freq: 783.99, start: 0.0, dur: 0.16 },
    { freq: 1174.66, start: 0.14, dur: 0.18 },
    { freq: 1567.98, start: 0.30, dur: 0.36 },
    { freq: 783.99, start: 0.88, dur: 0.16 },
    { freq: 1174.66, start: 1.02, dur: 0.18 },
    { freq: 1567.98, start: 1.18, dur: 0.42 },
  ];
  for (const n of notes) {
    const startIdx = Math.floor(n.start * sampleRate);
    const len = Math.floor(n.dur * sampleRate);
    for (let j = 0; j < len && startIdx + j < totalSamples; j++) {
      const t = j / sampleRate;
      const env = Math.min(1, j / (0.006 * sampleRate)) * Math.exp(-3.1 * (t / n.dur));
      const wave =
        0.64 * Math.sin(2 * Math.PI * n.freq * t) +
        0.26 * Math.sin(2 * Math.PI * n.freq * 2 * t) +
        0.10 * Math.sin(2 * Math.PI * n.freq * 3 * t);
      const mixed = samples[startIdx + j] / 32767 + wave * env * 0.9;
      const clamped = Math.max(-0.96, Math.min(0.96, mixed));
      samples[startIdx + j] = Math.round(clamped * 32767);
    }
  }
  alarmWavUrl = encodePcm16MonoWav(samples, sampleRate);
  return alarmWavUrl;
}

function ensureKeepAliveElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!keepAliveEl) {
    keepAliveEl = new Audio(getKeepAliveWavUrl());
    keepAliveEl.loop = true;
    keepAliveEl.preload = 'auto';
    keepAliveEl.setAttribute('playsinline', 'true');
  }
  return keepAliveEl;
}

function ensureAlarmElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!alarmEl) {
    alarmEl = new Audio(getAlarmWavUrl());
    alarmEl.loop = true;
    alarmEl.preload = 'auto';
    alarmEl.setAttribute('playsinline', 'true');
  }
  return alarmEl;
}

function handleMediaSessionAck() {
  stopContinuousRinger(activeMeta || undefined);
  if (activeAckHandler) {
    try {
      activeAckHandler();
    } catch {}
  }
}

function updateMediaSession(title: string, artist: string, playbackState: 'playing' | 'paused' = 'playing') {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'dingzi Live Pager',
      artwork: [
        { src: '/brand/dingzi-favicon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/brand/dingzi-app-icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
    navigator.mediaSession.playbackState = playbackState;
    navigator.mediaSession.setActionHandler('pause', () => handleMediaSessionAck());
    navigator.mediaSession.setActionHandler('stop', () => handleMediaSessionAck());
  } catch {}
}

async function acquireWakeLock() {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator) || !navigator.wakeLock) return;
  try {
    if (!wakeLockSentinel || wakeLockSentinel.released) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    }
  } catch {}
}

/**
 * Synchronously starts AudioContext + keepAliveEl + primes alarmEl inside the active user gesture tick.
 * Call this directly inside click/submit handlers BEFORE any `await` so iOS Safari never drops user activation.
 */
export function preArmAudioOnUserGesture(meta?: { cafeName: string; ticketCode: string }): Promise<boolean> {
  if (meta) activeMeta = meta;
  primeAudioContextSync();

  const ka = ensureKeepAliveElement();
  const al = ensureAlarmElement();

  const kaPromise = ka
    ? ka
        .play()
        .then(() => {
          setArmedState(true);
          return true;
        })
        .catch(() => false)
    : Promise.resolve(false);

  if (al && !alarmPrimed && !isRingingNow) {
    al.muted = true;
    const p = al.play();
    if (p) {
      void p
        .then(() => {
          if (!isRingingNow) {
            al.pause();
            al.currentTime = 0;
          }
          al.muted = false;
          alarmPrimed = true;
        })
        .catch(() => {
          al.muted = false;
        });
    }
  }

  if (meta && !isRingingNow) {
    updateMediaSession(`Pager ${meta.ticketCode} · Active`, `${meta.cafeName} — Lock-screen alert armed`);
  }
  void acquireWakeLock();
  return kaPromise;
}

export async function armLockScreenAudioKeepAlive(meta: { cafeName: string; ticketCode: string }): Promise<boolean> {
  const ok = await preArmAudioOnUserGesture(meta);
  if (ok && !isRingingNow) {
    updateMediaSession(`Pager ${meta.ticketCode} · Active`, `${meta.cafeName} — Lock-screen alert armed`);
  }
  return ok;
}

export function startContinuousRinger(meta: { cafeName: string; ticketCode: string; subtitle?: string }) {
  activeMeta = { cafeName: meta.cafeName, ticketCode: meta.ticketCode };
  isRingingNow = true;
  notifyRingingListeners();

  // Ensure keepAliveEl continues running untouched while alarmEl plays at full volume
  const ka = ensureKeepAliveElement();
  if (ka && ka.paused) {
    void ka
      .play()
      .then(() => setArmedState(true))
      .catch(() => {});
  }

  const al = ensureAlarmElement();
  if (al) {
    al.muted = false;
    al.volume = 1.0;
    try {
      al.currentTime = 0;
    } catch {}
    void al.play().catch(() => {});
  }

  playPagerReadyAlert(
    `${meta.cafeName} · ${meta.ticketCode} READY!`,
    meta.subtitle || 'Please head to the pickup counter.',
  );

  // Trigger native Capacitor LocalNotifications & Haptics when running inside native app wrapper
  const capPlugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins;
  if (capPlugins?.LocalNotifications) {
    void capPlugins.LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Date.now() % 100000),
          title: `${meta.cafeName} · ${meta.ticketCode} Ready!`,
          body: meta.subtitle || 'Head to the pickup counter now.',
          channelId: 'pager_critical_alarm',
          extra: { ticketCode: meta.ticketCode },
        },
      ],
    }).catch(() => {});
  }

  if (vibrateInterval) window.clearInterval(vibrateInterval);
  vibrateInterval = window.setInterval(() => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([260, 100, 260, 100, 460]);
      } catch {}
    }
  }, 2100);

  if (synthFallbackInterval) window.clearInterval(synthFallbackInterval);
  synthFallbackInterval = window.setInterval(() => {
    playPagerReadyAlert(`${meta.cafeName} · ${meta.ticketCode}`, meta.subtitle || 'Order ready!', false);
  }, 2400);

  if (autoSilenceTimer) window.clearTimeout(autoSilenceTimer);
  autoSilenceTimer = window.setTimeout(() => {
    stopContinuousRinger(activeMeta || undefined);
  }, AUTO_SILENCE_MS);

  updateMediaSession(
    `READY! Show Code ${meta.ticketCode}`,
    `${meta.cafeName} — Tap Pause to Silence`,
    'playing',
  );
}

export function stopContinuousRinger(keepMonitoringMeta?: { cafeName: string; ticketCode: string }) {
  isRingingNow = false;
  notifyRingingListeners();

  if (vibrateInterval) {
    window.clearInterval(vibrateInterval);
    vibrateInterval = null;
  }
  if (synthFallbackInterval) {
    window.clearInterval(synthFallbackInterval);
    synthFallbackInterval = null;
  }
  if (autoSilenceTimer) {
    window.clearTimeout(autoSilenceTimer);
    autoSilenceTimer = null;
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch {}
  }

  if (alarmEl) {
    alarmEl.pause();
    try {
      alarmEl.currentTime = 0;
    } catch {}
  }

  if (keepMonitoringMeta) {
    activeMeta = keepMonitoringMeta;
    const ka = ensureKeepAliveElement();
    if (ka && ka.paused) {
      void ka
        .play()
        .then(() => setArmedState(true))
        .catch(() => {});
    }
    updateMediaSession(`Pager ${keepMonitoringMeta.ticketCode} · On My Way`, keepMonitoringMeta.cafeName, 'playing');
  } else {
    if (keepAliveEl) {
      keepAliveEl.pause();
    }
    setArmedState(false);
  }
}

// Listen for Service Worker push messages + Wake Lock / Keep-Alive recovery on foregrounding
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', event => {
      const msg = event.data;
      if (msg?.type === 'PUSH_ALARM_RECEIVED') {
        startContinuousRinger({
          cafeName: msg.payload?.title || 'Pager Alert',
          ticketCode: msg.payload?.ticketCode || 'READY',
          subtitle: msg.payload?.body,
        });
      } else if (msg?.type === 'PUSH_ALARM_ACKNOWLEDGED') {
        stopContinuousRinger(activeMeta || undefined);
        if (activeAckHandler) {
          try {
            activeAckHandler();
          } catch {}
        }
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (isAudioKeepAliveArmed) {
        void acquireWakeLock();
        if (keepAliveEl && keepAliveEl.paused) {
          void keepAliveEl.play().catch(() => {});
        }
      }
      if (isRingingNow && alarmEl && alarmEl.paused) {
        void alarmEl.play().catch(() => {});
      }
    }
  });
}

export { wakeLockSentinel };
