import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated, isSuperAdmin } from '../localAuth';
import { authUser, getAccessibleBranches, getEffectiveStaffRole, getManagedCafe } from '../accessControl';
import { publishRealtimeEvent } from '../realtimeHub';
import { withTenantRlsTransaction } from '../rlsContext';
import bcrypt from '../passwords';
import { encryptGatewaySecret, maskGatewayValue, signGatewayPayload } from '../payments/gateways';
import { customizationTotal } from '@shared/menuCustomization';
import { aggregatorClicks, branchPaymentConfigs, emailSchema, guestOrders, pagerTickets, passwordSchema, restaurants, sessions, staffAssignments, staffRoles, tableReservations, tenants, users, type OrderLineItem } from '@shared/schema';
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

  // ===== STAFF RBAC TEAM CONSOLE & MULTI-BRANCH TENANT OWNER CONTROLS =====

  app.get('/api/hospitality/team', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const staffRole = await getEffectiveStaffRole(req);
      const accessibleBranches = await getAccessibleBranches(req);

      const assignments = await db
        .select({
          id: staffAssignments.id,
          userId: staffAssignments.userId,
          restaurantId: staffAssignments.restaurantId,
          tenantId: staffAssignments.tenantId,
          staffRole: staffAssignments.staffRole,
          isActive: staffAssignments.isActive,
          createdAt: staffAssignments.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          accountStatus: users.accountStatus,
        })
        .from(staffAssignments)
        .innerJoin(users, eq(users.id, staffAssignments.userId))
        .where(
          cafe.tenantId
            ? sql`(${staffAssignments.restaurantId} = ${cafe.id} OR ${staffAssignments.tenantId} = ${cafe.tenantId})`
            : eq(staffAssignments.restaurantId, cafe.id),
        )
        .orderBy(asc(staffAssignments.createdAt));

      const [primaryOwner] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          accountStatus: users.accountStatus,
        })
        .from(users)
        .where(eq(users.id, cafe.userId));

      res.json({
        primaryManager: primaryOwner || null,
        assignments: assignments.filter(a => a.isActive),
        callerRole: staffRole,
        accessibleBranches,
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/team', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);

      const body = z
        .object({
          email: emailSchema,
          password: passwordSchema.optional(),
          firstName: z.string().trim().min(1).max(100),
          lastName: z.string().trim().min(1).max(100),
          staffRole: z.enum(staffRoles),
          applyTenantWide: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);

      if (body.staffRole === 'tenant_owner' && callerRole !== 'tenant_owner' && callerRole !== 'super_admin') {
        return res.status(403).json({ message: 'Only a Tenant Owner or Super Admin can assign Tenant Owner access.' });
      }
      if ((body.staffRole === 'tenant_owner' || body.applyTenantWide) && !cafe.tenantId) {
        return res.status(400).json({ message: 'Link this branch to a Multi-Branch Tenant Group first.' });
      }

      const created = await db.transaction(async tx => {
        let [user] = await tx
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${body.email}`)
          .for('update');

        if (!user) {
          if (!body.password) {
            throw Object.assign(new Error('Provide an initial password (10+ characters) for a new staff account.'), {
              status: 400,
            });
          }
          const hashedPassword = await bcrypt.hash(body.password, 12);
          [user] = await tx
            .insert(users)
            .values({
              email: body.email,
              password: hashedPassword,
              firstName: body.firstName,
              lastName: body.lastName,
              role: 'admin',
            })
            .returning();
        } else if (user.role === 'super_admin') {
          throw Object.assign(new Error('Super admin accounts already have full workspace elevation.'), { status: 409 });
        } else if (user.accountStatus !== 'active') {
          throw Object.assign(new Error('This staff account is frozen or deleted.'), { status: 409 });
        }

        const targetTenantId = body.staffRole === 'tenant_owner' || body.applyTenantWide ? cafe.tenantId : null;
        const targetRestaurantId = targetTenantId ? null : cafe.id;

        const [assignment] = await tx
          .insert(staffAssignments)
          .values({
            userId: user.id,
            restaurantId: targetRestaurantId,
            tenantId: targetTenantId,
            staffRole: body.staffRole,
            isActive: true,
          })
          .returning();

        return {
          assignment,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
        };
      });

      res.status(201).json(created);
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/team/:assignmentId', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      const assignmentId = z.string().uuid().parse(req.params.assignmentId);

      const [target] = await db
        .select()
        .from(staffAssignments)
        .where(eq(staffAssignments.id, assignmentId));
      if (!target) return res.status(404).json({ message: 'Staff assignment not found' });

      if (
        target.restaurantId !== cafe.id &&
        (!cafe.tenantId || target.tenantId !== cafe.tenantId)
      ) {
        return res.status(403).json({ message: 'Assignment belongs to another branch' });
      }
      if (target.staffRole === 'tenant_owner' && callerRole !== 'tenant_owner' && callerRole !== 'super_admin') {
        return res.status(403).json({ message: 'Only a Tenant Owner or Super Admin can revoke Tenant Owner access.' });
      }

      await db.transaction(async tx => {
        await tx
          .update(staffAssignments)
          .set({ isActive: false })
          .where(eq(staffAssignments.id, assignmentId));
        await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${target.userId}`);
      });

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Multi-Branch Switcher for Tenant Owners & Multi-Branch Staff
  app.post('/api/hospitality/switch-branch', isAuthenticated, async (req: any, res, next) => {
    try {
      const { restaurantId } = z.object({ restaurantId: z.string().uuid() }).strict().parse(req.body);
      const accessible = await getAccessibleBranches(req);
      if (!accessible.some(b => b.id === restaurantId)) {
        return res.status(403).json({ message: 'You do not have access to that branch.' });
      }
      req.session.cafeId = restaurantId;
      await new Promise<void>((resolve, reject) => req.session.save((err: Error) => (err ? reject(err) : resolve())));
      req.managedCafeResolved = false;
      res.json(await authUser(req));
    } catch (e) {
      next(e);
    }
  });

  // Scoped Multi-Branch Comparison Analytics for Tenant Owners (PRD §3)
  app.get('/api/hospitality/tenant-analytics', isAuthenticated, async (req: any, res, next) => {
    try {
      const accessible = await getAccessibleBranches(req);
      const branchIds = accessible.map(b => b.id);
      if (!branchIds.length) return res.json({ branches: [] });

      const [cafes, tickets, orders, reservations, clicks] = await Promise.all([
        db.select().from(restaurants).where(inArray(restaurants.id, branchIds)).orderBy(asc(restaurants.name)),
        db.select().from(pagerTickets).where(inArray(pagerTickets.restaurantId, branchIds)),
        db.select().from(guestOrders).where(inArray(guestOrders.restaurantId, branchIds)),
        db.select().from(tableReservations).where(inArray(tableReservations.restaurantId, branchIds)),
        db.select().from(aggregatorClicks).where(inArray(aggregatorClicks.restaurantId, branchIds)),
      ]);

      const branches = cafes.map(cafe => {
        const branchTickets = tickets.filter(t => t.restaurantId === cafe.id);
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
        const hourlyCounts = Array.from({ length: 24 }, () => 0);
        for (const t of branchTickets) hourlyCounts[new Date(t.queuedAt).getHours()]++;
        let peakHour = 0;
        for (let h = 1; h < 24; h++) if (hourlyCounts[h] > hourlyCounts[peakHour]) peakHour = h;

        const branchOrders = orders.filter(o => o.restaurantId === cafe.id);
        const revenue = branchOrders
          .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue')
          .reduce((sum, o) => sum + Number(o.total), 0)
          .toFixed(2);
        const branchRes = reservations.filter(r => r.restaurantId === cafe.id && r.status !== 'cancelled');
        const branchClicks = clicks.filter(c => c.restaurantId === cafe.id);
        return {
          id: cafe.id,
          name: cafe.name,
          slug: cafe.slug,
          orderingMode: cafe.orderingMode,
          currency: cafe.currency,
          totalTickets: branchTickets.length,
          avgPrepMins,
          peakHour: branchTickets.length > 0 ? `${String(peakHour).padStart(2, '0')}:00` : '—',
          totalOrders: branchOrders.length,
          revenue,
          reservations: branchRes.length,
          aggregatorClicks: branchClicks.length,
        };
      });

      res.json({ branches });
    } catch (e) {
      next(e);
    }
  });

  // Super-Admin Multi-Branch Brand / Tenant Group Provisioning
  app.get('/api/super-admin/tenants', isSuperAdmin, async (_req, res, next) => {
    try {
      const [allTenants, allCafes, allUsers] = await Promise.all([
        db.select().from(tenants).orderBy(asc(tenants.name)),
        storage.getAllRestaurants(),
        storage.getAllUsers(),
      ]);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      res.json({
        tenants: allTenants.map(t => {
          const owner = t.ownerUserId ? userMap.get(t.ownerUserId) : undefined;
          return {
            ...t,
            ownerEmail: owner?.email || null,
            branches: allCafes.filter(c => c.tenantId === t.id).map(c => ({ id: c.id, name: c.name, slug: c.slug })),
          };
        }),
      });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/super-admin/tenants', isSuperAdmin, async (req, res, next) => {
    try {
      const body = z
        .object({
          name: z.string().trim().min(1).max(150),
          slug: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(120)
            .optional()
            .nullable(),
          ownerUserId: z.string().uuid().optional().nullable(),
          restaurantIds: z.array(z.string().uuid()).max(50).optional(),
        })
        .strict()
        .parse(req.body);

      const created = await db.transaction(async tx => {
        const [tenant] = await tx
          .insert(tenants)
          .values({
            name: body.name,
            slug: body.slug || null,
            ownerUserId: body.ownerUserId || null,
          })
          .returning();

        if (body.restaurantIds?.length) {
          await tx
            .update(restaurants)
            .set({ tenantId: tenant.id, updatedAt: new Date() })
            .where(inArray(restaurants.id, body.restaurantIds));
        }

        if (body.ownerUserId) {
          await tx.insert(staffAssignments).values({
            userId: body.ownerUserId,
            tenantId: tenant.id,
            staffRole: 'tenant_owner',
            isActive: true,
          });
        }

        return tenant;
      });

      res.status(201).json({ tenant: created });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/super-admin/restaurants/:id/tenant', isSuperAdmin, async (req, res, next) => {
    try {
      const restaurantId = z.string().uuid().parse(req.params.id);
      const { tenantId } = z
        .object({ tenantId: z.string().uuid().nullable() })
        .strict()
        .parse(req.body);

      if (tenantId) {
        const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
        if (!t) return res.status(404).json({ message: 'Tenant group not found' });
      }

      const [updated] = await db
        .update(restaurants)
        .set({ tenantId, updatedAt: new Date() })
        .where(eq(restaurants.id, restaurantId))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Restaurant not found' });
      res.json({ restaurant: updated });
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
