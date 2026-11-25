// Multi-layer Lock-Screen Audio Keep-Alive + MediaSession + Continuous Speaker Alarm Engine.
// Ensures phones ring loudly EVEN WHEN THE SCREEN IS LOCKED (including iOS Safari before PWA install).

import { playPagerReadyAlert, unlockGuestAlerts } from './pagerAudio';

let silentWavUrl: string | null = null;
let alarmWavUrl: string | null = null;
let audioEl: HTMLAudioElement | null = null;
let vibrateInterval: number | null = null;
let synthFallbackInterval: number | null = null;
let wakeLockSentinel: any = null;
let isRingingNow = false;
const listeners = new Set<(ringing: boolean) => void>();

function notifyListeners() {
  listeners.forEach(fn => fn(isRingingNow));
}

export function subscribeRingingState(cb: (ringing: boolean) => void): () => void {
  listeners.add(cb);
  cb(isRingingNow);
  return () => {
    listeners.delete(cb);
  };
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
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
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

function getSilentWavUrl(): string {
  if (silentWavUrl) return silentWavUrl;
  const sampleRate = 8000;
  const samples = new Int16Array(sampleRate); // 1 second near-zero keepalive
  for (let i = 0; i < samples.length; i++) {
    samples[i] = i % 2 === 0 ? 1 : -1;
  }
  silentWavUrl = encodePcm16MonoWav(samples, sampleRate);
  return silentWavUrl;
}

function getAlarmWavUrl(): string {
  if (alarmWavUrl) return alarmWavUrl;
  // Official dingzi Sonic Signature loop: rising perfect-fifth marimba-bell chime
  // G5 (783.99 Hz, 140ms) -> D6 (1174.66 Hz, 240ms) = 380ms phrase, played twice per 2.2s cycle
  const sampleRate = 22050;
  const totalSamples = Math.floor(sampleRate * 2.2);
  const samples = new Int16Array(totalSamples);
  const notes = [
    { freq: 783.99, start: 0.0, dur: 0.18 },
    { freq: 1174.66, start: 0.14, dur: 0.34 },
    { freq: 783.99, start: 0.76, dur: 0.18 },
    { freq: 1174.66, start: 0.90, dur: 0.42 },
  ];
  for (const n of notes) {
    const startIdx = Math.floor(n.start * sampleRate);
    const len = Math.floor(n.dur * sampleRate);
    for (let j = 0; j < len && startIdx + j < totalSamples; j++) {
      const t = j / sampleRate;
      const env = Math.min(1, j / (0.008 * sampleRate)) * Math.exp(-3.4 * (t / n.dur));
      const wave =
        0.68 * Math.sin(2 * Math.PI * n.freq * t) +
        0.24 * Math.sin(2 * Math.PI * n.freq * 2 * t) +
        0.08 * Math.sin(2 * Math.PI * n.freq * 4 * t);
      const val = Math.max(-1, Math.min(1, samples[startIdx + j] / 32767 + wave * env * 0.8));
      samples[startIdx + j] = Math.round(val * 32767);
    }
  }
  alarmWavUrl = encodePcm16MonoWav(samples, sampleRate);
  return alarmWavUrl;
}

function ensureAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!audioEl) {
    audioEl = new Audio();
    audioEl.loop = true;
    audioEl.preload = 'auto';
    audioEl.setAttribute('playsinline', 'true');
  }
  return audioEl;
}

function updateMediaSession(title: string, artist: string, onAck?: () => void) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !navigator.mediaSession) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album: 'dingzi Live Queue',
      artwork: [
        { src: '/brand/dingzi-favicon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/brand/dingzi-app-icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
      ],
    });
    if (onAck) {
      navigator.mediaSession.setActionHandler('pause', () => onAck());
      navigator.mediaSession.setActionHandler('stop', () => onAck());
    }
  } catch {}
}

export async function armLockScreenAudioKeepAlive(meta: { cafeName: string; ticketCode: string }) {
  await unlockGuestAlerts();
  const el = ensureAudioElement();
  if (el && !isRingingNow) {
    el.src = getSilentWavUrl();
    el.volume = 0.02;
    await el.play().catch(() => {});
  }
  updateMediaSession(`Monitoring Pager ${meta.ticketCode}`, meta.cafeName, () => stopContinuousRinger());

  if ('wakeLock' in navigator && navigator.wakeLock) {
    try {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
    } catch {}
  }
}

export function startContinuousRinger(meta: { cafeName: string; ticketCode: string; subtitle?: string }) {
  isRingingNow = true;
  notifyListeners();

  const el = ensureAudioElement();
  if (el) {
    el.src = getAlarmWavUrl();
    el.volume = 1.0;
    void el.play().catch(() => {});
  }

  playPagerReadyAlert(
    `${meta.cafeName} · ${meta.ticketCode} READY!`,
    meta.subtitle || 'Please head to the counter for pickup.',
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
        navigator.vibrate([180, 80, 240]);
      } catch {}
    }
  }, 2200);

  if (synthFallbackInterval) window.clearInterval(synthFallbackInterval);
  synthFallbackInterval = window.setInterval(() => {
    if (!el || el.paused) {
      playPagerReadyAlert(`${meta.cafeName} · ${meta.ticketCode}`, meta.subtitle || 'Order ready!');
    }
  }, 2800);

  updateMediaSession(
    `READY! Show Code ${meta.ticketCode}`,
    `${meta.cafeName} — Tap Pause to Stop Ringing`,
    () => stopContinuousRinger(),
  );
}

export function stopContinuousRinger(keepMonitoringMeta?: { cafeName: string; ticketCode: string }) {
  isRingingNow = false;
  notifyListeners();

  if (vibrateInterval) {
    window.clearInterval(vibrateInterval);
    vibrateInterval = null;
  }
  if (synthFallbackInterval) {
    window.clearInterval(synthFallbackInterval);
    synthFallbackInterval = null;
  }
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(0);
    } catch {}
  }

  const el = ensureAudioElement();
  if (el) {
    if (keepMonitoringMeta) {
      el.src = getSilentWavUrl();
      el.volume = 0.02;
      void el.play().catch(() => {});
      updateMediaSession(`Pager ${keepMonitoringMeta.ticketCode}`, keepMonitoringMeta.cafeName);
    } else {
      el.pause();
    }
  }
}

// Listen for Service Worker push messages + Wake Lock re-acquisition on foregrounding
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
        stopContinuousRinger();
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && wakeLockSentinel && 'wakeLock' in navigator) {
      void navigator.wakeLock?.request('screen').then(s => { wakeLockSentinel = s; }).catch(() => {});
    }
  });
}

export { wakeLockSentinel };
