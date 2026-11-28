import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated } from '../localAuth';
import { getManagedCafe } from '../accessControl';
import { rateLimit } from '../httpSecurity';
import { attachSseStream, publishRealtimeEvent } from '../realtimeHub';
import { deferRequestTask } from '../workerContext';
import { dispatchPushAlertToScopes } from '../pushService';
import { createPaymentCheckoutSession, verifyGatewaySignature } from '../payments/gateways';
import { customizationTotal, missingModifierGroups, reconcileModifierSelections, selectedModifierOptions, type MenuModifierSelections } from '@shared/menuCustomization';
import { aggregatorLinks, diningTables, diningZones, guestOrders, pagerTickets, restaurants, serviceBays, smartTags, tableReservations, waitlistEntries, type OrderLineItem, type SmartTag } from '@shared/schema';
import { computeOrderTotalsWithVenueFees, resolveVenueConfig } from '@shared/venueConfig';
import { branchLocalDate, loadBranchGatewaySecrets, nextDailyPagerCode, toPublicCafe } from './helpers';

export function mountPublicGuestOrdersRoutes(app: Express) {
  app.get('/api/public/stream/pager/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [ticket] = await db
        .select({ id: pagerTickets.id, restaurantId: pagerTickets.restaurantId })
        .from(pagerTickets)
        .where(eq(pagerTickets.trackingToken, token));
      if (!ticket) return res.status(404).json({ message: 'Pager ticket not found' });
      attachSseStream(res, `pager:${token}`, ticket.restaurantId);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/public/stream/waitlist/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [entry] = await db
        .select({ id: waitlistEntries.id, restaurantId: waitlistEntries.restaurantId })
        .from(waitlistEntries)
        .where(eq(waitlistEntries.trackingToken, token));
      if (!entry) return res.status(404).json({ message: 'Waitlist ticket not found' });
      attachSseStream(res, `waitlist:${token}`, entry.restaurantId);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/public/stream/coaster/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [tag] = await db
        .select({ id: smartTags.id, restaurantId: smartTags.restaurantId, isActive: smartTags.isActive })
        .from(smartTags)
        .where(eq(smartTags.token, token));
      if (!tag || !tag.isActive) return res.status(404).json({ message: 'Smart tag not found' });
      attachSseStream(res, `coaster:${token}`, tag.restaurantId);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/hospitality/stream', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      attachSseStream(res, `branch:${cafe.id}`);
    } catch (e) {
      next(e);
    }
  });

  // ===== PUBLIC GUEST ENDPOINTS (PILLARS 1–5) =====

  // Resolve permanent branded slug (/v/:slug)
  app.get('/api/public/venue-by-slug/:slug', async (req, res, next) => {
    try {
      const slug = z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .parse(req.params.slug);
      const [restaurant] = await db
        .select()
        .from(restaurants)
        .where(and(sql`lower(${restaurants.slug}) = ${slug}`, eq(restaurants.status, 'active'), eq(restaurants.hidden, false)));
      if (!restaurant) return res.status(404).json({ message: 'Venue not found' });
      res.json({ restaurant: toPublicCafe(restaurant) });
    } catch (e) {
      next(e);
    }
  });

  // Resolve permanent Curbside / Drive-Thru Bay QR (/bay/:qrToken)
  app.get('/api/public/bay/:qrToken', async (req, res, next) => {
    try {
      const qrToken = z.string().uuid().parse(req.params.qrToken);
      const [bay] = await db
        .select()
        .from(serviceBays)
        .where(and(eq(serviceBays.qrToken, qrToken), eq(serviceBays.isActive, true)));
      if (!bay) return res.status(404).json({ message: 'Service bay not found' });
      const restaurant = await storage.getRestaurantById(bay.restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }
      res.json({ restaurant: toPublicCafe(restaurant), bay });
    } catch (e) {
      next(e);
    }
  });

  // Resolve permanent Dine-In Table QR (/table/:qrToken)
  app.get('/api/public/table/:qrToken', async (req, res, next) => {
    try {
      const qrToken = z.string().uuid().parse(req.params.qrToken);
      const [table] = await db
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.qrToken, qrToken), eq(diningTables.isActive, true)));
      if (!table) return res.status(404).json({ message: 'Dining table QR not found' });
      const restaurant = await storage.getRestaurantById(table.restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }
      const [zone] = table.zoneId
        ? await db.select().from(diningZones).where(eq(diningZones.id, table.zoneId))
        : [];
      res.json({ restaurant: toPublicCafe(restaurant), table, zone: zone || null });
    } catch (e) {
      next(e);
    }
  });

  // Resolve Dynamic QR & NFC Smart Tags + Reusable Counter Pager Coasters (/tag/:token)
  async function resolvePublicSmartTagPayload(tag: SmartTag) {
    const restaurant = await storage.getRestaurantById(tag.restaurantId);
    if (!restaurant || restaurant.hidden || restaurant.status !== 'active') return null;
    const publicCafe = toPublicCafe(restaurant);

    if (tag.targetType === 'waitlist_join') {
      return { destination: `/menu/${restaurant.id}?action=waitlist`, tag, restaurant: publicCafe, coasterStatus: null };
    }
    if (tag.targetType === 'reservations') {
      return { destination: `/menu/${restaurant.id}?action=reserve`, tag, restaurant: publicCafe, coasterStatus: null };
    }
    if (tag.targetType === 'dining_table') {
      if (tag.tableId) {
        const [table] = await db
          .select()
          .from(diningTables)
          .where(and(eq(diningTables.id, tag.tableId), eq(diningTables.restaurantId, restaurant.id), eq(diningTables.isActive, true)));
        if (table) {
          return {
            destination: `/menu/${restaurant.id}?table=${encodeURIComponent(table.tableCode)}`,
            tag,
            restaurant: publicCafe,
            table,
            coasterStatus: null,
          };
        }
      }
      return { destination: `/menu/${restaurant.id}`, tag, restaurant: publicCafe, coasterStatus: null };
    }
    if (tag.targetType === 'curbside_bay') {
      if (tag.bayId) {
        const [bay] = await db
          .select()
          .from(serviceBays)
          .where(and(eq(serviceBays.id, tag.bayId), eq(serviceBays.restaurantId, restaurant.id), eq(serviceBays.isActive, true)));
        if (bay) {
          const actionSuffix = restaurant.orderingMode === 'browse_and_pager' ? '&action=curbside' : '';
          return {
            destination: `/menu/${restaurant.id}?bay=${bay.id}${actionSuffix}`,
            tag,
            restaurant: publicCafe,
            bay,
            coasterStatus: null,
          };
        }
      }
      return { destination: `/menu/${restaurant.id}`, tag, restaurant: publicCafe, coasterStatus: null };
    }
    if (tag.targetType === 'reusable_pager') {
      if (tag.activeTicketId) {
        const [ticket] = await db
          .select()
          .from(pagerTickets)
          .where(and(eq(pagerTickets.id, tag.activeTicketId), eq(pagerTickets.restaurantId, restaurant.id)));
        if (ticket && ['waiting', 'preparing', 'ready'].includes(ticket.status)) {
          return {
            destination: `/pager/${ticket.trackingToken}`,
            tag,
            restaurant: publicCafe,
            ticket: {
              id: ticket.id,
              ticketCode: ticket.ticketCode,
              status: ticket.status,
              trackingToken: ticket.trackingToken,
            },
            coasterStatus: 'assigned' as const,
          };
        }
      }
      return {
        destination: null,
        tag,
        restaurant: publicCafe,
        ticket: null,
        coasterStatus: 'idle' as const,
      };
    }

    return { destination: `/menu/${restaurant.id}`, tag, restaurant: publicCafe, coasterStatus: null };
  }

  app.get('/api/public/tag/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const src = req.query.src === 'nfc' ? 'nfc' : req.query.src === 'poll' ? 'poll' : 'qr';
      const [existing] = await db
        .select()
        .from(smartTags)
        .where(and(eq(smartTags.token, token), eq(smartTags.isActive, true)));
      if (!existing) return res.status(404).json({ message: 'Smart QR/NFC tag not found or inactive' });

      const resolved = await resolvePublicSmartTagPayload(existing);
      if (!resolved) return res.status(404).json({ message: 'Venue unavailable' });

      if (src !== 'poll') {
        const [updated] = await db
          .update(smartTags)
          .set({
            qrScans: src === 'qr' ? sql`${smartTags.qrScans} + 1` : smartTags.qrScans,
            nfcTaps: src === 'nfc' ? sql`${smartTags.nfcTaps} + 1` : smartTags.nfcTaps,
            lastScannedAt: new Date(),
          })
          .where(eq(smartTags.id, existing.id))
          .returning();
        if (updated) resolved.tag = updated;
      }

      res.json(resolved);
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/tag/lookup', rateLimit(25, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const { restaurantId, code } = z
        .object({
          restaurantId: z.string().uuid(),
          code: z.string().trim().min(1).max(40),
        })
        .strict()
        .parse(req.body);
      const normalized = code.toUpperCase();
      const [tag] = await db
        .select()
        .from(smartTags)
        .where(
          and(
            eq(smartTags.restaurantId, restaurantId),
            eq(smartTags.isActive, true),
            sql`upper(${smartTags.tagCode}) = ${normalized}`,
          ),
        )
        .limit(1);
      if (!tag) return res.status(404).json({ message: 'No smart tag or coaster found for that code.' });
      const resolved = await resolvePublicSmartTagPayload(tag);
      if (!resolved) return res.status(404).json({ message: 'Venue unavailable' });
      const [updated] = await db
        .update(smartTags)
        .set({ qrScans: sql`${smartTags.qrScans} + 1`, lastScannedAt: new Date() })
        .where(eq(smartTags.id, tag.id))
        .returning();
      if (updated) resolved.tag = updated;
      res.json(resolved);
    } catch (e) {
      next(e);
    }
  });

  // Fetch public hospitality capabilities (zones, tables, bays, active delivery aggregators)
  app.get('/api/public/hospitality/:restaurantId', async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.restaurantId);
      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }
      const [zones, tables, bays, aggregators] = await Promise.all([
        db.select().from(diningZones).where(eq(diningZones.restaurantId, restaurantId)).orderBy(asc(diningZones.order)),
        db
          .select({
            id: diningTables.id,
            zoneId: diningTables.zoneId,
            tableCode: diningTables.tableCode,
            minCovers: diningTables.minCovers,
            maxCovers: diningTables.maxCovers,
            isCombinable: diningTables.isCombinable,
          })
          .from(diningTables)
          .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.isActive, true)))
          .orderBy(asc(diningTables.tableCode)),
        db
          .select({
            id: serviceBays.id,
            code: serviceBays.code,
            label: serviceBays.label,
            bayType: serviceBays.bayType,
            qrToken: serviceBays.qrToken,
          })
          .from(serviceBays)
          .where(and(eq(serviceBays.restaurantId, restaurantId), eq(serviceBays.isActive, true)))
          .orderBy(asc(serviceBays.order), asc(serviceBays.code)),
        db
          .select()
          .from(aggregatorLinks)
          .where(and(eq(aggregatorLinks.restaurantId, restaurantId), eq(aggregatorLinks.isActive, true)))
          .orderBy(asc(aggregatorLinks.order)),
      ]);
      res.json({ restaurant: toPublicCafe(restaurant), zones, tables, bays, aggregators });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 1 & 2: Guest Order Placement (Mode B: cart_pay_at_venue & Mode C: full_online_checkout)
  const orderSubmissionSchema = z
    .object({
      restaurantId: z.string().uuid(),
      channel: z.enum(['dine_in', 'counter_pickup', 'curbside', 'drive_thru']).default('counter_pickup'),
      customerName: z.string().trim().min(1).max(120),
      customerPhone: z.string().trim().max(40).optional().nullable(),
      tableCode: z.string().trim().max(40).optional().nullable(),
      bayId: z.string().uuid().optional().nullable(),
      vehicleColor: z.string().trim().max(40).optional().nullable(),
      vehicleType: z.string().trim().min(1).max(40).optional().nullable(),
      licensePlate: z.string().trim().max(32).optional().nullable(),
      notes: z.string().trim().max(500).optional().nullable(),
      idempotencyKey: z.string().trim().min(8).max(120).optional(),
      items: z
        .array(
          z
            .object({
              menuItemId: z.string().uuid(),
              quantity: z.number().int().min(1).max(25),
              variantId: z.string().uuid().optional().nullable(),
              modifiers: z.record(z.string(), z.array(z.string())).default({}),
              notes: z.string().trim().max(240).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(40),
    })
    .strict();

  app.post('/api/public/orders', rateLimit(30, 10 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const payload = orderSubmissionSchema.parse(req.body);
      const restaurant = await storage.getRestaurantById(payload.restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }
      if (restaurant.orderingMode === 'browse_and_pager') {
        return res.status(403).json({
          message: 'Online cart ordering is disabled for this branch. Place your order at the counter and scan your pager.',
        });
      }

      if (payload.idempotencyKey) {
        const [existingOrder] = await db
          .select()
          .from(guestOrders)
          .where(eq(guestOrders.paymentIdempotencyKey, payload.idempotencyKey));
        if (existingOrder) {
          const [existingPager] = await db
            .select()
            .from(pagerTickets)
            .where(eq(pagerTickets.orderId, existingOrder.id));
          return res.json({
            order: existingOrder,
            pager: existingPager || null,
            idempotentReplay: true,
          });
        }
      }

      const [allCats, allItems, allVariants] = await Promise.all([
        storage.getCategoriesByRestaurantId(restaurant.id),
        storage.getMenuItemsByRestaurantId(restaurant.id),
        storage.getPriceVariantsByRestaurantId(restaurant.id),
      ]);
      const visibleCats = new Set(allCats.filter(c => c.isVisible !== false).map(c => c.id));
      const itemMap = new Map(
        allItems.filter(i => i.isAvailable && visibleCats.has(i.categoryId)).map(i => [i.id, i]),
      );

      const cfg = resolveVenueConfig(restaurant.venueConfig);
      let totalCents = 0;
      let maxPrepMins = cfg.defaultPrepMins;
      const computedLines: OrderLineItem[] = [];

      for (const entry of payload.items) {
        const menuItem = itemMap.get(entry.menuItemId);
        if (!menuItem) {
          return res.status(409).json({ message: 'One or more items in your cart are currently unavailable.' });
        }
        const itemVariants = allVariants.filter(v => v.menuItemId === menuItem.id);
        let chosenVariant = undefined;
        if (menuItem.hasMultiplePricing) {
          chosenVariant = itemVariants.find(v => v.id === entry.variantId) || itemVariants[0];
          if (!chosenVariant) {
            return res.status(400).json({ message: `Select a size option for ${menuItem.name}` });
          }
        }
        const groups = menuItem.modifierGroups || [];
        const reconciled: MenuModifierSelections = reconcileModifierSelections(groups, entry.modifiers);
        const missing = missingModifierGroups(groups, reconciled);
        if (missing.length > 0) {
          return res.status(400).json({
            message: `Complete required choices (${missing.map(g => g.title).join(', ')}) for ${menuItem.name}`,
          });
        }
        const chosenMods = selectedModifierOptions(groups, reconciled);
        const unitTotal = customizationTotal(
          chosenVariant ? chosenVariant.price : menuItem.price,
          chosenVariant ? chosenVariant.discount : menuItem.discount,
          chosenMods,
        );
        const unitCents = Math.round(Number(unitTotal) * 100);
        const lineCents = unitCents * entry.quantity;
        totalCents += lineCents;
        maxPrepMins = Math.max(maxPrepMins, menuItem.prepTimeMins || cfg.defaultPrepMins);

        computedLines.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: entry.quantity,
          variantId: chosenVariant?.id || null,
          variantLabel: chosenVariant?.label || null,
          modifiers: chosenMods.map(m => ({ id: m.id, label: m.label, labelAr: m.labelAr, price: m.price })),
          unitTotal,
          lineTotal: (lineCents / 100).toFixed(2),
          notes: entry.notes,
        });
      }

      if (payload.bayId) {
        const [bay] = await db
          .select()
          .from(serviceBays)
          .where(and(eq(serviceBays.id, payload.bayId), eq(serviceBays.restaurantId, restaurant.id)));
        if (!bay) return res.status(400).json({ message: 'Selected parking bay does not belong to this branch' });
      }

      const feeTotals = computeOrderTotalsWithVenueFees(totalCents, cfg);
      const isOnlineCheckout = restaurant.orderingMode === 'full_online_checkout';
      const gateway: 'skipcash' | 'sadad' =
        restaurant.paymentGateway === 'sadad' ? 'sadad' : 'skipcash';
      const ticketDate = branchLocalDate(restaurant.timezone);

      const created = await db.transaction(async tx => {
        const { seq, code } = await nextDailyPagerCode(tx as any, restaurant.id, ticketDate, cfg.pagerTicketPrefix);
        const orderNumber = `ORD-${ticketDate.slice(5).replace('-', '')}-${String(seq).padStart(3, '0')}`;
        const [order] = await tx
          .insert(guestOrders)
          .values({
            restaurantId: restaurant.id,
            orderNumber,
            channel: payload.channel,
            orderingMode: restaurant.orderingMode,
            paymentStatus: isOnlineCheckout ? 'pending_online' : 'pay_at_venue',
            paymentProvider: isOnlineCheckout ? gateway : 'venue',
            paymentIdempotencyKey: payload.idempotencyKey || randomUUID(),
            customerName: payload.customerName,
            customerPhone: payload.customerPhone || null,
            tableCode: payload.tableCode || null,
            bayId: payload.bayId || null,
            vehicleColor: payload.vehicleColor || null,
            vehicleType: payload.vehicleType || null,
            licensePlate: payload.licensePlate?.toUpperCase() || null,
            notes: payload.notes || null,
            currency: restaurant.currency,
            subtotal: feeTotals.subtotal,
            total: feeTotals.total,
            lineItems: computedLines,
          })
          .returning();

        // In Mode B (cart_pay_at_venue), immediately release pager ticket to the live order queue.
        // In Mode C (full_online_checkout), issue pager ticket only once payment succeeds (or create waiting ticket on confirmation).
        let pager = null;
        if (!isOnlineCheckout) {
          const [ticket] = await tx
            .insert(pagerTickets)
            .values({
              restaurantId: restaurant.id,
              orderId: order.id,
              bayId: payload.bayId || null,
              ticketCode: code,
              ticketDate,
              dailySeq: seq,
              source: payload.channel === 'curbside' || payload.channel === 'drive_thru' ? 'curbside' : 'online_order',
              status: 'waiting',
              customerName: payload.customerName,
              notes: payload.notes || null,
              estimatedPrepMins: maxPrepMins,
              vehicleColor: payload.vehicleColor || null,
              vehicleType: payload.vehicleType || null,
              licensePlate: payload.licensePlate?.toUpperCase() || null,
              etaStatus: payload.bayId ? 'arrived' : null,
              arrivedAt: payload.bayId ? new Date() : null,
            })
            .returning();
          pager = ticket;
        }
        return { order, pager, maxPrepMins };
      });

      if (isOnlineCheckout) {
        const origin = `${req.protocol}://${req.get('host')}`;
        const branchSecrets = await loadBranchGatewaySecrets(restaurant.id);
        const checkout = await createPaymentCheckoutSession({
          targetKind: 'order',
          orderId: created.order.id,
          orderNumber: created.order.orderNumber,
          restaurantId: restaurant.id,
          amount: created.order.total,
          currency: restaurant.currency,
          provider: gateway,
          customerName: payload.customerName,
          customerPhone: payload.customerPhone,
          returnOrigin: origin,
          branchSecrets,
        });
        await db
          .update(guestOrders)
          .set({ paymentReference: checkout.paymentReference })
          .where(eq(guestOrders.id, created.order.id));
        return res.status(201).json({
          order: { ...created.order, paymentReference: checkout.paymentReference },
          pager: null,
          checkout,
        });
      }

      publishRealtimeEvent([`branch:${restaurant.id}`], {
        type: 'order.created',
        branchId: restaurant.id,
        data: { order: created.order, pager: created.pager },
      });
      deferRequestTask(
        dispatchPushAlertToScopes([`staff:${restaurant.id}`], {
          title: `${restaurant.name} · New Order ${created.order.orderNumber}`,
          body: `${payload.customerName} (${payload.channel.replace('_', ' ')}) · ${created.order.total} ${restaurant.currency}`,
          tag: `order-${created.order.orderNumber}`,
          url: '/admin/pagers',
        }),
      );

      res.status(201).json({ order: created.order, pager: created.pager, checkout: null });
    } catch (e) {
      next(e);
    }
  });

  // Sandbox / Signed Webhook confirmation for Mode C (SkipCash & Sadad)
  async function finalizePaidOrder(orderId: string, provider: 'skipcash' | 'sadad', paymentReference: string) {
    return await db.transaction(async tx => {
      const [order] = await tx.select().from(guestOrders).where(eq(guestOrders.id, orderId)).for('update');
      if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
      if (order.paymentStatus === 'paid') {
        const [existingPager] = await tx.select().from(pagerTickets).where(eq(pagerTickets.orderId, order.id));
        return { order, pager: existingPager, alreadyPaid: true };
      }
      const [restaurant] = await tx
        .select({ timezone: restaurants.timezone, venueConfig: restaurants.venueConfig })
        .from(restaurants)
        .where(eq(restaurants.id, order.restaurantId));
      const cfg = resolveVenueConfig(restaurant?.venueConfig);
      const ticketDate = branchLocalDate(restaurant?.timezone);
      const { seq, code } = await nextDailyPagerCode(tx as any, order.restaurantId, ticketDate, cfg.pagerTicketPrefix);

      const [updatedOrder] = await tx
        .update(guestOrders)
        .set({
          paymentStatus: 'paid',
          paymentProvider: provider,
          paymentReference,
          paidAt: new Date(),
        })
        .where(eq(guestOrders.id, order.id))
        .returning();

      const [ticket] = await tx
        .insert(pagerTickets)
        .values({
          restaurantId: order.restaurantId,
          orderId: order.id,
          bayId: order.bayId,
          ticketCode: code,
          ticketDate,
          dailySeq: seq,
          source: order.channel === 'curbside' || order.channel === 'drive_thru' ? 'curbside' : 'online_order',
          status: 'waiting',
          customerName: order.customerName,
          notes: order.notes,
          estimatedPrepMins: cfg.defaultPrepMins,
          vehicleColor: order.vehicleColor,
          vehicleType: order.vehicleType,
          licensePlate: order.licensePlate,
          etaStatus: order.bayId ? 'arrived' : null,
          arrivedAt: order.bayId ? new Date() : null,
        })
        .returning();

      return { order: updatedOrder, pager: ticket, alreadyPaid: false };
    });
  }

  app.post('/api/public/payments/:orderId/confirm-sandbox', async (req, res, next) => {
    try {
      const orderId = z.string().uuid().parse(req.params.orderId);
      const body = z
        .object({
          provider: z.enum(['skipcash', 'sadad']),
          paymentReference: z.string().min(4).max(120),
          signatureToken: z.string().length(64),
        })
        .strict()
        .parse(req.body);

      const [order] = await db.select().from(guestOrders).where(eq(guestOrders.id, orderId));
      if (!order) return res.status(404).json({ message: 'Order not found' });
      const branchSecrets = await loadBranchGatewaySecrets(order.restaurantId);
      const canonical = `${order.id}:${body.paymentReference}:${order.total}:${order.currency}`;
      if (!verifyGatewaySignature(body.provider, canonical, body.signatureToken, branchSecrets)) {
        return res.status(403).json({ message: 'Invalid payment signature' });
      }
      const result = await finalizePaidOrder(order.id, body.provider, body.paymentReference);
      if (!result.alreadyPaid) {
        publishRealtimeEvent([`branch:${order.restaurantId}`], {
          type: 'order.paid',
          branchId: order.restaurantId,
          data: { order: result.order, pager: result.pager },
        });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/webhooks/payments/:provider', async (req, res, next) => {
    try {
      const provider = z.enum(['skipcash', 'sadad']).parse(req.params.provider);
      const signature = req.get('X-Gateway-Signature') || '';
      const body = z
        .object({
          orderId: z.string().uuid().optional(),
          reservationId: z.string().uuid().optional(),
          paymentReference: z.string().min(4).max(120),
          amount: z.string(),
          currency: z.string(),
          status: z.enum(['paid', 'failed']),
        })
        .strict()
        .refine(v => Boolean(v.orderId || v.reservationId), 'Specify orderId or reservationId')
        .parse(req.body);

      const targetId = (body.orderId || body.reservationId)!;
      let restaurantIdForSecret: string | undefined;
      if (body.orderId) {
        const [o] = await db
          .select({ restaurantId: guestOrders.restaurantId })
          .from(guestOrders)
          .where(eq(guestOrders.id, body.orderId));
        restaurantIdForSecret = o?.restaurantId;
      } else if (body.reservationId) {
        const [r] = await db
          .select({ restaurantId: tableReservations.restaurantId })
          .from(tableReservations)
          .where(eq(tableReservations.id, body.reservationId));
        restaurantIdForSecret = r?.restaurantId;
      }
      const branchSecrets = restaurantIdForSecret ? await loadBranchGatewaySecrets(restaurantIdForSecret) : undefined;
      const canonical = `${targetId}:${body.paymentReference}:${body.amount}:${body.currency}:${body.status}`;
      if (!verifyGatewaySignature(provider, canonical, signature, branchSecrets)) {
        return res.status(401).json({ message: 'Invalid webhook signature' });
      }

      if (body.reservationId) {
        const [existingRes] = await db
          .select()
          .from(tableReservations)
          .where(eq(tableReservations.id, body.reservationId));
        if (!existingRes) return res.status(404).json({ message: 'Reservation not found' });
        if (body.status === 'failed') {
          await db
            .update(tableReservations)
            .set({
              status: 'cancelled',
              depositStatus: 'failed',
              paymentProvider: provider,
              paymentReference: body.paymentReference,
              cancelledAt: new Date(),
            })
            .where(eq(tableReservations.id, existingRes.id));
          return res.json({ received: true, status: 'failed' });
        }
        const [confirmedRes] = await db
          .update(tableReservations)
          .set({
            status: 'confirmed',
            depositStatus: 'paid',
            paymentProvider: provider,
            paymentReference: body.paymentReference,
          })
          .where(eq(tableReservations.id, existingRes.id))
          .returning();
        publishRealtimeEvent([`branch:${existingRes.restaurantId}`], {
          type: 'reservation.updated',
          branchId: existingRes.restaurantId,
          data: { reservation: confirmedRes },
        });
        return res.json({ received: true, status: 'paid', trackingToken: confirmedRes.trackingToken });
      }

      if (body.status === 'failed') {
        await db
          .update(guestOrders)
          .set({ paymentStatus: 'failed', paymentReference: body.paymentReference })
          .where(eq(guestOrders.id, body.orderId!));
        return res.json({ received: true, status: 'failed' });
      }
      const result = await finalizePaidOrder(body.orderId!, provider, body.paymentReference);
      if (!result.alreadyPaid) {
        publishRealtimeEvent([`branch:${result.order.restaurantId}`], {
          type: 'order.paid',
          branchId: result.order.restaurantId,
          data: { order: result.order, pager: result.pager },
        });
      }
      res.json({ received: true, status: 'paid', trackingToken: result.pager?.trackingToken });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 2: Public Virtual Pager Screen & Ticket Lookup & Reputation Feedback
}
