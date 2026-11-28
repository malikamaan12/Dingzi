import { eq } from 'drizzle-orm';
import { db } from './db';
import { platformSettings, pushSubscriptions } from '@shared/schema';
import {
  createVapidAuthHeader,
  encryptWebPushAes128Gcm,
  generateVapidKeys,
  isAllowedPushEndpoint,
  type VapidKeyBundle,
} from './webPushCrypto';

export { isAllowedPushEndpoint };

const VAPID_SETTING_KEY = 'vapid_key_bundle_v1';
let cachedVapid: VapidKeyBundle | null = null;

export async function getOrCreateVapidKeys(): Promise<VapidKeyBundle> {
  if (cachedVapid) return cachedVapid;

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_JWK) {
    cachedVapid = {
      publicKeyBase64Url: process.env.VAPID_PUBLIC_KEY,
      privateJwk: JSON.parse(process.env.VAPID_PRIVATE_JWK),
      publicJwk: {},
    };
    return cachedVapid;
  }

  const [existing] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, VAPID_SETTING_KEY));
  if (existing?.value) {
    cachedVapid = existing.value as VapidKeyBundle;
    return cachedVapid;
  }

  const generated = await generateVapidKeys();
  await db
    .insert(platformSettings)
    .values({ key: VAPID_SETTING_KEY, value: generated })
    .onConflictDoNothing();
  const [stored] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, VAPID_SETTING_KEY));
  cachedVapid = (stored?.value as VapidKeyBundle) || generated;
  return cachedVapid;
}

export interface PushAlertPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  urgent?: boolean;
  ticketCode?: string;
}

export async function dispatchPushAlertToScopes(
  scopes: string[],
  payload: PushAlertPayload,
): Promise<{ attempted: number; delivered: number; pruned: number; statuses: number[] }> {
  const uniqueScopes = Array.from(new Set(scopes));
  if (!uniqueScopes.length) return { attempted: 0, delivered: 0, pruned: 0, statuses: [] };

  const allSubs = [];
  for (const scope of uniqueScopes) {
    const rows = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.scope, scope));
    allSubs.push(...rows);
  }

  if (!allSubs.length) return { attempted: 0, delivered: 0, pruned: 0, statuses: [] };

  const vapid = await getOrCreateVapidKeys();
  const jsonBody = JSON.stringify({
    ...payload,
    urgent: payload.urgent ?? true,
    sentAt: new Date().toISOString(),
  });

  let delivered = 0;
  let pruned = 0;
  const statuses: number[] = [];

  await Promise.allSettled(
    allSubs.map(async sub => {
      try {
        if (sub.platform === 'web_push' && sub.p256dh && sub.auth) {
          if (!isAllowedPushEndpoint(sub.endpoint)) return;
          const encrypted = await encryptWebPushAes128Gcm(jsonBody, sub.p256dh, sub.auth);
          const authorization = await createVapidAuthHeader(sub.endpoint, vapid);
          const response = await fetch(sub.endpoint, {
            method: 'POST',
            headers: {
              Authorization: authorization,
              'Content-Type': 'application/octet-stream',
              'Content-Encoding': 'aes128gcm',
              TTL: '300',
              Urgency: 'high',
              Topic: payload.tag.slice(0, 32).replace(/[^a-zA-Z0-9-_]/g, '-'),
            },
            body: encrypted as unknown as BodyInit,
            signal: AbortSignal.timeout(10_000),
          });
          statuses.push(response.status);
          if (response.status >= 200 && response.status < 300) {
            delivered++;
            await db
              .update(pushSubscriptions)
              .set({ lastDeliveredAt: new Date() })
              .where(eq(pushSubscriptions.id, sub.id));
          } else if (response.status === 404 || response.status === 410) {
            pruned++;
            await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
          }
        } else if (sub.platform === 'android_fcm' && sub.nativeToken && process.env.FCM_LEGACY_OR_BEARER_KEY) {
          const response = await fetch('https://fcm.googleapis.com/fcm/send', {
            method: 'POST',
            headers: {
              Authorization: `key=${process.env.FCM_LEGACY_OR_BEARER_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              to: sub.nativeToken,
              priority: 'high',
              android: {
                priority: 'high',
                notification: {
                  channel_id: 'pager_critical_alarm',
                  sound: 'default',
                  default_vibrate_timings: false,
                  vibrate_timings: ['0.0s', '0.5s', '0.15s', '0.5s', '0.15s', '0.8s'],
                  visibility: 'PUBLIC',
                },
              },
              notification: { title: payload.title, body: payload.body, sound: 'default' },
              data: payload,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          statuses.push(response.status);
          if (response.ok) delivered++;
        }
      } catch {
        statuses.push(0);
      }
    }),
  );

  return { attempted: allSubs.length, delivered, pruned, statuses };
}
