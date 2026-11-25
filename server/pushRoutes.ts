import type { Express } from 'express';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { storage } from './storage';
import { isAuthenticated } from './localAuth';
import { getManagedCafe } from './accessControl';
import { rateLimit } from './httpSecurity';
import { pagerTickets, pushSubscriptions, waitlistEntries } from '@shared/schema';
import { dispatchPushAlertToScopes, getOrCreateVapidKeys, isAllowedPushEndpoint } from './pushService';

const subscriptionInputSchema = z
  .object({
    platform: z.enum(['web_push', 'android_fcm', 'ios_apns']).default('web_push'),
    endpoint: z
      .string()
      .url()
      .max(2000)
      .refine(isAllowedPushEndpoint, 'Push endpoint must use a public HTTPS push service origin'),
    keys: z
      .object({
        p256dh: z.string().min(20).max(256),
        auth: z.string().min(10).max(128),
      })
      .optional(),
    nativeToken: z.string().min(10).max(1024).optional(),
  })
  .strict();

async function resolvePublicScopeRestaurant(scope: string): Promise<{ restaurantId: string; code: string; url: string } | null> {
  const pagerMatch = scope.match(/^pager:([a-f0-9-]{36})$/i);
  if (pagerMatch) {
    const [ticket] = await db.select().from(pagerTickets).where(eq(pagerTickets.trackingToken, pagerMatch[1]));
    if (!ticket) return null;
    return { restaurantId: ticket.restaurantId, code: ticket.ticketCode, url: `/pager/${ticket.trackingToken}` };
  }
  const waitlistMatch = scope.match(/^waitlist:([a-f0-9-]{36})$/i);
  if (waitlistMatch) {
    const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.trackingToken, waitlistMatch[1]));
    if (!entry) return null;
    return { restaurantId: entry.restaurantId, code: entry.ticketCode, url: `/waitlist/${entry.trackingToken}` };
  }
  return null;
}

export function mountPushRoutes(app: Express) {
  // Public VAPID applicationServerKey endpoint for PushManager.subscribe()
  app.get('/api/public/push/vapid-key', async (_req, res, next) => {
    try {
      const vapid = await getOrCreateVapidKeys();
      res.json({ publicKey: vapid.publicKeyBase64Url });
    } catch (e) {
      next(e);
    }
  });

  // Guest Lock-Screen Push Subscription (Pager or Waitlist ticket)
  app.post('/api/public/push/subscribe', rateLimit(30, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const body = z
        .object({
          scope: z.string().regex(/^(?:pager|waitlist):[a-f0-9-]{36}$/i),
          subscription: subscriptionInputSchema,
        })
        .strict()
        .parse(req.body);

      const resolved = await resolvePublicScopeRestaurant(body.scope);
      if (!resolved) return res.status(404).json({ message: 'Ticket not found for push subscription' });

      const sub = body.subscription;
      if (sub.platform === 'web_push' && (!sub.keys?.p256dh || !sub.keys?.auth)) {
        return res.status(400).json({ message: 'Web Push requires p256dh and auth keys' });
      }

      const normalizedScope = body.scope.toLowerCase();
      await db
        .insert(pushSubscriptions)
        .values({
          scope: normalizedScope,
          restaurantId: resolved.restaurantId,
          platform: sub.platform,
          endpoint: sub.endpoint,
          p256dh: sub.keys?.p256dh || null,
          auth: sub.keys?.auth || null,
          nativeToken: sub.nativeToken || null,
          userAgent: String(req.get('User-Agent') || '').slice(0, 300) || null,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.scope, pushSubscriptions.endpoint],
          set: {
            p256dh: sub.keys?.p256dh || null,
            auth: sub.keys?.auth || null,
            nativeToken: sub.nativeToken || null,
          },
        });

      res.status(201).json({ subscribed: true, scope: normalizedScope });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/push/unsubscribe', async (req, res, next) => {
    try {
      const body = z
        .object({
          scope: z.string().regex(/^(?:pager|waitlist):[a-f0-9-]{36}$/i),
          endpoint: z.string().url().max(2000),
        })
        .strict()
        .parse(req.body);

      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.scope, body.scope.toLowerCase()),
            eq(pushSubscriptions.endpoint, body.endpoint),
          ),
        );
      res.json({ unsubscribed: true });
    } catch (e) {
      next(e);
    }
  });

  // Guest 1-tap Test Lock-Screen Push
  app.post('/api/public/push/test', rateLimit(10, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const { scope } = z
        .object({ scope: z.string().regex(/^(?:pager|waitlist):[a-f0-9-]{36}$/i) })
        .strict()
        .parse(req.body);

      const resolved = await resolvePublicScopeRestaurant(scope);
      if (!resolved) return res.status(404).json({ message: 'Ticket not found' });
      const restaurant = await storage.getRestaurantById(resolved.restaurantId);

      const stats = await dispatchPushAlertToScopes([scope.toLowerCase()], {
        title: `${restaurant?.name || 'Dingzi'} · Lock-Screen Test (${resolved.code})`,
        body: 'Dingzi lock-screen push & ringing verified! Your phone will alert you as soon as you are called.',
        tag: `test-${resolved.code}`,
        url: resolved.url,
        ticketCode: resolved.code,
        urgent: true,
      });

      res.json({ sent: true, ...stats });
    } catch (e) {
      next(e);
    }
  });

  // Protected Staff / Manager Push Diagnostics & Staff Lock-Screen Alerts
  app.get('/api/hospitality/push/status', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const vapid = await getOrCreateVapidKeys();
      const rows = await db
        .select({
          scope: pushSubscriptions.scope,
          platform: pushSubscriptions.platform,
        })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.restaurantId, cafe.id));

      const staffDevices = rows.filter(r => r.scope === `staff:${cafe.id}`).length;
      const guestDevices = rows.filter(r => r.scope !== `staff:${cafe.id}`).length;
      const nativeDevices = rows.filter(r => r.platform !== 'web_push').length;

      res.json({
        vapidPublicKey: vapid.publicKeyBase64Url,
        staffDevices,
        guestDevices,
        nativeDevices,
        totalSubscriptions: rows.length,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/push/subscribe', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const sub = subscriptionInputSchema.parse(req.body.subscription);
      const scope = `staff:${cafe.id}`;

      await db
        .insert(pushSubscriptions)
        .values({
          scope,
          restaurantId: cafe.id,
          platform: sub.platform,
          endpoint: sub.endpoint,
          p256dh: sub.keys?.p256dh || null,
          auth: sub.keys?.auth || null,
          nativeToken: sub.nativeToken || null,
          userAgent: String(req.get('User-Agent') || '').slice(0, 300) || null,
        })
        .onConflictDoUpdate({
          target: [pushSubscriptions.scope, pushSubscriptions.endpoint],
          set: {
            p256dh: sub.keys?.p256dh || null,
            auth: sub.keys?.auth || null,
            nativeToken: sub.nativeToken || null,
          },
        });

      res.status(201).json({ subscribed: true, scope });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/push/test', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const stats = await dispatchPushAlertToScopes([`staff:${cafe.id}`], {
        title: `${cafe.name} · Order & Curbside Alert Test`,
        body: 'Staff lock-screen push notifications are active for new orders and arrived vehicles.',
        tag: `staff-test-${cafe.id.slice(0, 8)}`,
        url: '/admin/pagers',
        urgent: true,
      });
      res.json({ sent: true, ...stats });
    } catch (e) {
      next(e);
    }
  });
}
