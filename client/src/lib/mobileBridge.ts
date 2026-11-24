import { Capacitor } from '@capacitor/core';
import { apiRequest } from './queryClient';

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

export async function registerPwaServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch {
    return null;
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
        return { ok: false, mode: 'audio_keepalive_only', reason: 'Notification permission denied' };
      }
      const reg = await registerPwaServiceWorker();
      if (!reg) return { ok: false, mode: 'audio_keepalive_only', reason: 'Service worker unavailable' };

      const keyRes = await fetch('/api/public/push/vapid-key');
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      let pushSub = await reg.pushManager.getSubscription();
      if (!pushSub) {
        pushSub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const serialized = pushSub.toJSON();
      await apiRequest('POST', '/api/public/push/subscribe', {
        scope,
        subscription: {
          platform: 'web_push',
          endpoint: serialized.endpoint,
          keys: serialized.keys,
        },
      });
      return { ok: true, mode: 'web_push' };
    } catch (e) {
      return { ok: false, mode: 'audio_keepalive_only', reason: (e as Error).message };
    }
  }

  return {
    ok: false,
    mode: 'audio_keepalive_only',
    reason: caps.isIosSafariBrowser
      ? 'Add to Home Screen on iPhone for background Web Push (Lock-Screen Audio Keep-Alive is active now)'
      : 'Push API unsupported in this browser (Audio Keep-Alive is active)',
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
  let pushSub = await reg.pushManager.getSubscription();
  if (!pushSub) {
    pushSub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
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
