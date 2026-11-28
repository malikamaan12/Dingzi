import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

const ARMED_SCOPES_STORAGE_KEY = 'dingzi_armed_push_scopes_v1';
const REPORTED_ARM_SCOPES = new Set<string>();

export interface DeviceCapabilities {
  isNativeApp: boolean;
  nativePlatform: 'ios' | 'android' | 'web';
  isStandalonePwa: boolean;
  isIosSafariBrowser: boolean;
  webPushSupported: boolean;
  serviceWorkerSupported: boolean;
}

export function detectDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined') {
    return {
      isNativeApp: false,
      nativePlatform: 'web',
      isStandalonePwa: false,
      isIosSafariBrowser: false,
      webPushSupported: false,
      serviceWorkerSupported: false,
    };
  }
  const isNativeApp = Capacitor.isNativePlatform();
  const nativePlatform = (Capacitor.getPlatform() as 'ios' | 'android' | 'web') || 'web';
  const isStandalonePwa =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;

  const ua = window.navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isIosSafariBrowser = isIos && !isNativeApp && !isStandalonePwa;
  const serviceWorkerSupported = 'serviceWorker' in navigator;
  const webPushSupported = serviceWorkerSupported && 'PushManager' in window && 'Notification' in window;

  return {
    isNativeApp,
    nativePlatform,
    isStandalonePwa,
    isIosSafariBrowser,
    webPushSupported,
    serviceWorkerSupported,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function sameServerKey(existingKey: ArrayBuffer | null | undefined, targetKey: Uint8Array): boolean {
  if (!existingKey) return true;
  const existingBytes = new Uint8Array(existingKey);
  if (existingBytes.length !== targetKey.length) return false;
  for (let i = 0; i < existingBytes.length; i++) {
    if (existingBytes[i] !== targetKey[i]) return false;
  }
  return true;
}

function markScopePushArmed(scope: string) {
  if (typeof window === 'undefined') return;
  try {
    const existing = JSON.parse(localStorage.getItem(ARMED_SCOPES_STORAGE_KEY) || '[]');
    const next = Array.from(new Set([...(Array.isArray(existing) ? existing : []), scope.toLowerCase()])).slice(-24);
    localStorage.setItem(ARMED_SCOPES_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

export function isScopePushPreviouslyArmed(scope: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const existing = JSON.parse(localStorage.getItem(ARMED_SCOPES_STORAGE_KEY) || '[]');
    return Array.isArray(existing) && existing.includes(scope.toLowerCase());
  } catch {
    return false;
  }
}

export async function reportGuestAudioKeepAliveArmed(scope: `pager:${string}` | `waitlist:${string}`): Promise<void> {
  const normalized = scope.toLowerCase();
  if (REPORTED_ARM_SCOPES.has(normalized)) return;
  REPORTED_ARM_SCOPES.add(normalized);
  try {
    if (normalized.startsWith('pager:')) {
      const token = normalized.slice('pager:'.length);
      await apiRequest('POST', `/api/public/pager/${token}/arm`, { mode: 'audio_keepalive' });
    } else if (normalized.startsWith('waitlist:')) {
      const token = normalized.slice('waitlist:'.length);
      await apiRequest('POST', `/api/public/waitlist-ticket/${token}/arm`, { mode: 'audio_keepalive' });
    }
  } catch {
    REPORTED_ARM_SCOPES.delete(normalized);
  }
}

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    void registration.update().catch(() => {});
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
  }
}

async function ensureValidWebPushSubscription(reg: ServiceWorkerRegistration, publicKey: string): Promise<PushSubscription> {
  const serverKeyBytes = urlBase64ToUint8Array(publicKey);
  let pushSub = await reg.pushManager.getSubscription();
  if (pushSub && !sameServerKey(pushSub.options?.applicationServerKey, serverKeyBytes)) {
    try {
      await pushSub.unsubscribe();
    } catch {}
    pushSub = null;
  }
  if (!pushSub) {
    pushSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKeyBytes,
    });
  }
  return pushSub;
}

/**
 * Silently binds Web Push for a guest pass on mount whenever Notification permission is already granted
 * (zero prompt, works immediately even when scanning a QR code from the phone camera).
 */
export async function autoSyncLockScreenPushIfPermitted(
  scope: `pager:${string}` | `waitlist:${string}`,
): Promise<{ ok: boolean; mode: 'web_push' | 'none' }> {
  const caps = detectDeviceCapabilities();
  if (!caps.webPushSupported || typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return { ok: false, mode: 'none' };
  }
  try {
    const reg = await registerPwaServiceWorker();
    if (!reg) return { ok: false, mode: 'none' };
    const keyRes = await fetch('/api/public/push/vapid-key');
    if (!keyRes.ok) return { ok: false, mode: 'none' };
    const { publicKey } = (await keyRes.json()) as { publicKey: string };
    const pushSub = await ensureValidWebPushSubscription(reg, publicKey);
    const serialized = pushSub.toJSON();
    await apiRequest('POST', '/api/public/push/subscribe', {
      scope,
      subscription: {
        platform: 'web_push',
        endpoint: serialized.endpoint,
        keys: serialized.keys,
      },
    });
    markScopePushArmed(scope);
    return { ok: true, mode: 'web_push' };
  } catch {
    return { ok: false, mode: 'none' };
  }
}

