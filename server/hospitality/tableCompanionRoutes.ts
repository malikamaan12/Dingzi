import type { Express } from 'express';
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated } from '../localAuth';
import { getManagedCafe } from '../accessControl';
import { rateLimit } from '../httpSecurity';
import { publishRealtimeEvent } from '../realtimeHub';
import { deferRequestTask } from '../workerContext';
import { dispatchPushAlertToScopes } from '../pushService';
import {
  diningTables,
  guestOrders,
  pagerTickets,
  tableServiceRequests,
  tableServiceRequestTypes,
  type OrderLineItem,
} from '@shared/schema';
import { computeOrderTotalsWithVenueFees, resolveVenueConfig } from '@shared/venueConfig';
import { branchLocalDate, toPublicCafe } from './helpers';

const REQUEST_LABELS: Record<(typeof tableServiceRequestTypes)[number], string> = {
  call_server: 'Server Requested',
  request_bill: 'Bill / Card Machine Requested',
  water_napkins: 'Water & Napkins Requested',
};

export function mountTableCompanionRoutes(app: Express) {
  // Public Dine-In Running Table Tab & Active Service Requests
  app.get('/api/public/table-session/:restaurantId', async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.restaurantId);
      const rawTable = String(req.query.table || '').trim();
      if (!rawTable || rawTable.length > 40) {
        return res.status(400).json({ message: 'Missing or invalid table code' });
      }

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
        return res.status(404).json({ message: 'Venue unavailable' });
      }

      const normalizedTable = rawTable.toUpperCase();
      const since = new Date(Date.now() - 18 * 60 * 60 * 1000);

      const [openOrders, openRequests] = await Promise.all([
        db
          .select()
          .from(guestOrders)
          .where(
            and(
              eq(guestOrders.restaurantId, restaurantId),
              eq(guestOrders.channel, 'dine_in'),
              eq(guestOrders.paymentStatus, 'pay_at_venue'),
              gte(guestOrders.createdAt, since),
              sql`upper(${guestOrders.tableCode}) = ${normalizedTable}`,
            ),
          )
          .orderBy(asc(guestOrders.createdAt)),
        db
          .select()
          .from(tableServiceRequests)
          .where(
            and(
              eq(tableServiceRequests.restaurantId, restaurantId),
              eq(tableServiceRequests.status, 'open'),
              sql`upper(${tableServiceRequests.tableCode}) = ${normalizedTable}`,
            ),
          )
          .orderBy(desc(tableServiceRequests.createdAt)),
      ]);

      const orderIds = openOrders.map(o => o.id);
      const linkedTickets = orderIds.length
        ? await db
            .select()
            .from(pagerTickets)
            .where(and(eq(pagerTickets.restaurantId, restaurantId), inArray(pagerTickets.orderId, orderIds)))
        : [];

      const cfg = resolveVenueConfig(restaurant.venueConfig);
      const combinedLines: OrderLineItem[] = openOrders.flatMap(o =>
        Array.isArray(o.lineItems) ? o.lineItems : [],
      );
      const subtotalCents = openOrders.reduce((sum, o) => sum + Math.round(Number(o.subtotal) * 100), 0);
      const feeSummary = computeOrderTotalsWithVenueFees(subtotalCents, cfg);

      res.json({
        tableCode: normalizedTable,
        restaurant: toPublicCafe(restaurant),
        orders: openOrders,
        tickets: linkedTickets,
        openRequests,
        tabSummary: {
          roundsCount: openOrders.length,
          itemsCount: combinedLines.reduce((sum, l) => sum + (l.quantity || 0), 0),
          subtotal: feeSummary.subtotal,
          taxAmount: feeSummary.taxAmount,
          serviceChargeAmount: feeSummary.serviceChargeAmount,
          total: openOrders.reduce((sum, o) => sum + Number(o.total), 0).toFixed(2),
          currency: restaurant.currency,
          combinedLines,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // Public 1-Tap Dine-In Table Service Bell (Call Server / Water / Request Bill)
  app.post(
    '/api/public/table-service/:restaurantId',
    rateLimit(15, 5 * 60 * 1000, req => req.ip || 'unknown'),
    async (req, res, next) => {
      try {
        const restaurantId = z.string().uuid().parse(req.params.restaurantId);
        const body = z
          .object({
            tableCode: z.string().trim().min(1).max(40),
            requestType: z.enum(tableServiceRequestTypes),
            note: z.string().trim().max(180).optional().nullable(),
          })
          .strict()
          .parse(req.body);

        const restaurant = await storage.getRestaurantById(restaurantId);
        if (!restaurant || restaurant.hidden || restaurant.status !== 'active') {
          return res.status(404).json({ message: 'Venue unavailable' });
        }

        const normalizedTable = body.tableCode.toUpperCase();

        // Optional verification if branch has configured dining tables: normalize against matching tableCode if present
        const branchTables = await db
          .select({ tableCode: diningTables.tableCode })
          .from(diningTables)
          .where(and(eq(diningTables.restaurantId, restaurantId), eq(diningTables.isActive, true)));
        if (branchTables.length > 0) {
          const matched = branchTables.find(t => t.tableCode.toUpperCase() === normalizedTable);
          if (!matched && !/^T-?\d+|[A-Z0-9_-]{1,16}$/i.test(normalizedTable)) {
            return res.status(400).json({ message: 'Invalid table code for this branch' });
          }
        }

        const [existingOpen] = await db
          .select()
          .from(tableServiceRequests)
          .where(
            and(
              eq(tableServiceRequests.restaurantId, restaurantId),
              eq(tableServiceRequests.status, 'open'),
              eq(tableServiceRequests.requestType, body.requestType),
              sql`upper(${tableServiceRequests.tableCode}) = ${normalizedTable}`,
            ),
          )
          .limit(1);

        let savedRequest;
        if (existingOpen) {
          const [updated] = await db
            .update(tableServiceRequests)
            .set({
              createdAt: new Date(),
              note: body.note || existingOpen.note,
            })
            .where(eq(tableServiceRequests.id, existingOpen.id))
            .returning();
          savedRequest = updated;
        } else {
          const [created] = await db
            .insert(tableServiceRequests)
            .values({
              restaurantId,
              tableCode: normalizedTable,
              requestType: body.requestType,
              note: body.note || null,
              status: 'open',
            })
            .returning();
          savedRequest = created;
        }

        publishRealtimeEvent([`branch:${restaurantId}`], {
          type: 'table.service_requested',
          branchId: restaurantId,
          data: { request: savedRequest },
        });

        deferRequestTask(
          dispatchPushAlertToScopes([`staff:${restaurantId}`], {
            title: `${restaurant.name} · Table ${normalizedTable}`,
            body: `${REQUEST_LABELS[body.requestType]}${body.note ? ` — “${body.note}”` : ''}`,
            tag: `table-${normalizedTable}-${body.requestType}`,
            url: '/admin/front-desk',
            urgent: true,
          }),
        );

        res.status(201).json({ request: savedRequest });
      } catch (e) {
        next(e);
      }
    },
  );

  // Staff: Active Table Service Bell Requests
  app.get('/api/hospitality/table-service', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const requests = await db
        .select()
        .from(tableServiceRequests)
        .where(and(eq(tableServiceRequests.restaurantId, cafe.id), eq(tableServiceRequests.status, 'open')))
        .orderBy(asc(tableServiceRequests.createdAt))
        .limit(50);
      res.json({ requests });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/table-service/:id/resolve', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const id = z.string().uuid().parse(req.params.id);
      const [resolved] = await db
        .update(tableServiceRequests)
        .set({ status: 'resolved', resolvedAt: new Date() })
        .where(and(eq(tableServiceRequests.id, id), eq(tableServiceRequests.restaurantId, cafe.id)))
        .returning();
      if (!resolved) return res.status(404).json({ message: 'Service request not found' });

      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'table.service_resolved',
        branchId: cafe.id,
        data: { request: resolved },
      });

      res.json({ request: resolved });
    } catch (e) {
      next(e);
    }
  });

  // Staff: 1-Click Settle Running Dine-In Table Tab (all open rounds on a table)
  app.post('/api/hospitality/table-tab/settle', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const { tableCode } = z
        .object({ tableCode: z.string().trim().min(1).max(40) })
        .strict()
        .parse(req.body);
      const normalized = tableCode.toUpperCase();
      const now = new Date();

      const settledOrders = await db
        .update(guestOrders)
        .set({ paymentStatus: 'paid', paidAt: now })
        .where(
          and(
            eq(guestOrders.restaurantId, cafe.id),
            eq(guestOrders.channel, 'dine_in'),
            eq(guestOrders.paymentStatus, 'pay_at_venue'),
            sql`upper(${guestOrders.tableCode}) = ${normalized}`,
          ),
        )
        .returning();

      await db
        .update(tableServiceRequests)
        .set({ status: 'resolved', resolvedAt: now })
        .where(
          and(
            eq(tableServiceRequests.restaurantId, cafe.id),
            eq(tableServiceRequests.status, 'open'),
            sql`upper(${tableServiceRequests.tableCode}) = ${normalized}`,
          ),
        );

      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'table.tab_settled',
        branchId: cafe.id,
        data: { tableCode: normalized, settledCount: settledOrders.length },
      });

      res.json({ tableCode: normalized, settledOrders });
    } catch (e) {
      next(e);
    }
  });

  // Staff: End-of-Day Z-Report & Accounting Settlement Summary
  app.get('/api/hospitality/z-report', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const targetDate =
        typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
          ? req.query.date
          : branchLocalDate(cafe.timezone);

      const [allOrders, allTickets] = await Promise.all([
        db.select().from(guestOrders).where(eq(guestOrders.restaurantId, cafe.id)),
        db.select().from(pagerTickets).where(eq(pagerTickets.restaurantId, cafe.id)),
      ]);

      const formatDay = (d: Date) => {
        try {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: cafe.timezone || 'Asia/Qatar',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(d);
        } catch {
          return d.toISOString().slice(0, 10);
        }
      };

      const dayOrders = allOrders.filter(o => formatDay(new Date(o.createdAt)) === targetDate);
      const dayTickets = allTickets.filter(t => t.ticketDate === targetDate);

      const paidOrders = dayOrders.filter(o => o.paymentStatus === 'paid');
      const unpaidOrders = dayOrders.filter(o => o.paymentStatus === 'pay_at_venue');
      const refundedOrders = dayOrders.filter(o => o.paymentStatus === 'refunded');

      const cfg = resolveVenueConfig(cafe.venueConfig);
      let netSubtotalCents = 0;
      let grossPaidCents = 0;
      for (const o of paidOrders) {
        netSubtotalCents += Math.round(Number(o.subtotal) * 100);
        grossPaidCents += Math.round(Number(o.total) * 100);
      }
      const feeSplit = computeOrderTotalsWithVenueFees(netSubtotalCents, cfg);

      const byChannel: Record<string, { count: number; total: string }> = {};
      for (const o of paidOrders) {
        const prev = byChannel[o.channel] || { count: 0, total: '0.00' };
        byChannel[o.channel] = {
          count: prev.count + 1,
          total: (Number(prev.total) + Number(o.total)).toFixed(2),
        };
      }

      const prepTickets = dayTickets.filter(t => t.readyAt && t.queuedAt);
      const avgPrepMins = prepTickets.length
        ? Number(
            (
              prepTickets.reduce(
                (s, t) => s + Math.max(0, (new Date(t.readyAt!).getTime() - new Date(t.queuedAt).getTime()) / 60_000),
                0,
              ) / prepTickets.length
            ).toFixed(1),
          )
        : 0;

      res.json({
        date: targetDate,
        venueName: cafe.name,
        currency: cafe.currency,
        regNumber: cfg.receiptRegNumber || null,
        ordersCount: dayOrders.length,
        paidCount: paidOrders.length,
        unpaidCount: unpaidOrders.length,
        refundedCount: refundedOrders.length,
        netSubtotal: (netSubtotalCents / 100).toFixed(2),
        taxLabel: cfg.taxLabel,
        taxPercent: cfg.taxPercent,
        taxCollected: feeSplit.taxAmount,
        serviceChargePercent: cfg.serviceChargePercent,
        serviceCollected: feeSplit.serviceChargeAmount,
        grossPaidTotal: (grossPaidCents / 100).toFixed(2),
        unpaidOpenTotal: unpaidOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(2),
        refundedTotal: refundedOrders.reduce((s, o) => s + Number(o.total), 0).toFixed(2),
        byChannel,
        ticketsTotal: dayTickets.length,
        collectedCount: dayTickets.filter(t => t.status === 'collected').length,
        noShowCount: dayTickets.filter(t => t.status === 'no_show').length,
        avgPrepMins,
      });
    } catch (e) {
      next(e);
    }
  });
}
