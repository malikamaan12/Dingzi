import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated } from '../localAuth';
import { getManagedCafe } from '../accessControl';
import { publishRealtimeEvent } from '../realtimeHub';
import { withTenantRlsTransaction } from '../rlsContext';
import { encryptGatewaySecret, maskGatewayValue, signGatewayPayload } from '../payments/gateways';
import { customizationTotal } from '@shared/menuCustomization';
import {
  branchPaymentConfigs,
  guestOrders,
  pagerTickets,
  type OrderLineItem,
} from '@shared/schema';
import { branchLocalDate, nextDailyPagerCode } from './helpers';

export function mountOrdersTeamAndTenantRoutes(app: Express) {
  app.get('/api/hospitality/orders', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [orders, tickets] = await Promise.all([
        db
          .select()
          .from(guestOrders)
          .where(eq(guestOrders.restaurantId, cafe.id))
          .orderBy(desc(guestOrders.createdAt))
          .limit(250),
        db
          .select()
          .from(pagerTickets)
          .where(eq(pagerTickets.restaurantId, cafe.id))
          .orderBy(desc(pagerTickets.queuedAt))
          .limit(250),
      ]);
      res.json({ orders, tickets, currency: cafe.currency });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/orders', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          channel: z.enum(['dine_in', 'counter_pickup', 'curbside', 'drive_thru']).default('counter_pickup'),
          customerName: z.string().trim().min(1).max(120),
          customerPhone: z.string().trim().max(40).optional().nullable(),
          tableCode: z.string().trim().max(40).optional().nullable(),
          paymentStatus: z.enum(['paid', 'pay_at_venue']).default('paid'),
          notes: z.string().trim().max(500).optional().nullable(),
          items: z
            .array(
              z
                .object({
                  menuItemId: z.string().uuid(),
                  quantity: z.number().int().min(1).max(25),
                  variantId: z.string().uuid().optional().nullable(),
                  notes: z.string().trim().max(240).optional(),
                })
                .strict(),
            )
            .min(1)
            .max(40),
        })
        .strict()
        .parse(req.body);

      const [allItems, allVariants] = await Promise.all([
        storage.getMenuItemsByRestaurantId(cafe.id),
        storage.getPriceVariantsByRestaurantId(cafe.id),
      ]);
      const itemMap = new Map(allItems.map(i => [i.id, i]));

      let totalCents = 0;
      let maxPrepMins = 6;
      const computedLines: OrderLineItem[] = [];

      for (const entry of body.items) {
        const menuItem = itemMap.get(entry.menuItemId);
        if (!menuItem) {
          return res.status(400).json({ message: 'Selected item does not belong to this branch.' });
        }
        const itemVariants = allVariants.filter(v => v.menuItemId === menuItem.id);
        const chosenVariant = menuItem.hasMultiplePricing
          ? itemVariants.find(v => v.id === entry.variantId) || itemVariants[0]
          : undefined;
        const unitTotal = customizationTotal(
          chosenVariant ? chosenVariant.price : menuItem.price,
          chosenVariant ? chosenVariant.discount : menuItem.discount,
          [],
        );
        const unitCents = Math.round(Number(unitTotal) * 100);
        const lineCents = unitCents * entry.quantity;
        totalCents += lineCents;
        maxPrepMins = Math.max(maxPrepMins, menuItem.prepTimeMins || 8);

        computedLines.push({
          menuItemId: menuItem.id,
          name: menuItem.name,
          quantity: entry.quantity,
          variantId: chosenVariant?.id || null,
          variantLabel: chosenVariant?.label || null,
          modifiers: [],
          unitTotal,
          lineTotal: (lineCents / 100).toFixed(2),
          notes: entry.notes,
        });
      }

      const totalFormatted = (totalCents / 100).toFixed(2);
      const ticketDate = branchLocalDate(cafe.timezone);

      const created = await withTenantRlsTransaction(
        { userId: req.user.id, role: req.effectiveStaffRole, tenantId: cafe.tenantId, branchId: cafe.id },
        async tx => {
          const { seq, code } = await nextDailyPagerCode(tx as any, cafe.id, ticketDate);
          const orderNumber = `POS-${ticketDate.slice(5).replace('-', '')}-${String(seq).padStart(3, '0')}`;
          const [order] = await tx
            .insert(guestOrders)
            .values({
              restaurantId: cafe.id,
              orderNumber,
              channel: body.channel,
              orderingMode: cafe.orderingMode,
              paymentStatus: body.paymentStatus,
              paymentProvider: 'venue',
              paymentIdempotencyKey: randomUUID(),
              customerName: body.customerName,
              customerPhone: body.customerPhone || null,
              tableCode: body.tableCode || null,
              notes: body.notes || null,
              currency: cafe.currency,
              subtotal: totalFormatted,
              total: totalFormatted,
              lineItems: computedLines,
              paidAt: body.paymentStatus === 'paid' ? new Date() : null,
            })
            .returning();

          const [pager] = await tx
            .insert(pagerTickets)
            .values({
              restaurantId: cafe.id,
              orderId: order.id,
              ticketCode: code,
              ticketDate,
              dailySeq: seq,
              source: 'pos_invoice',
              status: 'waiting',
              customerName: body.customerName,
              notes: body.notes || null,
              estimatedPrepMins: maxPrepMins,
            })
            .returning();

          return { order, pager };
        },
      );

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${created.pager.trackingToken}`], {
        type: 'order.created',
        branchId: cafe.id,
        data: created,
      });

      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/orders/:id/payment-status', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const orderId = z.string().uuid().parse(req.params.id);
      const { paymentStatus } = z
        .object({ paymentStatus: z.enum(['paid', 'pay_at_venue', 'refunded', 'failed']) })
        .strict()
        .parse(req.body);

      const [updated] = await db
        .update(guestOrders)
        .set({
          paymentStatus,
          ...(paymentStatus === 'paid' ? { paidAt: new Date() } : {}),
        })
        .where(and(eq(guestOrders.id, orderId), eq(guestOrders.restaurantId, cafe.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Order not found in this branch' });

      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'order.paid',
        branchId: cafe.id,
        data: { order: updated },
      });

      res.json({ order: updated });
    } catch (e) {
      next(e);
    }
  });

  // ===== ISOLATED ENCRYPTED MERCHANT PAYMENT CREDENTIALS VAULT =====

  app.get('/api/hospitality/payment-config', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [cfg] = await db
        .select()
        .from(branchPaymentConfigs)
        .where(eq(branchPaymentConfigs.restaurantId, cafe.id));

      res.json({
        skipcashKeyMasked: maskGatewayValue(cfg?.skipcashKeyId),
        hasSkipcashSecret: Boolean(cfg?.skipcashSecretEnc),
        skipcashCheckoutUrl: cfg?.skipcashCheckoutUrl || '',
        sadadMerchantMasked: maskGatewayValue(cfg?.sadadMerchantId),
        hasSadadSecret: Boolean(cfg?.sadadSecretEnc),
        sadadCheckoutUrl: cfg?.sadadCheckoutUrl || '',
        updatedAt: cfg?.updatedAt || null,
      });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/hospitality/payment-config', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          skipcashKeyId: z.string().trim().max(160).optional().nullable(),
          skipcashSecret: z.string().trim().max(240).optional().nullable(),
          skipcashCheckoutUrl: z.string().trim().url().max(400).or(z.literal('')).optional().nullable(),
          sadadMerchantId: z.string().trim().max(160).optional().nullable(),
          sadadSecret: z.string().trim().max(240).optional().nullable(),
          sadadCheckoutUrl: z.string().trim().url().max(400).or(z.literal('')).optional().nullable(),
        })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(branchPaymentConfigs)
        .where(eq(branchPaymentConfigs.restaurantId, cafe.id));

      const values = {
        restaurantId: cafe.id,
        skipcashKeyId:
          body.skipcashKeyId !== undefined ? body.skipcashKeyId || null : existing?.skipcashKeyId || null,
        skipcashSecretEnc:
          body.skipcashSecret && body.skipcashSecret.length > 0
            ? encryptGatewaySecret(body.skipcashSecret)
            : body.skipcashSecret === ''
              ? null
              : existing?.skipcashSecretEnc || null,
        skipcashCheckoutUrl:
          body.skipcashCheckoutUrl !== undefined
            ? body.skipcashCheckoutUrl || null
            : existing?.skipcashCheckoutUrl || null,
        sadadMerchantId:
          body.sadadMerchantId !== undefined ? body.sadadMerchantId || null : existing?.sadadMerchantId || null,
        sadadSecretEnc:
          body.sadadSecret && body.sadadSecret.length > 0
            ? encryptGatewaySecret(body.sadadSecret)
            : body.sadadSecret === ''
              ? null
              : existing?.sadadSecretEnc || null,
        sadadCheckoutUrl:
          body.sadadCheckoutUrl !== undefined ? body.sadadCheckoutUrl || null : existing?.sadadCheckoutUrl || null,
        updatedAt: new Date(),
      };

      await db
        .insert(branchPaymentConfigs)
        .values(values)
        .onConflictDoUpdate({ target: branchPaymentConfigs.restaurantId, set: values });

      res.json({
        skipcashKeyMasked: maskGatewayValue(values.skipcashKeyId),
        hasSkipcashSecret: Boolean(values.skipcashSecretEnc),
        skipcashCheckoutUrl: values.skipcashCheckoutUrl || '',
        sadadMerchantMasked: maskGatewayValue(values.sadadMerchantId),
        hasSadadSecret: Boolean(values.sadadSecretEnc),
        sadadCheckoutUrl: values.sadadCheckoutUrl || '',
        updatedAt: values.updatedAt,
      });
    } catch (e) {
      next(e);
    }
  });

  // Helper endpoint for deterministic webhook signature generation in verified tests
  if (process.env.NODE_ENV !== 'production') {
    app.post('/api/public/dev-webhook-sign', (req, res) => {
      const { provider, payload } = z
        .object({ provider: z.enum(['skipcash', 'sadad']), payload: z.string() })
        .parse(req.body);
      res.json({ signature: signGatewayPayload(provider, payload) });
    });
  }
}