export async function subscribeGuestLockScreenPush(
  scope: `pager:${string}` | `waitlist:${string}`,
): Promise<{ ok: boolean; mode: 'native_push' | 'web_push' | 'audio_keepalive_only'; reason?: string }> {
  const caps = detectDeviceCapabilities();

  // 1. Native iOS / Android App via Capacitor PushNotifications plugin (if bundled in native shell)
  const capPlugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, any> } }).Capacitor?.Plugins;
  if (caps.isNativeApp && capPlugins?.PushNotifications) {
    try {
      const perm = await capPlugins.PushNotifications.requestPermissions();
      if (perm.receive === 'granted') {
        const tokenPromise = new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Native push token timeout')), 8000);
          capPlugins.PushNotifications.addListener('registration', (t: { value: string }) => {
            clearTimeout(timeout);
            resolve(t.value);
          });
          capPlugins.PushNotifications.addListener('registrationError', (err: any) => {
            clearTimeout(timeout);
            reject(err);
          });
        });
        await capPlugins.PushNotifications.register();
        const token = await tokenPromise;
        await apiRequest('POST', '/api/public/push/subscribe', {
          scope,
          subscription: {
            platform: caps.nativePlatform === 'ios' ? 'ios_apns' : 'android_fcm',
            endpoint: `https://native.dingzi.app/${caps.nativePlatform}/${encodeURIComponent(token)}`,
            nativeToken: token,
          },
        });
        markScopePushArmed(scope);
        return { ok: true, mode: 'native_push' };
      }
    } catch {
      // Fall back to Web Push / Audio Keep-Alive
    }
  }

  // 2. Standard VAPID Web Push (Android Chrome, Desktop, and Installed iOS 16.4+ Home-Screen PWA)
  if (caps.webPushSupported) {
    try {
      const permission =
        Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') {
        void reportGuestAudioKeepAliveArmed(scope);
        return { ok: false, mode: 'audio_keepalive_only', reason: 'Speaker keep-alive active (notifications muted)' };
      }
      const reg = await registerPwaServiceWorker();
      if (!reg) {
        void reportGuestAudioKeepAliveArmed(scope);
        return { ok: false, mode: 'audio_keepalive_only', reason: 'Speaker keep-alive active' };
      }

      const keyRes = await fetch('/api/public/push/vapid-key');
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const pushSub = await ensureValidWebPushSubscription(reg, publicKey);
      const serialized = pushSub.toJSON();
      await apiRequest('POST', '/api/public/push/subscribe', {
        scope,
        subscription: {
          platform: 'web_push',
          endpoint: serialized.endpoint,
          keys: serialized.keys,
        },
      });
      markScopePushArmed(scope);
      return { ok: true, mode: 'web_push' };
    } catch {
      void reportGuestAudioKeepAliveArmed(scope);
      return { ok: false, mode: 'audio_keepalive_only', reason: 'Speaker keep-alive active' };
    }
  }

  void reportGuestAudioKeepAliveArmed(scope);
  return {
    ok: false,
    mode: 'audio_keepalive_only',
    reason: caps.isIosSafariBrowser
      ? 'Lock-screen speaker keep-alive active · Add to Home Screen for closed-tab Push'
      : 'Lock-screen speaker keep-alive active',
  };
}

export async function subscribeStaffLockScreenPush(): Promise<{ ok: boolean; reason?: string }> {
  const caps = detectDeviceCapabilities();
  if (!caps.webPushSupported) {
    return { ok: false, reason: 'Enable in Chrome, Edge, Android PWA, or iOS Home-Screen PWA.' };
  }
  const permission =
    Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (permission !== 'granted') {
    return { ok: false, reason: 'Allow notifications in browser settings.' };
  }
  const reg = await registerPwaServiceWorker();
  if (!reg) return { ok: false, reason: 'Service worker failed to register.' };
  const keyRes = await fetch('/api/public/push/vapid-key');
  const { publicKey } = (await keyRes.json()) as { publicKey: string };
  const pushSub = await ensureValidWebPushSubscription(reg, publicKey);
  const serialized = pushSub.toJSON();
  await apiRequest('POST', '/api/hospitality/push/subscribe', {
    subscription: {
      platform: 'web_push',
      endpoint: serialized.endpoint,
      keys: serialized.keys,
    },
  });
  return { ok: true };
}
