import type { Express } from 'express';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { rateLimit } from '../httpSecurity';
import { publishRealtimeEvent } from '../realtimeHub';
import { deferRequestTask } from '../workerContext';
import { dispatchPushAlertToScopes } from '../pushService';
import { withTenantRlsTransaction } from '../rlsContext';
import { createPaymentCheckoutSession, signGatewayPayload, verifyGatewaySignature } from '../payments/gateways';
import { aggregatorClicks, diningTables, diningZones, guestOrders, pagerTickets, serviceBays, smartTags, tableReservations, waitlistEntries } from '@shared/schema';
import { resolveVenueConfig } from '@shared/venueConfig';
import { branchLocalDate, busyTableIdsForWindow, countAvailableSlotAllocations, findTableAllocation, loadBranchGatewaySecrets, nextDailyPagerCode, nextWaitlistCode, resolveBranchOperatingMinutes, toPublicCafe } from './helpers';

export function mountPublicPagerAndTableRoutes(app: Express) {
  app.get('/api/public/pager/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [ticket] = await db.select().from(pagerTickets).where(eq(pagerTickets.trackingToken, token));
      if (!ticket) return res.status(404).json({ message: 'Pager ticket not found' });

      const restaurant = await storage.getRestaurantById(ticket.restaurantId);
      if (!restaurant) return res.status(404).json({ message: 'Venue not found' });

      const [aheadRows, orderRow, bayRow, allItems] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)` })
          .from(pagerTickets)
          .where(
            and(
              eq(pagerTickets.restaurantId, ticket.restaurantId),
              inArray(pagerTickets.status, ['waiting', 'preparing']),
              lt(pagerTickets.queuedAt, ticket.queuedAt),
            ),
          ),
        ticket.orderId ? db.select().from(guestOrders).where(eq(guestOrders.id, ticket.orderId)) : Promise.resolve([]),
        ticket.bayId ? db.select().from(serviceBays).where(eq(serviceBays.id, ticket.bayId)) : Promise.resolve([]),
        storage.getMenuItemsByRestaurantId(restaurant.id),
      ]);

      const today = branchLocalDate(restaurant.timezone);
      const specials = allItems
        .filter(i => i.isAvailable && i.specialDate === today)
        .slice(0, 4)
        .map(i => ({ id: i.id, name: i.name, nameAr: i.nameAr, price: i.price, discount: i.discount, imageUrl: i.imageUrl, unit: i.unit }));

      const bays = restaurant.driveThruEnabled
        ? await db
            .select({ id: serviceBays.id, code: serviceBays.code, label: serviceBays.label, bayType: serviceBays.bayType })
            .from(serviceBays)
            .where(and(eq(serviceBays.restaurantId, restaurant.id), eq(serviceBays.isActive, true)))
            .orderBy(asc(serviceBays.order))
        : [];

      res.json({
        ticket,
        restaurant: toPublicCafe(restaurant),
        queueAhead: Number(aheadRows[0]?.n || 0),
        order: orderRow[0] || null,
        bay: bayRow[0] || null,
        bays,
        specials,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/pager/lookup', rateLimit(20, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const { restaurantId, ticketCode } = z
        .object({
          restaurantId: z.string().uuid(),
          ticketCode: z.string().trim().min(1).max(40),
        })
        .strict()
        .parse(req.body);
      const normalized = ticketCode.toUpperCase();
      const [ticket] = await db
        .select()
        .from(pagerTickets)
        .where(
          and(
            eq(pagerTickets.restaurantId, restaurantId),
            sql`upper(${pagerTickets.ticketCode}) = ${normalized}`,
          ),
        )
        .orderBy(desc(pagerTickets.queuedAt))
        .limit(1);
      if (!ticket) {
        const [coaster] = await db
          .select()
          .from(smartTags)
          .where(
            and(
              eq(smartTags.restaurantId, restaurantId),
              eq(smartTags.isActive, true),
              eq(smartTags.targetType, 'reusable_pager'),
              sql`upper(${smartTags.tagCode}) = ${normalized}`,
            ),
          )
          .limit(1);
        if (coaster) {
          if (coaster.activeTicketId) {
            const [boundTicket] = await db
              .select()
              .from(pagerTickets)
              .where(and(eq(pagerTickets.id, coaster.activeTicketId), eq(pagerTickets.restaurantId, restaurantId)));
            if (boundTicket && ['waiting', 'preparing', 'ready'].includes(boundTicket.status)) {
              return res.json({
                trackingToken: boundTicket.trackingToken,
                ticketCode: boundTicket.ticketCode,
                status: boundTicket.status,
                coasterCode: coaster.tagCode,
              });
            }
          }
          return res.json({
            trackingToken: null,
            coasterToken: coaster.token,
            ticketCode: coaster.tagCode,
            status: 'idle',
          });
        }
        return res.status(404).json({ message: 'No active pager found for that receipt or pager code.' });
      }
      res.json({ trackingToken: ticket.trackingToken, ticketCode: ticket.ticketCode, status: ticket.status });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/pager/:token/feedback', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const { rating, comment } = z
        .object({
          rating: z.number().int().min(1).max(5),
          comment: z.string().trim().max(500).optional(),
        })
        .strict()
        .parse(req.body);
      const [updated] = await db
        .update(pagerTickets)
        .set({ rating, feedbackComment: comment || null })
        .where(eq(pagerTickets.trackingToken, token))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Pager ticket not found' });
      const restaurant = await storage.getRestaurantById(updated.restaurantId);
      const minStars = resolveVenueConfig(restaurant?.venueConfig).reviewPromptMinStars;
      res.json({
        ticket: updated,
        promptGoogleReview: rating >= minStars && Boolean(restaurant?.googleMapsReviewUrl),
        googleMapsReviewUrl: rating >= minStars ? restaurant?.googleMapsReviewUrl || null : null,
      });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 4: Guest Curbside / Drive-Thru Vehicle Check-In ("5 Mins Away" / "I'm Here — Bay #")
  app.post('/api/public/curbside/checkin', rateLimit(25, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const body = z
        .object({
          trackingToken: z.string().uuid().optional(),
          restaurantId: z.string().uuid().optional(),
          bayId: z.string().uuid(),
          etaStatus: z.enum(['5_mins_away', 'arrived']),
          customerName: z.string().trim().max(120).optional(),
          vehicleColor: z.string().trim().min(1).max(40),
          vehicleType: z.string().trim().min(1).max(40),
          licensePlate: z.string().trim().min(1).max(32),
        })
        .strict()
        .parse(req.body);

      const [bay] = await db.select().from(serviceBays).where(and(eq(serviceBays.id, body.bayId), eq(serviceBays.isActive, true)));
      if (!bay) return res.status(404).json({ message: 'Parking bay not found' });

      let updatedTicket;
      if (body.trackingToken) {
        const [existing] = await db
          .select()
          .from(pagerTickets)
          .where(and(eq(pagerTickets.trackingToken, body.trackingToken), eq(pagerTickets.restaurantId, bay.restaurantId)));
        if (!existing) return res.status(404).json({ message: 'Pager ticket not found for this branch' });
        const [saved] = await db
          .update(pagerTickets)
          .set({
            bayId: bay.id,
            vehicleColor: body.vehicleColor,
            vehicleType: body.vehicleType,
            licensePlate: body.licensePlate.toUpperCase(),
            etaStatus: body.etaStatus,
            arrivedAt: body.etaStatus === 'arrived' ? existing.arrivedAt || new Date() : existing.arrivedAt,
          })
          .where(eq(pagerTickets.id, existing.id))
          .returning();
        updatedTicket = saved;
      } else {
        // Drive-up guest without a pre-order scanning Bay QR in browse_and_pager mode
        const restaurant = await storage.getRestaurantById(bay.restaurantId);
        if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
          return res.status(404).json({ message: 'Venue unavailable' });
        }
        const cfg = resolveVenueConfig(restaurant.venueConfig);
        const ticketDate = branchLocalDate(restaurant.timezone);
        updatedTicket = await db.transaction(async tx => {
          const { seq, code } = await nextDailyPagerCode(tx as any, restaurant.id, ticketDate, cfg.pagerTicketPrefix);
          const [created] = await tx
            .insert(pagerTickets)
            .values({
              restaurantId: restaurant.id,
              bayId: bay.id,
              ticketCode: code,
              ticketDate,
              dailySeq: seq,
              source: 'curbside',
              status: 'waiting',
              customerName: body.customerName || `Car-Side · ${bay.code}`,
              estimatedPrepMins: cfg.defaultPrepMins,
              vehicleColor: body.vehicleColor,
              vehicleType: body.vehicleType,
              licensePlate: body.licensePlate.toUpperCase(),
              etaStatus: body.etaStatus,
              arrivedAt: body.etaStatus === 'arrived' ? new Date() : null,
            })
            .returning();
          return created;
        });
      }

      publishRealtimeEvent([`branch:${bay.restaurantId}`, `pager:${updatedTicket.trackingToken}`], {
        type: 'curbside.arrived',
        branchId: bay.restaurantId,
        data: { ticket: updatedTicket, bay },
      });
      if (body.etaStatus === 'arrived') {
        deferRequestTask(
          dispatchPushAlertToScopes([`staff:${bay.restaurantId}`], {
            title: `Vehicle Arrived · ${bay.code}`,
            body: `${body.vehicleColor} ${body.vehicleType} (${body.licensePlate.toUpperCase()}) · Ticket ${updatedTicket.ticketCode}`,
            tag: `bay-${bay.code}-${updatedTicket.ticketCode}`,
            url: '/admin/drive-thru',
          }),
        );
      }

      res.json({ ticket: updatedTicket, bay });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 3: Public Table Reservation Availability & Conflict-Free Booking (Single + Combinable Tables + Dynamic Hours + Deposit Checkout)
  app.get('/api/public/reservations/:restaurantId/availability', async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.restaurantId);
      const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(req.query.date);
      const partySize = z.coerce.number().int().min(1).max(60).parse(req.query.partySize || 2);
      const zoneId = req.query.zoneId ? z.string().uuid().parse(req.query.zoneId) : undefined;

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active' || !restaurant.reservationsEnabled) {
        return res.status(404).json({ message: 'Table reservations are not enabled for this branch' });
      }
      const cfg = resolveVenueConfig(restaurant.venueConfig);
      if (restaurant.venueConfig?.maxPartySize && partySize > restaurant.venueConfig.maxPartySize) {
        return res.json({
          slots: [],
          durationMins: restaurant.defaultTurnDurationMins,
          openTime: restaurant.openTime,
          closeTime: restaurant.closeTime,
        });
      }

      const activeTables = await db
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.isActive, true)))
        .orderBy(asc(diningTables.maxCovers), asc(diningTables.tableCode));

      if (!findTableAllocation(activeTables, new Set(), partySize, zoneId)) {
        return res.json({
          slots: [],
          durationMins: restaurant.defaultTurnDurationMins,
          openTime: restaurant.openTime,
          closeTime: restaurant.closeTime,
        });
      }

      const windowStart = new Date(`${date}T00:00:00.000Z`);
      const windowEnd = new Date(windowStart.getTime() + 48 * 3_600_000);
      const existingBookings = await db
        .select()
        .from(tableReservations)
        .where(
          and(
            eq(tableReservations.restaurantId, restaurantId),
            inArray(tableReservations.status, ['confirmed', 'seated', 'pending_deposit']),
            lt(tableReservations.startAt, windowEnd),
            gt(tableReservations.endAt, windowStart),
          ),
        );

      const interval = restaurant.slotIntervalMins || 30;
      const duration = restaurant.defaultTurnDurationMins || 90;
      const { openMins, closeMins } = resolveBranchOperatingMinutes(restaurant);
      const lastSeatingMins = Math.max(openMins, closeMins - 30);
      const baseMidnightMs = new Date(`${date}T00:00:00+03:00`).getTime();

      const slots: {
        time: string;
        startIso: string;
        availableTables: number;
        requiresCombination: boolean;
      }[] = [];

      for (let mins = openMins; mins <= lastSeatingMins; mins += interval) {
        const displayMins = ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
        const hh = String(Math.floor(displayMins / 60)).padStart(2, '0');
        const mm = String(displayMins % 60).padStart(2, '0');
        const slotStart = new Date(baseMidnightMs + mins * 60_000);
        const slotEnd = new Date(slotStart.getTime() + duration * 60_000);
        const busyIds = busyTableIdsForWindow(existingBookings, slotStart, slotEnd, cfg.depositHoldMins * 60_000);
        const { count, requiresCombination } = countAvailableSlotAllocations(
          activeTables,
          busyIds,
          partySize,
          zoneId,
        );
        if (count > 0) {
          slots.push({
            time: `${hh}:${mm}`,
            startIso: slotStart.toISOString(),
            availableTables: count,
            requiresCombination,
          });
        }
      }

      res.json({
        slots,
        durationMins: duration,
        openTime: restaurant.openTime,
        closeTime: restaurant.closeTime,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/reservations/:restaurantId', rateLimit(15, 10 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.restaurantId);
      const body = z
        .object({
          guestName: z.string().trim().min(1).max(120),
          guestPhone: z.string().trim().min(5).max(40),
          partySize: z.number().int().min(1).max(60),
          zoneId: z.string().uuid().optional().nullable(),
          startIso: z.string().datetime({ offset: true }),
          notes: z.string().trim().max(400).optional().nullable(),
        })
        .strict()
        .parse(req.body);

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active' || !restaurant.reservationsEnabled) {
        return res.status(404).json({ message: 'Reservations are unavailable for this branch' });
      }
      const cfg = resolveVenueConfig(restaurant.venueConfig);
      if (restaurant.venueConfig?.maxPartySize && body.partySize > restaurant.venueConfig.maxPartySize) {
        return res.status(400).json({ message: `Maximum online party size for this branch is ${restaurant.venueConfig.maxPartySize}.` });
      }

      const startAt = new Date(body.startIso);
      const endAt = new Date(startAt.getTime() + (restaurant.defaultTurnDurationMins || 90) * 60_000);
      const requiresDeposit =
        restaurant.orderingMode === 'full_online_checkout' &&
        Number(restaurant.reservationDepositAmount || 0) > 0;
      const depositAmt = requiresDeposit ? Number(restaurant.reservationDepositAmount).toFixed(2) : '0.00';
      const gateway: 'skipcash' | 'sadad' = restaurant.paymentGateway === 'sadad' ? 'sadad' : 'skipcash';

      // Lock all active branch tables inside a single transaction so concurrent single or combinable bookings never double-book.
      const booked = await withTenantRlsTransaction(
        { role: 'public', tenantId: restaurant.tenantId, branchId: restaurantId },
        async tx => {
          const tables = await tx
            .select()
            .from(diningTables)
            .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.isActive, true)))
            .orderBy(asc(diningTables.maxCovers), asc(diningTables.tableCode))
            .for('update');

          if (!findTableAllocation(tables, new Set(), body.partySize, body.zoneId)) {
            throw Object.assign(
              new Error('No table or combinable table pair fits that party size in the selected dining zone.'),
              { status: 409 },
            );
          }

          const overlapping = await tx
            .select({
              tableId: tableReservations.tableId,
              combinedTableIds: tableReservations.combinedTableIds,
              status: tableReservations.status,
              startAt: tableReservations.startAt,
              endAt: tableReservations.endAt,
              createdAt: tableReservations.createdAt,
            })
            .from(tableReservations)
            .where(
              and(
                eq(tableReservations.restaurantId, restaurantId),
                inArray(tableReservations.status, ['confirmed', 'seated', 'pending_deposit']),
                lt(tableReservations.startAt, endAt),
                gt(tableReservations.endAt, startAt),
              ),
            );

          const busyIds = busyTableIdsForWindow(overlapping, startAt, endAt, cfg.depositHoldMins * 60_000);
          const chosenTables = findTableAllocation(tables, busyIds, body.partySize, body.zoneId);
          if (!chosenTables || chosenTables.length === 0) {
            throw Object.assign(
              new Error('That time slot was just taken. Please pick another available time.'),
              { status: 409 },
            );
          }

          const primaryTable = chosenTables[0];
          const combinedIds = chosenTables.map(t => t.id);

          const [reservation] = await tx
            .insert(tableReservations)
            .values({
              restaurantId,
              zoneId: primaryTable.zoneId,
              tableId: primaryTable.id,
              combinedTableIds: combinedIds,
              guestName: body.guestName,
              guestPhone: body.guestPhone,
              partySize: body.partySize,
              startAt,
              endAt,
              status: requiresDeposit ? 'pending_deposit' : 'confirmed',
              depositStatus: requiresDeposit ? 'pending_online' : 'none',
              depositAmount: depositAmt,
              paymentProvider: requiresDeposit ? gateway : null,
              notes: body.notes || null,
            })
            .returning();

          return { reservation, table: primaryTable, combinedTables: chosenTables };
        },
      );

      if (requiresDeposit) {
        const origin = `${req.protocol}://${req.get('host')}`;
        const branchSecrets = await loadBranchGatewaySecrets(restaurantId);
        const checkout = await createPaymentCheckoutSession({
          targetKind: 'reservation',
          orderId: booked.reservation.id,
          orderNumber: `RES-${booked.reservation.id.slice(0, 8).toUpperCase()}`,
          restaurantId,
          amount: depositAmt,
          currency: restaurant.currency,
          provider: gateway,
          customerName: body.guestName,
          customerPhone: body.guestPhone,
          returnOrigin: origin,
          branchSecrets,
        });
        await db
          .update(tableReservations)
          .set({ paymentReference: checkout.paymentReference })
          .where(eq(tableReservations.id, booked.reservation.id));

        return res.status(201).json({
          ...booked,
          reservation: { ...booked.reservation, paymentReference: checkout.paymentReference },
          checkout,
        });
      }

      publishRealtimeEvent([`branch:${restaurantId}`], {
        type: 'reservation.updated',
        branchId: restaurantId,
        data: booked,
      });

      res.status(201).json({ ...booked, checkout: null });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/reservations/:id/confirm-deposit', async (req, res, next) => {
    try {
      const reservationId = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          provider: z.enum(['skipcash', 'sadad']),
          paymentReference: z.string().min(4).max(120),
          signatureToken: z.string().length(64),
        })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(tableReservations)
        .where(eq(tableReservations.id, reservationId));
      if (!existing) return res.status(404).json({ message: 'Reservation not found' });

      const restaurant = await storage.getRestaurantById(existing.restaurantId);
      if (!restaurant) return res.status(404).json({ message: 'Venue not found' });

      const branchSecrets = await loadBranchGatewaySecrets(restaurant.id);
      const canonical = `${existing.id}:${body.paymentReference}:${existing.depositAmount}:${restaurant.currency}`;
      if (!verifyGatewaySignature(body.provider, canonical, body.signatureToken, branchSecrets)) {
        return res.status(403).json({ message: 'Invalid deposit payment signature' });
      }

      const [confirmed] =
        existing.status === 'confirmed' && existing.depositStatus === 'paid'
          ? [existing]
          : await db
              .update(tableReservations)
              .set({
                status: 'confirmed',
                depositStatus: 'paid',
                paymentProvider: body.provider,
                paymentReference: body.paymentReference,
              })
              .where(eq(tableReservations.id, existing.id))
              .returning();

      const tableIds =
        confirmed.combinedTableIds && confirmed.combinedTableIds.length > 0
          ? confirmed.combinedTableIds
          : [confirmed.tableId];
      const combinedTables = await db
        .select()
        .from(diningTables)
        .where(inArray(diningTables.id, tableIds));
      const primaryTable = combinedTables.find(t => t.id === confirmed.tableId) || combinedTables[0] || null;

      publishRealtimeEvent([`branch:${existing.restaurantId}`], {
        type: 'reservation.updated',
        branchId: existing.restaurantId,
        data: { reservation: confirmed, table: primaryTable, combinedTables },
      });

      res.json({ reservation: confirmed, table: primaryTable, combinedTables });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/public/booking/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [reservation] = await db.select().from(tableReservations).where(eq(tableReservations.trackingToken, token));
      if (!reservation) return res.status(404).json({ message: 'Reservation not found' });
      const tableIds =
        reservation.combinedTableIds && reservation.combinedTableIds.length > 0
          ? reservation.combinedTableIds
          : [reservation.tableId];
      const [restaurant, combinedTables, [zone]] = await Promise.all([
        storage.getRestaurantById(reservation.restaurantId),
        db.select().from(diningTables).where(inArray(diningTables.id, tableIds)),
        reservation.zoneId ? db.select().from(diningZones).where(eq(diningZones.id, reservation.zoneId)) : Promise.resolve([]),
      ]);
      if (!restaurant) return res.status(404).json({ message: 'Venue not found' });
      const primaryTable = combinedTables.find(t => t.id === reservation.tableId) || combinedTables[0] || null;

      let pendingDepositCheckout = null;
      if (reservation.status === 'pending_deposit' && Number(reservation.depositAmount || 0) > 0) {
        const origin = `${req.protocol}://${req.get('host')}`;
        const branchSecrets = await loadBranchGatewaySecrets(restaurant.id);
        const provider: 'skipcash' | 'sadad' =
          reservation.paymentProvider === 'sadad' || restaurant.paymentGateway === 'sadad' ? 'sadad' : 'skipcash';
        const ref = reservation.paymentReference || `DEP-${reservation.id.slice(0, 12).toUpperCase()}`;
        const canonical = `${reservation.id}:${ref}:${reservation.depositAmount}:${restaurant.currency}`;
        pendingDepositCheckout = {
          provider,
          paymentReference: ref,
          checkoutMode: 'sandbox_interactive' as const,
          checkoutUrl: `${origin}/api/public/reservations/${reservation.id}/confirm-deposit`,
          signatureToken: signGatewayPayload(provider, canonical, branchSecrets),
        };
      }

      res.json({
        reservation,
        table: primaryTable,
        combinedTables,
        zone: zone || null,
        restaurant: toPublicCafe(restaurant),
        pendingDepositCheckout,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/booking/:token/cancel', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [existing] = await db.select().from(tableReservations).where(eq(tableReservations.trackingToken, token));
      if (!existing) return res.status(404).json({ message: 'Reservation not found' });
      if (existing.status !== 'confirmed' && existing.status !== 'pending_deposit') {
        return res.status(409).json({ message: `Reservation is already ${existing.status}.` });
      }
      const [cancelled] = await db
        .update(tableReservations)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(tableReservations.id, existing.id))
        .returning();
      publishRealtimeEvent([`branch:${existing.restaurantId}`], {
        type: 'reservation.updated',
        branchId: existing.restaurantId,
        data: { reservation: cancelled },
      });
      res.json({ reservation: cancelled });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 3: Public Live Walk-In Virtual Waitlist
  app.post('/api/public/waitlist/:restaurantId', rateLimit(20, 10 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.restaurantId);
      const body = z
        .object({
          guestName: z.string().trim().min(1).max(120),
          guestPhone: z.string().trim().max(40).optional().nullable(),
          partySize: z.number().int().min(1).max(60),
          zoneId: z.string().uuid().optional().nullable(),
          notes: z.string().trim().max(300).optional().nullable(),
        })
        .strict()
        .parse(req.body);

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active' || !restaurant.waitlistEnabled) {
        return res.status(404).json({ message: 'Walk-in waitlist is currently closed for this branch' });
      }
      const cfg = resolveVenueConfig(restaurant.venueConfig);
      if (restaurant.venueConfig?.maxPartySize && body.partySize > restaurant.venueConfig.maxPartySize) {
        return res.status(400).json({ message: `Maximum waitlist party size for this branch is ${restaurant.venueConfig.maxPartySize}.` });
      }

      const entry = await db.transaction(async tx => {
        const ticketCode = await nextWaitlistCode(tx as any, restaurantId, cfg.waitlistTicketPrefix);
        const [created] = await tx
          .insert(waitlistEntries)
          .values({
            restaurantId,
            zoneId: body.zoneId || null,
            ticketCode,
            guestName: body.guestName,
            guestPhone: body.guestPhone || null,
            partySize: body.partySize,
            notes: body.notes || null,
            status: 'waiting',
          })
          .returning();
        return created;
      });

      publishRealtimeEvent([`branch:${restaurantId}`], {
        type: 'waitlist.updated',
        branchId: restaurantId,
        data: { entry },
      });

      res.status(201).json({ entry });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/public/waitlist-ticket/:token', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.trackingToken, token));
      if (!entry) return res.status(404).json({ message: 'Waitlist ticket not found' });
      const restaurant = await storage.getRestaurantById(entry.restaurantId);
      if (!restaurant) return res.status(404).json({ message: 'Venue not found' });
      const [aheadRows, [zone]] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)` })
          .from(waitlistEntries)
          .where(
            and(
              eq(waitlistEntries.restaurantId, entry.restaurantId),
              eq(waitlistEntries.status, 'waiting'),
              lt(waitlistEntries.joinedAt, entry.joinedAt),
            ),
          ),
        entry.zoneId ? db.select().from(diningZones).where(eq(diningZones.id, entry.zoneId)) : Promise.resolve([]),
      ]);
      res.json({
        entry,
        zone: zone || null,
        partiesAhead: Number(aheadRows[0]?.n || 0),
        restaurant: toPublicCafe(restaurant),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/public/waitlist-ticket/:token/respond', async (req, res, next) => {
    try {
      const token = z.string().uuid().parse(req.params.token);
      const { action } = z
        .object({ action: z.enum(['on_my_way', 'release_spot']) })
        .strict()
        .parse(req.body);
      const [entry] = await db.select().from(waitlistEntries).where(eq(waitlistEntries.trackingToken, token));
      if (!entry) return res.status(404).json({ message: 'Waitlist ticket not found' });

      const [updated] = await db
        .update(waitlistEntries)
        .set(
          action === 'release_spot'
            ? { status: 'released', guestResponse: 'release_spot', closedAt: new Date() }
            : { guestResponse: 'on_my_way' },
        )
        .where(eq(waitlistEntries.id, entry.id))
        .returning();

      publishRealtimeEvent([`branch:${entry.restaurantId}`, `waitlist:${token}`], {
        type: 'waitlist.updated',
        branchId: entry.restaurantId,
        data: { entry: updated },
      });

      res.json({ entry: updated });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 5: Public Aggregator Outbound Click Telemetry (Zero-PII)
  app.post('/api/public/aggregator-click', rateLimit(60, 5 * 60 * 1000, req => req.ip || 'unknown'), async (req, res, next) => {
    try {
      const body = z
        .object({
          restaurantId: z.string().uuid(),
          aggregatorId: z.string().uuid().optional().nullable(),
          platform: z.enum(['talabat', 'snoonu', 'keeta', 'custom']),
          menuItemId: z.string().uuid().optional().nullable(),
          locale: z.enum(['en', 'ar']).default('en'),
        })
        .strict()
        .parse(req.body);

      const restaurant = await storage.getRestaurantById(body.restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }
      await db.insert(aggregatorClicks).values({
        restaurantId: body.restaurantId,
        aggregatorId: body.aggregatorId || null,
        platform: body.platform,
        menuItemId: body.menuItemId || null,
        locale: body.locale,
      });
      res.status(201).json({ recorded: true });
    } catch (e) {
      next(e);
    }
  });

  // ===== PROTECTED STAFF & MANAGER ENDPOINTS (/api/hospitality/...) =====
  // Tenant boundary & X-Cafe-Context checks are enforced upstream in mountAccessControl.

  // Live Order Queue & Virtual Pager Console
}
