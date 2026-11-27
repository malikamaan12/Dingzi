import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated, isSuperAdmin } from '../localAuth';
import { getManagedCafe } from '../accessControl';
import { publishRealtimeEvent } from '../realtimeHub';
import { aggregatorClicks, aggregatorLinks, diningTables, diningZones, guestOrders, pagerTickets, serviceBays, smartTagHardwareKinds, smartTags, smartTagTargetTypes, tableReservations, tenants, waitlistEntries } from '@shared/schema';
import { branchLocalDate } from './helpers';

export function mountSmartTagsAndAnalyticsRoutes(app: Express) {
  app.get('/api/hospitality/smart-tags', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [tags, tables, bays, activeTickets] = await Promise.all([
        db
          .select()
          .from(smartTags)
          .where(eq(smartTags.restaurantId, cafe.id))
          .orderBy(asc(smartTags.tagCode)),
        db
          .select()
          .from(diningTables)
          .where(eq(diningTables.restaurantId, cafe.id))
          .orderBy(asc(diningTables.tableCode)),
        db
          .select()
          .from(serviceBays)
          .where(eq(serviceBays.restaurantId, cafe.id))
          .orderBy(asc(serviceBays.order), asc(serviceBays.code)),
        db
          .select()
          .from(pagerTickets)
          .where(
            and(
              eq(pagerTickets.restaurantId, cafe.id),
              inArray(pagerTickets.status, ['waiting', 'preparing', 'ready']),
            ),
          )
          .orderBy(asc(pagerTickets.queuedAt)),
      ]);
      const activeTicketIds = new Set(activeTickets.map(t => t.id));
      const reusableCoasters = tags.filter(t => t.targetType === 'reusable_pager');
      res.json({
        tags,
        tables,
        bays,
        activeTickets,
        summary: {
          totalTags: tags.length,
          reusableCoasters: reusableCoasters.length,
          activeCoasters: reusableCoasters.filter(t => t.activeTicketId && activeTicketIds.has(t.activeTicketId)).length,
          totalQrScans: tags.reduce((s, t) => s + (t.qrScans || 0), 0),
          totalNfcTaps: tags.reduce((s, t) => s + (t.nfcTaps || 0), 0),
        },
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/smart-tags', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          tagCode: z
            .string()
            .trim()
            .min(1)
            .max(40)
            .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, numbers, hyphens, or underscores for the tag code'),
          label: z.string().trim().min(1).max(120),
          hardwareKind: z.enum(smartTagHardwareKinds).default('dual_qr_nfc'),
          targetType: z.enum(smartTagTargetTypes).default('venue_menu'),
          tableId: z.string().uuid().optional().nullable(),
          bayId: z.string().uuid().optional().nullable(),
        })
        .strict()
        .parse(req.body);

      const normalizedCode = body.tagCode.toUpperCase();
      const [dup] = await db
        .select({ id: smartTags.id })
        .from(smartTags)
        .where(and(eq(smartTags.restaurantId, cafe.id), sql`upper(${smartTags.tagCode}) = ${normalizedCode}`));
      if (dup) {
        return res.status(409).json({ message: `Smart tag code ${normalizedCode} already exists in this branch.` });
      }

      if (body.targetType === 'dining_table') {
        if (!body.tableId) return res.status(400).json({ message: 'Select a dining table for this smart tag.' });
        const [tbl] = await db
          .select({ id: diningTables.id })
          .from(diningTables)
          .where(and(eq(diningTables.id, body.tableId), eq(diningTables.restaurantId, cafe.id)));
        if (!tbl) return res.status(400).json({ message: 'Selected table does not belong to this branch.' });
      }
      if (body.targetType === 'curbside_bay') {
        if (!body.bayId) return res.status(400).json({ message: 'Select a curbside or drive-thru bay for this smart tag.' });
        const [bay] = await db
          .select({ id: serviceBays.id })
          .from(serviceBays)
          .where(and(eq(serviceBays.id, body.bayId), eq(serviceBays.restaurantId, cafe.id)));
        if (!bay) return res.status(400).json({ message: 'Selected bay does not belong to this branch.' });
      }

      const [tag] = await db
        .insert(smartTags)
        .values({
          restaurantId: cafe.id,
          tagCode: normalizedCode,
          label: body.label,
          hardwareKind: body.hardwareKind,
          targetType: body.targetType,
          tableId: body.targetType === 'dining_table' ? body.tableId || null : null,
          bayId: body.targetType === 'curbside_bay' ? body.bayId || null : null,
        })
        .returning();

      res.status(201).json({ tag });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/smart-tags/bulk-coasters', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          prefix: z
            .string()
            .trim()
            .min(2)
            .max(20)
            .regex(/^[A-Za-z0-9]+$/, 'Prefix may contain letters and digits only')
            .default('COASTER'),
          count: z.number().int().min(1).max(50).default(5),
        })
        .strict()
        .parse(req.body);

      const prefixUpper = body.prefix.toUpperCase();
      const existing = await db
        .select({ tagCode: smartTags.tagCode })
        .from(smartTags)
        .where(eq(smartTags.restaurantId, cafe.id));
      const existingSet = new Set(existing.map(r => r.tagCode.toUpperCase()));

      const toInsert: (typeof smartTags.$inferInsert)[] = [];
      let seq = 1;
      while (toInsert.length < body.count && seq <= 999) {
        const candidate = `${prefixUpper}-${String(seq).padStart(2, '0')}`;
        if (!existingSet.has(candidate)) {
          existingSet.add(candidate);
          toInsert.push({
            restaurantId: cafe.id,
            tagCode: candidate,
            label: `Reusable Pager Coaster #${String(seq).padStart(2, '0')}`,
            hardwareKind: 'coaster_puck',
            targetType: 'reusable_pager',
          });
        }
        seq++;
      }

      const created = toInsert.length
        ? await db.insert(smartTags).values(toInsert).returning()
        : [];
      res.status(201).json({ tags: created });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/hospitality/smart-tags/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const tagId = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          label: z.string().trim().min(1).max(120).optional(),
          hardwareKind: z.enum(smartTagHardwareKinds).optional(),
          targetType: z.enum(smartTagTargetTypes).optional(),
          tableId: z.string().uuid().nullable().optional(),
          bayId: z.string().uuid().nullable().optional(),
          isActive: z.boolean().optional(),
          rotateToken: z.boolean().optional(),
        })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(smartTags)
        .where(and(eq(smartTags.id, tagId), eq(smartTags.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Smart tag not found in this branch' });

      const nextTarget = body.targetType ?? existing.targetType;
      const nextTableId = body.tableId !== undefined ? body.tableId : existing.tableId;
      const nextBayId = body.bayId !== undefined ? body.bayId : existing.bayId;

      if (nextTarget === 'dining_table' && nextTableId) {
        const [tbl] = await db
          .select({ id: diningTables.id })
          .from(diningTables)
          .where(and(eq(diningTables.id, nextTableId), eq(diningTables.restaurantId, cafe.id)));
        if (!tbl) return res.status(400).json({ message: 'Selected table does not belong to this branch.' });
      }
      if (nextTarget === 'curbside_bay' && nextBayId) {
        const [bay] = await db
          .select({ id: serviceBays.id })
          .from(serviceBays)
          .where(and(eq(serviceBays.id, nextBayId), eq(serviceBays.restaurantId, cafe.id)));
        if (!bay) return res.status(400).json({ message: 'Selected bay does not belong to this branch.' });
      }

      const patch: Partial<typeof smartTags.$inferInsert> = {};
      if (body.label !== undefined) patch.label = body.label;
      if (body.hardwareKind !== undefined) patch.hardwareKind = body.hardwareKind;
      if (body.targetType !== undefined) patch.targetType = body.targetType;
      if (body.isActive !== undefined) patch.isActive = body.isActive;
      patch.tableId = nextTarget === 'dining_table' ? nextTableId || null : null;
      patch.bayId = nextTarget === 'curbside_bay' ? nextBayId || null : null;
      if (nextTarget !== 'reusable_pager') patch.activeTicketId = null;
      if (body.rotateToken) patch.token = randomUUID();

      const [updated] = await db
        .update(smartTags)
        .set(patch)
        .where(and(eq(smartTags.id, tagId), eq(smartTags.restaurantId, cafe.id)))
        .returning();

      res.json({ tag: updated });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/smart-tags/:id/assign-ticket', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const tagId = z.string().uuid().parse(req.params.id);
      const { ticketId } = z
        .object({ ticketId: z.string().uuid().nullable() })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(smartTags)
        .where(and(eq(smartTags.id, tagId), eq(smartTags.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Smart tag not found in this branch' });
      if (existing.targetType !== 'reusable_pager') {
        return res.status(400).json({ message: 'Only Reusable Pager Coaster tags can bind live tickets.' });
      }

      const result = await db.transaction(async tx => {
        let targetTicket = null;
        if (ticketId) {
          const [found] = await tx
            .select()
            .from(pagerTickets)
            .where(and(eq(pagerTickets.id, ticketId), eq(pagerTickets.restaurantId, cafe.id)));
          if (!found || !['waiting', 'preparing', 'ready'].includes(found.status)) {
            throw Object.assign(new Error('Active pager ticket not found in this branch.'), { status: 400 });
          }
          targetTicket = found;
          await tx
            .update(smartTags)
            .set({ activeTicketId: null })
            .where(and(eq(smartTags.restaurantId, cafe.id), eq(smartTags.activeTicketId, ticketId)));
          await tx
            .update(pagerTickets)
            .set({ lastCoasterId: tagId })
            .where(and(eq(pagerTickets.id, ticketId), eq(pagerTickets.restaurantId, cafe.id)));
        }
        const [updated] = await tx
          .update(smartTags)
          .set({ activeTicketId: ticketId })
          .where(and(eq(smartTags.id, tagId), eq(smartTags.restaurantId, cafe.id)))
          .returning();
        return { tag: updated, ticket: targetTicket };
      });

      publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${result.tag.token}`], {
        type: 'coaster.updated',
        branchId: cafe.id,
        data: result,
      });

      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/smart-tags/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const tagId = z.string().uuid().parse(req.params.id);
      const deleted = await db
        .delete(smartTags)
        .where(and(eq(smartTags.id, tagId), eq(smartTags.restaurantId, cafe.id)))
        .returning({ id: smartTags.id });
      if (!deleted.length) return res.status(404).json({ message: 'Smart tag not found in this branch' });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Live Restaurant Operations Command Center Snapshot (/admin)
  app.get('/api/hospitality/dashboard', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });

      const [
        cats,
        items,
        tickets,
        orders,
        zones,
        tables,
        reservations,
        waitlist,
        bays,
        tags,
        aggregators,
      ] = await Promise.all([
        storage.getCategoriesByRestaurantId(cafe.id),
        storage.getMenuItemsByRestaurantId(cafe.id),
        db
          .select()
          .from(pagerTickets)
          .where(eq(pagerTickets.restaurantId, cafe.id))
          .orderBy(asc(pagerTickets.queuedAt))
          .limit(250),
        db
          .select()
          .from(guestOrders)
          .where(eq(guestOrders.restaurantId, cafe.id))
          .orderBy(desc(guestOrders.createdAt))
          .limit(250),
        db.select().from(diningZones).where(eq(diningZones.restaurantId, cafe.id)),
        db.select().from(diningTables).where(eq(diningTables.restaurantId, cafe.id)),
        db
          .select()
          .from(tableReservations)
          .where(
            and(
              eq(tableReservations.restaurantId, cafe.id),
              inArray(tableReservations.status, ['confirmed', 'seated']),
            ),
          )
          .orderBy(asc(tableReservations.startAt))
          .limit(50),
        db
          .select()
          .from(waitlistEntries)
          .where(
            and(
              eq(waitlistEntries.restaurantId, cafe.id),
              inArray(waitlistEntries.status, ['waiting', 'ready']),
            ),
          )
          .orderBy(asc(waitlistEntries.joinedAt))
          .limit(50),
        db.select().from(serviceBays).where(eq(serviceBays.restaurantId, cafe.id)),
        db.select().from(smartTags).where(eq(smartTags.restaurantId, cafe.id)),
        db.select().from(aggregatorLinks).where(eq(aggregatorLinks.restaurantId, cafe.id)),
      ]);

      const nowMs = Date.now();
      const todayIso = branchLocalDate(cafe.timezone);
      const ordersById = new Map(orders.map(o => [o.id, o]));
      const baysById = new Map(bays.map(b => [b.id, b]));
      const tablesById = new Map(tables.map(t => [t.id, t]));

      const activeTickets = tickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status));
      const activeTicketIds = new Set(activeTickets.map(t => t.id));
      const overdueCount = activeTickets.filter(
        t => nowMs - new Date(t.queuedAt).getTime() >= 15 * 60_000,
      ).length;

      const todayOrders = orders.filter(o => {
        try {
          return (
            new Intl.DateTimeFormat('en-CA', {
              timeZone: cafe.timezone || 'Asia/Qatar',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date(o.createdAt)) === todayIso
          );
        } catch {
          return new Date(o.createdAt).toISOString().slice(0, 10) === todayIso;
        }
      });

      const todayRevenue = todayOrders
        .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue')
        .reduce((sum, o) => sum + Number(o.total), 0)
        .toFixed(2);
      const unpaidVenueCount = orders.filter(o => o.paymentStatus === 'pay_at_venue').length;

      const arrivedVehicles = activeTickets
        .filter(t => t.bayId || t.licensePlate)
        .map(t => ({
          id: t.id,
          ticketCode: t.ticketCode,
          status: t.status,
          bayCode: t.bayId ? baysById.get(t.bayId)?.code || null : null,
          vehicleColor: t.vehicleColor,
          vehicleType: t.vehicleType,
          licensePlate: t.licensePlate,
          etaStatus: t.etaStatus,
          arrivedAt: t.arrivedAt,
        }));

      const reusableCoasters = tags.filter(t => t.targetType === 'reusable_pager' && t.isActive);
      const activeCoasters = reusableCoasters.filter(
        t => t.activeTicketId && activeTicketIds.has(t.activeTicketId),
      ).length;

      const checklist = [
        {
          id: 'profile',
          label: 'Brand identity, logo & hours configured',
          done: Boolean(cafe.logoUrl && (cafe.openingHours || cafe.openTime)),
          href: '/admin/restaurant',
        },
        {
          id: 'slug',
          label: 'Branded short link (/v/:slug) published',
          done: Boolean(cafe.slug),
          href: '/admin/restaurant',
        },
        {
          id: 'menu',
          label: 'Menu categories & available items published',
          done: cats.length > 0 && items.some(i => i.isAvailable),
          href: '/admin/menu',
        },
        {
          id: 'floor',
          label: 'Dining zones & permanent table QRs configured',
          done: zones.length > 0 && tables.length > 0,
          href: '/admin/tables',
        },
        {
          id: 'curbside',
          label: 'Curbside bays or drive-thru lanes configured',
          done: !cafe.driveThruEnabled || bays.length > 0,
          href: '/admin/drive-thru',
        },
        {
          id: 'qr_nfc',
          label: 'QR & NFC smart tags or reusable coasters ready',
          done: tags.length > 0,
          href: '/admin/qr-code',
        },
      ];
      const completedSteps = checklist.filter(c => c.done).length;

      res.json({
        liveOps: {
          pagers: {
            activeTotal: activeTickets.length,
            waiting: activeTickets.filter(t => t.status === 'waiting').length,
            preparing: activeTickets.filter(t => t.status === 'preparing').length,
            ready: activeTickets.filter(t => t.status === 'ready').length,
            overdue: overdueCount,
            topActive: activeTickets.slice(0, 5).map(t => {
              const linkedOrder = t.orderId ? ordersById.get(t.orderId) : null;
              const lines = linkedOrder?.lineItems || [];
              return {
                id: t.id,
                ticketCode: t.ticketCode,
                status: t.status,
                customerName: t.customerName,
                queuedAt: t.queuedAt,
                orderNumber: linkedOrder?.orderNumber || null,
                preparedCount: lines.filter(l => Boolean(l.prepared)).length,
                totalLines: lines.length,
              };
            }),
          },
          orders: {
            todayCount: todayOrders.length,
            totalCount: orders.length,
            todayRevenue,
            unpaidVenueCount,
            currency: cafe.currency,
          },
          floor: {
            zonesCount: zones.length,
            tablesCount: tables.length,
            upcomingReservationsCount: reservations.length,
            waitingPartiesCount: waitlist.length,
            nextFloorItems: [
              ...waitlist.slice(0, 3).map(w => ({
                kind: 'waitlist' as const,
                id: w.id,
                code: w.ticketCode,
                guestName: w.guestName,
                partySize: w.partySize,
                status: w.status,
                timeLabel: 'Walk-in waiting',
              })),
              ...reservations.slice(0, 3).map(r => ({
                kind: 'reservation' as const,
                id: r.id,
                code: tablesById.get(r.tableId)?.tableCode || 'Table',
                guestName: r.guestName,
                partySize: r.partySize,
                status: r.status,
                timeLabel: new Date(r.startAt).toLocaleString('en-GB', {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })),
            ].slice(0, 5),
          },
          curbside: {
            driveThruEnabled: cafe.driveThruEnabled,
            baysCount: bays.length,
            arrivedCount: arrivedVehicles.length,
            arrivedVehicles: arrivedVehicles.slice(0, 4),
          },
          qrNfc: {
            totalSmartTags: tags.length,
            reusableCoasters: reusableCoasters.length,
            activeCoasters,
            totalQrScans: tags.reduce((s, t) => s + (t.qrScans || 0), 0),
            totalNfcTaps: tags.reduce((s, t) => s + (t.nfcTaps || 0), 0),
          },
          catalog: {
            categoriesCount: cats.length,
            totalItems: items.length,
            visibleItems: items.filter(i => i.isAvailable).length,
            soldOutItems: items.filter(i => !i.isAvailable).length,
            todaySpecials: items.filter(i => i.isAvailable && i.specialDate === todayIso).length,
            aggregatorsCount: aggregators.filter(a => a.isActive).length,
          },
        },
        readiness: {
          completedSteps,
          totalSteps: checklist.length,
          completionPct: Math.round((completedSteps / checklist.length) * 100),
          checklist,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // Branch SLA, Congestion, Channel & QR/NFC Analytics
  app.get('/api/hospitality/analytics', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [tickets, orders, reservations, waitlist, clicks, tags, allItems] = await Promise.all([
        db.select().from(pagerTickets).where(eq(pagerTickets.restaurantId, cafe.id)),
        db.select().from(guestOrders).where(eq(guestOrders.restaurantId, cafe.id)),
        db.select().from(tableReservations).where(eq(tableReservations.restaurantId, cafe.id)),
        db.select().from(waitlistEntries).where(eq(waitlistEntries.restaurantId, cafe.id)),
        db.select().from(aggregatorClicks).where(eq(aggregatorClicks.restaurantId, cafe.id)),
        db.select().from(smartTags).where(eq(smartTags.restaurantId, cafe.id)),
        storage.getMenuItemsByRestaurantId(cafe.id),
      ]);

      const completedWithReady = tickets.filter(t => t.readyAt && t.queuedAt);
      const prepDurationsMins = completedWithReady.map(
        t => Math.max(0, (new Date(t.readyAt!).getTime() - new Date(t.queuedAt).getTime()) / 60_000),
      );
      const avgPrepMins = prepDurationsMins.length
        ? Number((prepDurationsMins.reduce((a, b) => a + b, 0) / prepDurationsMins.length).toFixed(1))
        : 0;
      const withinSlaCount = prepDurationsMins.filter(m => m <= 10).length;
      const slaCompliancePct = prepDurationsMins.length
        ? Math.round((withinSlaCount / prepDurationsMins.length) * 100)
        : 100;

      const hourlyPrepSums = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
      const hourlyBuckets = Array.from({ length: 24 }, (_, hour) => ({ hour, tickets: 0, orders: 0, avgPrepMins: 0 }));
      for (const t of tickets) {
        const hour = new Date(t.queuedAt).getHours();
        hourlyBuckets[hour].tickets++;
        if (t.readyAt && t.queuedAt) {
          hourlyPrepSums[hour].sum += Math.max(0, (new Date(t.readyAt).getTime() - new Date(t.queuedAt).getTime()) / 60_000);
          hourlyPrepSums[hour].count++;
        }
      }
      for (const o of orders) {
        const hour = new Date(o.createdAt).getHours();
        hourlyBuckets[hour].orders++;
      }
      for (let h = 0; h < 24; h++) {
        if (hourlyPrepSums[h].count > 0) {
          hourlyBuckets[h].avgPrepMins = Number((hourlyPrepSums[h].sum / hourlyPrepSums[h].count).toFixed(1));
        }
      }

      const clicksByPlatform: Record<string, number> = {};
      const clicksByItemId: Record<string, number> = {};
      for (const c of clicks) {
        clicksByPlatform[c.platform] = (clicksByPlatform[c.platform] || 0) + 1;
        if (c.menuItemId) {
          clicksByItemId[c.menuItemId] = (clicksByItemId[c.menuItemId] || 0) + 1;
        }
      }
      const itemNameById = new Map(allItems.map(i => [i.id, i.name]));
      const topClickedItems = Object.entries(clicksByItemId)
        .map(([itemId, count]) => ({ itemId, name: itemNameById.get(itemId) || 'Menu Item', clicks: count }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 8);

      const ratings = tickets.map(t => t.rating).filter((r): r is number => typeof r === 'number');
      const avgRating = ratings.length
        ? Number((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(2))
        : null;

      const ordersByChannel: Record<string, { count: number; revenue: number }> = {};
      for (const o of orders) {
        const bucket = ordersByChannel[o.channel] || { count: 0, revenue: 0 };
        bucket.count += 1;
        if (o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue') {
          bucket.revenue += Number(o.total);
        }
        ordersByChannel[o.channel] = bucket;
      }

      const totalQrScans = tags.reduce((s, t) => s + (t.qrScans || 0), 0);
      const totalNfcTaps = tags.reduce((s, t) => s + (t.nfcTaps || 0), 0);
      const topSmartTags = [...tags]
        .sort((a, b) => (b.qrScans + b.nfcTaps) - (a.qrScans + a.nfcTaps))
        .slice(0, 6)
        .map(t => ({
          id: t.id,
          tagCode: t.tagCode,
          label: t.label,
          targetType: t.targetType,
          qrScans: t.qrScans,
          nfcTaps: t.nfcTaps,
        }));

      res.json({
        summary: {
          totalTickets: tickets.length,
          activeTickets: tickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status)).length,
          avgPrepMins,
          slaCompliancePct,
          avgRating,
          ratingsCount: ratings.length,
          totalOrders: orders.length,
          paidRevenue: orders
            .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue')
            .reduce((sum, o) => sum + Number(o.total), 0)
            .toFixed(2),
          currency: cafe.currency,
          reservationsCount: reservations.filter(r => r.status !== 'cancelled').length,
          waitlistCount: waitlist.length,
          aggregatorClicksTotal: clicks.length,
          totalQrScans,
          totalNfcTaps,
          smartTagsCount: tags.length,
        },
        ordersByChannel: Object.fromEntries(
          Object.entries(ordersByChannel).map(([k, v]) => [k, { count: v.count, revenue: v.revenue.toFixed(2) }]),
        ),
        topSmartTags,
        clicksByPlatform,
        topClickedItems,
        hourlyBuckets,
      });
    } catch (e) {
      next(e);
    }
  });

  // Super Admin Platform Network & Multi-Branch Comparison Analytics
  app.get('/api/super-admin/portfolio-analytics', isSuperAdmin, async (_req, res, next) => {
    try {
      const [cafes, tickets, orders, reservations, clicks, tags, waitlist, allTenants, allUsers] = await Promise.all([
        storage.getAllRestaurants(),
        db.select().from(pagerTickets),
        db.select().from(guestOrders),
        db.select().from(tableReservations),
        db.select().from(aggregatorClicks),
        db.select().from(smartTags),
        db.select().from(waitlistEntries),
        db.select().from(tenants),
        storage.getAllUsers(),
      ]);

      const branches = cafes.map(cafe => {
        const branchTickets = tickets.filter(t => t.restaurantId === cafe.id);
        const activeTickets = branchTickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status)).length;
        const readyTickets = branchTickets.filter(t => t.readyAt && t.queuedAt);
        const avgPrepMins = readyTickets.length
          ? Number(
              (
                readyTickets.reduce(
                  (sum, t) => sum + Math.max(0, (new Date(t.readyAt!).getTime() - new Date(t.queuedAt).getTime()) / 60_000),
                  0,
                ) / readyTickets.length
              ).toFixed(1),
            )
          : 0;
        const branchOrders = orders.filter(o => o.restaurantId === cafe.id);
        const revenue = branchOrders
          .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue')
          .reduce((sum, o) => sum + Number(o.total), 0)
          .toFixed(2);
        const branchRes = reservations.filter(r => r.restaurantId === cafe.id && r.status !== 'cancelled');
        const branchClicks = clicks.filter(c => c.restaurantId === cafe.id);
        const branchTags = tags.filter(t => t.restaurantId === cafe.id);
        const qrScans = branchTags.reduce((s, t) => s + (t.qrScans || 0), 0);
        const nfcTaps = branchTags.reduce((s, t) => s + (t.nfcTaps || 0), 0);
        const waitlistWaiting = waitlist.filter(w => w.restaurantId === cafe.id && ['waiting', 'ready'].includes(w.status)).length;

        return {
          id: cafe.id,
          name: cafe.name,
          slug: cafe.slug,
          status: cafe.status,
          hidden: cafe.hidden,
          tenantId: cafe.tenantId,
          orderingMode: cafe.orderingMode,
          currency: cafe.currency,
          activeTickets,
          totalTickets: branchTickets.length,
          avgPrepMins,
          totalOrders: branchOrders.length,
          revenue,
          reservations: branchRes.length,
          waitlistWaiting,
          aggregatorClicks: branchClicks.length,
          smartTagsCount: branchTags.length,
          qrScans,
          nfcTaps,
        };
      });

      const totals = {
        totalRestaurants: cafes.length,
        livePublicMenus: cafes.filter(c => c.status === 'active' && !c.hidden).length,
        pausedRestaurants: cafes.filter(c => c.status !== 'active').length,
        tenantGroupsCount: allTenants.length,
        totalUsers: allUsers.length,
        activeTicketsNow: branches.reduce((s, b) => s + b.activeTickets, 0),
        totalTickets: tickets.length,
        totalOrders: orders.length,
        settledRevenueTotal: branches.reduce((s, b) => s + Number(b.revenue), 0).toFixed(2),
        reservationsCount: branches.reduce((s, b) => s + b.reservations, 0),
        waitlistWaitingNow: branches.reduce((s, b) => s + b.waitlistWaiting, 0),
        smartTagsCount: tags.length,
        totalQrScans: branches.reduce((s, b) => s + b.qrScans, 0),
        totalNfcTaps: branches.reduce((s, b) => s + b.nfcTaps, 0),
      };

      res.json({ totals, branches });
    } catch (e) {
      next(e);
    }
  });

  // ===== ORDERS & RECEIPTS CONSOLE + POS COUNTER ENTRY =====

}
