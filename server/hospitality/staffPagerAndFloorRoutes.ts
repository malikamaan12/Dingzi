import type { Express } from 'express';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated } from '../localAuth';
import { getManagedCafe } from '../accessControl';
import { publishRealtimeEvent } from '../realtimeHub';
import { deferRequestTask } from '../workerContext';
import { dispatchPushAlertToScopes } from '../pushService';
import { aggregatorLinks, diningTables, diningZones, guestOrders, pagerTickets, serviceBays, smartTags, tableReservations, waitlistEntries, type OrderLineItem, type SmartTag } from '@shared/schema';
import { resolveVenueConfig } from '@shared/venueConfig';
import { branchLocalDate, nextDailyPagerCode, nextWaitlistCode } from './helpers';

export function mountStaffPagerAndFloorRoutes(app: Express) {
  app.get('/api/hospitality/pagers', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [tickets, orders, bays, coasters] = await Promise.all([
        db
          .select()
          .from(pagerTickets)
          .where(eq(pagerTickets.restaurantId, cafe.id))
          .orderBy(asc(pagerTickets.queuedAt))
          .limit(200),
        db
          .select()
          .from(guestOrders)
          .where(eq(guestOrders.restaurantId, cafe.id))
          .orderBy(desc(guestOrders.createdAt))
          .limit(100),
        db
          .select()
          .from(serviceBays)
          .where(eq(serviceBays.restaurantId, cafe.id))
          .orderBy(asc(serviceBays.order)),
        db
          .select()
          .from(smartTags)
          .where(and(eq(smartTags.restaurantId, cafe.id), eq(smartTags.targetType, 'reusable_pager'), eq(smartTags.isActive, true)))
          .orderBy(asc(smartTags.tagCode)),
      ]);
      res.json({ tickets, orders, bays, coasters });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/pagers/issue', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const cfg = resolveVenueConfig(cafe.venueConfig);
      const body = z
        .object({
          mode: z.enum(['auto_number', 'pos_invoice']).default('auto_number'),
          invoiceNumber: z.string().trim().max(40).optional(),
          customerName: z.string().trim().max(120).nullable().optional(),
          channel: z.enum(['counter_pickup', 'dine_in', 'curbside', 'drive_thru']).optional(),
          notes: z.string().trim().max(300).nullable().optional(),
          estimatedPrepMins: z.number().int().min(1).max(180).optional(),
          bayId: z.string().uuid().optional().nullable(),
          smartTagId: z.string().uuid().optional().nullable(),
        })
        .strict()
        .parse(req.body);

      if (body.mode === 'pos_invoice' && !body.invoiceNumber?.trim()) {
        return res.status(400).json({ message: 'Enter the POS invoice or receipt number.' });
      }

      const ticketDate = branchLocalDate(cafe.timezone);
      const { ticket, coaster } = await db.transaction(async tx => {
        let targetCoaster: SmartTag | undefined;
        if (body.smartTagId) {
          const [found] = await tx
            .select()
            .from(smartTags)
            .where(and(eq(smartTags.id, body.smartTagId), eq(smartTags.restaurantId, cafe.id)))
            .for('update');
          if (!found || !found.isActive || found.targetType !== 'reusable_pager') {
            throw Object.assign(new Error('Selected reusable NFC/QR coaster is unavailable.'), { status: 400 });
          }
          targetCoaster = found;
        }

        const auto = body.mode === 'auto_number'
          ? await nextDailyPagerCode(tx as any, cafe.id, ticketDate, cfg.pagerTicketPrefix)
          : null;
        const ticketCode = auto ? auto.code : body.invoiceNumber!.trim().toUpperCase();
        const [created] = await tx
          .insert(pagerTickets)
          .values({
            restaurantId: cafe.id,
            bayId: body.bayId || null,
            ticketCode,
            ticketDate,
            dailySeq: auto?.seq ?? null,
            source: body.mode,
            status: 'waiting',
            customerName: body.customerName || null,
            notes: body.notes || null,
            estimatedPrepMins: body.estimatedPrepMins ?? cfg.defaultPrepMins,
            lastCoasterId: targetCoaster?.id || null,
          })
          .returning();

        let boundCoaster: SmartTag | null = null;
        if (targetCoaster) {
          const [updatedTag] = await tx
            .update(smartTags)
            .set({ activeTicketId: created.id })
            .where(eq(smartTags.id, targetCoaster.id))
            .returning();
          boundCoaster = updatedTag || null;
        }
        return { ticket: created, coaster: boundCoaster };
      });

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${ticket.trackingToken}`], {
        type: 'pager.created',
        branchId: cafe.id,
        data: { ticket, coaster },
      });
      if (coaster) {
        publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${coaster.token}`], {
          type: 'coaster.updated',
          branchId: cafe.id,
          data: { tag: coaster, ticket },
        });
      }

      res.status(201).json({ ticket, coaster });
    } catch (e) {
      next(e);
    }
  });

  // Per-Item Order Prep Checkoff (atomic row-locked JSONB toggle + auto-start 'preparing')
  app.post('/api/hospitality/pagers/:id/line-items/:lineIndex/toggle', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const id = z.string().uuid().parse(req.params.id);
      const lineIndex = z.coerce.number().int().min(0).max(99).parse(req.params.lineIndex);
      const body = z
        .object({ prepared: z.boolean().optional() })
        .strict()
        .parse(req.body || {});

      const result = await db.transaction(async tx => {
        const [ticket] = await tx
          .select()
          .from(pagerTickets)
          .where(and(eq(pagerTickets.id, id), eq(pagerTickets.restaurantId, cafe.id)))
          .for('update');
        if (!ticket) {
          throw Object.assign(new Error('Pager ticket not found in this branch'), { status: 404 });
        }
        if (!ticket.orderId) {
          throw Object.assign(new Error('This pager ticket does not have itemized order lines.'), { status: 400 });
        }

        const [order] = await tx
          .select()
          .from(guestOrders)
          .where(and(eq(guestOrders.id, ticket.orderId), eq(guestOrders.restaurantId, cafe.id)))
          .for('update');
        if (!order) {
          throw Object.assign(new Error('Linked order not found in this branch'), { status: 404 });
        }

        const currentLines = Array.isArray(order.lineItems) ? order.lineItems : [];
        if (lineIndex < 0 || lineIndex >= currentLines.length) {
          throw Object.assign(new Error('Order line item index out of range'), { status: 400 });
        }

        const nextPrepared =
          body.prepared !== undefined ? body.prepared : !Boolean(currentLines[lineIndex]?.prepared);
        const nowIso = new Date().toISOString();
        const nextLines: OrderLineItem[] = currentLines.map((li, idx) =>
          idx === lineIndex
            ? {
                ...li,
                prepared: nextPrepared,
                preparedAt: nextPrepared ? nowIso : null,
              }
            : li,
        );

        const [updatedOrder] = await tx
          .update(guestOrders)
          .set({ lineItems: nextLines })
          .where(eq(guestOrders.id, order.id))
          .returning();

        let updatedTicket = ticket;
        if (ticket.status === 'waiting' && nextPrepared) {
          const [promoted] = await tx
            .update(pagerTickets)
            .set({
              status: 'preparing',
              preparingAt: ticket.preparingAt || new Date(),
            })
            .where(eq(pagerTickets.id, ticket.id))
            .returning();
          if (promoted) updatedTicket = promoted;
        }

        const preparedCount = nextLines.filter(l => Boolean(l.prepared)).length;
        return {
          ticket: updatedTicket,
          order: updatedOrder,
          preparedCount,
          totalCount: nextLines.length,
        };
      });

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${result.ticket.trackingToken}`], {
        type: 'pager.updated',
        branchId: cafe.id,
        data: result,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/pagers/:id/transition', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const id = z.string().uuid().parse(req.params.id);
      const { action, targetStatus } = z
        .object({
          action: z.enum(['preparing', 'ready', 'rebuzz', 'collected', 'no_show', 'confirm_venue_payment', 'recall']),
          targetStatus: z.enum(['waiting', 'preparing', 'ready']).optional(),
        })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(pagerTickets)
        .where(and(eq(pagerTickets.id, id), eq(pagerTickets.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Pager ticket not found in this branch' });

      if (action === 'recall') {
        const now = new Date();
        let restoredStatus: 'waiting' | 'preparing' | 'ready';
        if (targetStatus) {
          restoredStatus = targetStatus;
        } else if (existing.status === 'collected' || existing.status === 'no_show') {
          restoredStatus = existing.readyAt ? 'ready' : existing.preparingAt ? 'preparing' : 'waiting';
        } else if (existing.status === 'ready') {
          restoredStatus = 'preparing';
        } else if (existing.status === 'preparing') {
          restoredStatus = 'waiting';
        } else {
          return res.status(400).json({ message: 'Ticket is already at the start of the queue.' });
        }

        const { recalledTicket, reboundCoaster } = await db.transaction(async tx => {
          const recallPatch: Partial<typeof pagerTickets.$inferInsert> = {
            status: restoredStatus,
            collectedAt: null,
            recalledCount: (existing.recalledCount || 0) + 1,
          };
          if (restoredStatus === 'preparing') {
            recallPatch.readyAt = null;
            recallPatch.preparingAt = existing.preparingAt || now;
          } else if (restoredStatus === 'waiting') {
            recallPatch.readyAt = null;
            recallPatch.preparingAt = null;
          }

          const [savedTicket] = await tx
            .update(pagerTickets)
            .set(recallPatch)
            .where(eq(pagerTickets.id, existing.id))
            .returning();

          let reattached: SmartTag | null = null;
          if (
            (existing.status === 'collected' || existing.status === 'no_show') &&
            existing.lastCoasterId
          ) {
            const [idleCoaster] = await tx
              .select()
              .from(smartTags)
              .where(
                and(
                  eq(smartTags.id, existing.lastCoasterId),
                  eq(smartTags.restaurantId, cafe.id),
                  eq(smartTags.isActive, true),
                  eq(smartTags.targetType, 'reusable_pager'),
                  sql`${smartTags.activeTicketId} IS NULL`,
                ),
              )
              .for('update');
            if (idleCoaster) {
              const [updatedTag] = await tx
                .update(smartTags)
                .set({ activeTicketId: savedTicket.id })
                .where(eq(smartTags.id, idleCoaster.id))
                .returning();
              reattached = updatedTag || null;
            }
          }

          return { recalledTicket: savedTicket, reboundCoaster: reattached };
        });

        publishRealtimeEvent([`branch:${cafe.id}`, `pager:${recalledTicket.trackingToken}`], {
          type: 'pager.updated',
          branchId: cafe.id,
          data: { ticket: recalledTicket, recalled: true },
        });
        if (reboundCoaster) {
          publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${reboundCoaster.token}`], {
            type: 'coaster.updated',
            branchId: cafe.id,
            data: { tag: reboundCoaster, ticket: recalledTicket },
          });
        }

        return res.json({ ticket: recalledTicket, reboundCoaster });
      }

      if (action === 'confirm_venue_payment' && existing.orderId) {
        await db
          .update(guestOrders)
          .set({ paymentStatus: 'paid', paidAt: new Date() })
          .where(and(eq(guestOrders.id, existing.orderId), eq(guestOrders.restaurantId, cafe.id)));
        publishRealtimeEvent([`branch:${cafe.id}`, `pager:${existing.trackingToken}`], {
          type: 'order.paid',
          branchId: cafe.id,
          data: { ticketId: existing.id, orderId: existing.orderId },
        });
        return res.json({ ticket: existing, paymentConfirmed: true });
      }

      const cfg = resolveVenueConfig(cafe.venueConfig);
      const cooldownMs = cfg.rebuzzCooldownSecs * 1000;
      const now = new Date();
      if (action === 'rebuzz') {
        if (existing.status !== 'ready') {
          return res.status(400).json({ message: 'Mark the ticket Ready before re-buzzing.' });
        }
        if (existing.lastBuzzedAt && now.getTime() - new Date(existing.lastBuzzedAt).getTime() < cooldownMs) {
          const waitSecs = Math.ceil(
            (cooldownMs - (now.getTime() - new Date(existing.lastBuzzedAt).getTime())) / 1000,
          );
          return res.status(429).json({ message: `Cooldown active. Wait ${waitSecs}s before re-buzzing.` });
        }
        const [buzzed] = await db
          .update(pagerTickets)
          .set({ buzzCount: existing.buzzCount + 1, lastBuzzedAt: now })
          .where(eq(pagerTickets.id, existing.id))
          .returning();
        publishRealtimeEvent([`branch:${cafe.id}`, `pager:${buzzed.trackingToken}`], {
          type: 'pager.buzzed',
          branchId: cafe.id,
          data: { ticket: buzzed },
        });
        deferRequestTask(
          dispatchPushAlertToScopes([`pager:${buzzed.trackingToken}`], {
            title: `${cafe.name} · Order ${buzzed.ticketCode} Ready!`,
            body: `Reminder (#${buzzed.buzzCount}): Your order is waiting at the pickup counter.`,
            tag: `pager-${buzzed.ticketCode}`,
            url: `/pager/${buzzed.trackingToken}`,
            ticketCode: buzzed.ticketCode,
            urgent: true,
          }),
        );
        return res.json({ ticket: buzzed });
      }

      const patch: Partial<typeof pagerTickets.$inferInsert> = { status: action };
      if (action === 'preparing' && !existing.preparingAt) patch.preparingAt = now;
      if (action === 'ready') {
        if (!existing.preparingAt) patch.preparingAt = now;
        patch.readyAt = existing.readyAt || now;
        patch.buzzCount = existing.buzzCount + 1;
        patch.lastBuzzedAt = now;
      }
      if (action === 'collected' || action === 'no_show') {
        patch.collectedAt = now;
      }

      const [updated] = await db
        .update(pagerTickets)
        .set(patch)
        .where(eq(pagerTickets.id, existing.id))
        .returning();

      let releasedCoasters: SmartTag[] = [];
      if (action === 'collected' || action === 'no_show') {
        releasedCoasters = await db
          .update(smartTags)
          .set({ activeTicketId: null })
          .where(and(eq(smartTags.restaurantId, cafe.id), eq(smartTags.activeTicketId, existing.id)))
          .returning();
        for (const c of releasedCoasters) {
          publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${c.token}`], {
            type: 'coaster.updated',
            branchId: cafe.id,
            data: { tag: c, ticket: null },
          });
        }
      }

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${updated.trackingToken}`], {
        type: action === 'ready' ? 'pager.buzzed' : 'pager.updated',
        branchId: cafe.id,
        data: { ticket: updated },
      });
      if (action === 'ready') {
        deferRequestTask(
          dispatchPushAlertToScopes([`pager:${updated.trackingToken}`], {
            title: `${cafe.name} · Order ${updated.ticketCode} Ready!`,
            body: cfg.pagerReadySubtitle,
            tag: `pager-${updated.ticketCode}`,
            url: `/pager/${updated.trackingToken}`,
            ticketCode: updated.ticketCode,
            urgent: true,
          }),
        );
      }

      res.json({ ticket: updated });
    } catch (e) {
      next(e);
    }
  });

  // 1-Tap Out-of-Stock Item Snooze
  app.post('/api/hospitality/items/:id/snooze', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const itemId = z.string().uuid().parse(req.params.id);
      const { isAvailable } = z.object({ isAvailable: z.boolean() }).strict().parse(req.body);
      const items = await storage.getMenuItemsByRestaurantId(cafe.id);
      if (!items.some(i => i.id === itemId)) return res.status(404).json({ message: 'Item not found in this branch' });
      const updated = await storage.updateMenuItem(itemId, { isAvailable });
      res.json({ item: updated });
    } catch (e) {
      next(e);
    }
  });

  // 1-Tap Out-of-Stock Modifier Option Snooze (PRD §3 & §4.1.3)
  app.post('/api/hospitality/items/:id/modifiers/:optionId/snooze', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const itemId = z.string().uuid().parse(req.params.id);
      const optionId = z.string().uuid().parse(req.params.optionId);
      const { isAvailable } = z.object({ isAvailable: z.boolean() }).strict().parse(req.body);
      const items = await storage.getMenuItemsByRestaurantId(cafe.id);
      const target = items.find(i => i.id === itemId);
      if (!target) return res.status(404).json({ message: 'Item not found in this branch' });
      let found = false;
      const nextGroups = (target.modifierGroups || []).map(group => ({
        ...group,
        options: group.options.map(opt => {
          if (opt.id !== optionId) return opt;
          found = true;
          return { ...opt, isAvailable };
        }),
      }));
      if (!found) return res.status(404).json({ message: 'Modifier option not found on this item' });
      const updated = await storage.updateMenuItem(itemId, { modifierGroups: nextGroups });
      res.json({ item: updated });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 3: Staff Floor Zones, Tables, Reservations & Waitlist Management
  app.get('/api/hospitality/floor', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [zones, tables, reservations, waitlist] = await Promise.all([
        db.select().from(diningZones).where(eq(diningZones.restaurantId, cafe.id)).orderBy(asc(diningZones.order)),
        db.select().from(diningTables).where(eq(diningTables.restaurantId, cafe.id)).orderBy(asc(diningTables.tableCode)),
        db
          .select()
          .from(tableReservations)
          .where(eq(tableReservations.restaurantId, cafe.id))
          .orderBy(asc(tableReservations.startAt))
          .limit(200),
        db
          .select()
          .from(waitlistEntries)
          .where(eq(waitlistEntries.restaurantId, cafe.id))
          .orderBy(asc(waitlistEntries.joinedAt))
          .limit(200),
      ]);
      res.json({ zones, tables, reservations, waitlist });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/zones', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          name: z.string().trim().min(1).max(80),
          nameAr: z.string().trim().max(80).optional().nullable(),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [zone] = await db
        .insert(diningZones)
        .values({ restaurantId: cafe.id, name: body.name, nameAr: body.nameAr || null, order: body.order })
        .returning();
      res.status(201).json({ zone });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/zones/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(diningZones).where(and(eq(diningZones.id, req.params.id), eq(diningZones.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/tables', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          zoneId: z.string().uuid(),
          tableCode: z.string().trim().min(1).max(40),
          minCovers: z.number().int().min(1).max(30).default(1),
          maxCovers: z.number().int().min(1).max(30).default(4),
          isCombinable: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      if (body.maxCovers < body.minCovers) {
        return res.status(400).json({ message: 'Maximum covers must be at least minimum covers.' });
      }
      const [zone] = await db
        .select()
        .from(diningZones)
        .where(and(eq(diningZones.id, body.zoneId), eq(diningZones.restaurantId, cafe.id)));
      if (!zone) return res.status(400).json({ message: 'Choose a dining zone from this branch' });
      const [table] = await db
        .insert(diningTables)
        .values({
          restaurantId: cafe.id,
          zoneId: body.zoneId,
          tableCode: body.tableCode.toUpperCase(),
          minCovers: body.minCovers,
          maxCovers: body.maxCovers,
          isCombinable: body.isCombinable,
        })
        .returning();
      res.status(201).json({ table });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/tables/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(diningTables).where(and(eq(diningTables.id, req.params.id), eq(diningTables.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/reservations/:id/status', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const { status } = z
        .object({ status: z.enum(['confirmed', 'seated', 'completed', 'cancelled', 'no_show']) })
        .strict()
        .parse(req.body);
      const [updated] = await db
        .update(tableReservations)
        .set({ status, ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}) })
        .where(and(eq(tableReservations.id, req.params.id), eq(tableReservations.restaurantId, cafe.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Reservation not found' });
      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'reservation.updated',
        branchId: cafe.id,
        data: { reservation: updated },
      });
      res.json({ reservation: updated });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/waitlist/:id/action', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const { action } = z
        .object({ action: z.enum(['ready', 'rebuzz', 'seated', 'expired']) })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.id, req.params.id), eq(waitlistEntries.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Waitlist entry not found' });

      const cfg = resolveVenueConfig(cafe.venueConfig);
      const cooldownMs = cfg.rebuzzCooldownSecs * 1000;
      const now = new Date();
      if (action === 'rebuzz' && existing.lastBuzzedAt && now.getTime() - new Date(existing.lastBuzzedAt).getTime() < cooldownMs) {
        return res.status(429).json({ message: `Wait ${cfg.rebuzzCooldownSecs} seconds before re-buzzing this guest.` });
      }

      const patch: Partial<typeof waitlistEntries.$inferInsert> =
        action === 'ready' || action === 'rebuzz'
          ? {
              status: 'ready',
              readyAt: existing.readyAt || now,
              holdExpiresAt: new Date(now.getTime() + cfg.waitlistHoldMins * 60_000),
              buzzCount: existing.buzzCount + 1,
              lastBuzzedAt: now,
            }
          : action === 'seated'
            ? { status: 'seated', seatedAt: now, closedAt: now }
            : { status: 'expired', closedAt: now };

      const [updated] = await db
        .update(waitlistEntries)
        .set(patch)
        .where(eq(waitlistEntries.id, existing.id))
        .returning();

      publishRealtimeEvent([`branch:${cafe.id}`, `waitlist:${updated.trackingToken}`], {
        type: action === 'ready' || action === 'rebuzz' ? 'waitlist.buzzed' : 'waitlist.updated',
        branchId: cafe.id,
        data: { entry: updated },
      });
      if (action === 'ready' || action === 'rebuzz') {
        deferRequestTask(
          dispatchPushAlertToScopes([`waitlist:${updated.trackingToken}`], {
            title: `${cafe.name} · Your Table is Ready (${updated.ticketCode})!`,
            body: cfg.waitlistReadySubtitle.replace('{mins}', String(cfg.waitlistHoldMins)),
            tag: `waitlist-${updated.ticketCode}`,
            url: `/waitlist/${updated.trackingToken}`,
            ticketCode: updated.ticketCode,
            urgent: true,
          }),
        );
      }

      res.json({ entry: updated });
    } catch (e) {
      next(e);
    }
  });

  // Staff Desk Walk-In Waitlist Entry (works even if public guest waitlist is closed)
  app.post('/api/hospitality/waitlist', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          guestName: z.string().trim().min(1).max(100),
          guestPhone: z.string().trim().max(40).nullable().optional(),
          partySize: z.number().int().min(1).max(30),
          zoneId: z.string().uuid().nullable().optional(),
          notes: z.string().trim().max(300).nullable().optional(),
        })
        .strict()
        .parse(req.body);

      const cfg = resolveVenueConfig(cafe.venueConfig);
      const entry = await db.transaction(async tx => {
        const code = await nextWaitlistCode(tx as any, cafe.id, cfg.waitlistTicketPrefix);
        const [created] = await tx
          .insert(waitlistEntries)
          .values({
            restaurantId: cafe.id,
            zoneId: body.zoneId || null,
            ticketCode: code,
            guestName: body.guestName,
            guestPhone: body.guestPhone || null,
            partySize: body.partySize,
            status: 'waiting',
            notes: body.notes || null,
          })
          .returning();
        return created;
      });

      publishRealtimeEvent([`branch:${cafe.id}`, `waitlist:${entry.trackingToken}`], {
        type: 'waitlist.updated',
        branchId: cafe.id,
        data: { entry },
      });
      res.status(201).json({ entry });
    } catch (e) {
      next(e);
    }
  });

  // Staff Desk Phone / Walk-In Table Reservation
  app.post('/api/hospitality/reservations', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          guestName: z.string().trim().min(1).max(100),
          guestPhone: z.string().trim().max(40).nullable().optional(),
          partySize: z.number().int().min(1).max(30),
          startAt: z.string().datetime({ offset: true }).or(z.string().min(10)),
          durationMins: z.number().int().min(15).max(360).optional(),
          tableId: z.string().uuid().nullable().optional(),
          zoneId: z.string().uuid().nullable().optional(),
          notes: z.string().trim().max(400).nullable().optional(),
        })
        .strict()
        .parse(req.body);

      const start = new Date(body.startAt);
      if (Number.isNaN(start.getTime())) {
        return res.status(400).json({ message: 'Invalid reservation start time' });
      }
      const duration = body.durationMins || cafe.defaultTurnDurationMins || 90;
      const end = new Date(start.getTime() + duration * 60_000);

      let chosenTableId = body.tableId || null;
      if (!chosenTableId) {
        const candidateTables = await db
          .select()
          .from(diningTables)
          .where(
            and(
              eq(diningTables.restaurantId, cafe.id),
              eq(diningTables.isActive, true),
              ...(body.zoneId ? [eq(diningTables.zoneId, body.zoneId)] : []),
            ),
          )
          .orderBy(asc(diningTables.maxCovers));
        const fit = candidateTables.find(t => t.maxCovers >= body.partySize) || candidateTables[0];
        if (!fit) {
          return res.status(409).json({ message: 'Add at least one active dining table before booking.' });
        }
        chosenTableId = fit.id;
      }

      const [reservation] = await db
        .insert(tableReservations)
        .values({
          restaurantId: cafe.id,
          tableId: chosenTableId,
          zoneId: body.zoneId || null,
          guestName: body.guestName,
          guestPhone: body.guestPhone || '',
          partySize: body.partySize,
          startAt: start,
          endAt: end,
          status: 'confirmed',
          depositStatus: 'waived',
          depositAmount: '0',
          notes: body.notes || null,
        })
        .returning();

      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'reservation.updated',
        branchId: cafe.id,
        data: { reservation },
      });
      res.status(201).json({ reservation });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 4: Staff Drive-Thru Lanes & Curbside Bays
  app.get('/api/hospitality/bays', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [bays, activeVehicles] = await Promise.all([
        db.select().from(serviceBays).where(eq(serviceBays.restaurantId, cafe.id)).orderBy(asc(serviceBays.order), asc(serviceBays.code)),
        db
          .select()
          .from(pagerTickets)
          .where(
            and(
              eq(pagerTickets.restaurantId, cafe.id),
              inArray(pagerTickets.status, ['waiting', 'preparing', 'ready']),
              sql`(${pagerTickets.bayId} IS NOT NULL OR ${pagerTickets.licensePlate} IS NOT NULL)`,
            ),
          )
          .orderBy(asc(pagerTickets.arrivedAt), asc(pagerTickets.queuedAt)),
      ]);
      res.json({ bays, activeVehicles });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/bays', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          code: z.string().trim().min(1).max(40),
          label: z.string().trim().min(1).max(80),
          bayType: z.enum(['curbside', 'drive_thru']).default('curbside'),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [bay] = await db
        .insert(serviceBays)
        .values({
          restaurantId: cafe.id,
          code: body.code.toUpperCase(),
          label: body.label,
          bayType: body.bayType,
          order: body.order,
        })
        .returning();
      res.status(201).json({ bay });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/bays/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(serviceBays).where(and(eq(serviceBays.id, req.params.id), eq(serviceBays.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 5: Staff Aggregator Links Management
  app.get('/api/hospitality/aggregators', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const links = await db
        .select()
        .from(aggregatorLinks)
        .where(eq(aggregatorLinks.restaurantId, cafe.id))
        .orderBy(asc(aggregatorLinks.order));
      res.json({ aggregators: links });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/aggregators', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          platform: z.enum(['talabat', 'snoonu', 'keeta', 'custom']),
          displayName: z.string().trim().min(1).max(80),
          url: z.string().trim().url('Enter a valid https:// storefront URL').max(500),
          badgeEn: z.string().trim().max(80).optional().nullable(),
          badgeAr: z.string().trim().max(80).optional().nullable(),
          isActive: z.boolean().default(true),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [link] = await db
        .insert(aggregatorLinks)
        .values({
          restaurantId: cafe.id,
          platform: body.platform,
          displayName: body.displayName,
          url: body.url,
          badgeEn: body.badgeEn || null,
          badgeAr: body.badgeAr || null,
          isActive: body.isActive,
          order: body.order,
        })
        .returning();
      res.status(201).json({ aggregator: link });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/hospitality/aggregators/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          displayName: z.string().trim().min(1).max(80).optional(),
          url: z.string().trim().url().max(500).optional(),
          badgeEn: z.string().trim().max(80).nullable().optional(),
          badgeAr: z.string().trim().max(80).nullable().optional(),
          isActive: z.boolean().optional(),
          order: z.number().int().min(0).optional(),
        })
        .strict()
        .parse(req.body);
      const [updated] = await db
        .update(aggregatorLinks)
        .set(body)
        .where(and(eq(aggregatorLinks.id, req.params.id), eq(aggregatorLinks.restaurantId, cafe.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Aggregator link not found' });
      res.json({ aggregator: updated });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/aggregators/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db
        .delete(aggregatorLinks)
        .where(and(eq(aggregatorLinks.id, req.params.id), eq(aggregatorLinks.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ===== QR & NFC SMART TAG STUDIO + REUSABLE PAGER COASTERS =====

}
