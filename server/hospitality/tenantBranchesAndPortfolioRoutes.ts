import type { Express } from 'express';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isAuthenticated, isSuperAdmin } from '../localAuth';
import { authUser, getAccessibleBranches, getManagedCafe } from '../accessControl';
import { loadPlatformConfig } from './platformSettingsRoutes';
import {
  aggregatorClicks,
  categories,
  guestOrders,
  menuItems,
  pagerTickets,
  restaurants,
  sessions,
  smartTags,
  staffAssignments,
  tableReservations,
  tenants,
  users,
  waitlistEntries,
} from '@shared/schema';

export function mountTenantBranchesAndPortfolioRoutes(app: Express) {
  // ===== MULTI-BRANCH WORKSPACE SWITCHER =====
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

  // ===== MULTI-BRANCH PORTFOLIO ANALYTICS =====
  app.get('/api/hospitality/tenant-analytics', isAuthenticated, async (req: any, res, next) => {
    try {
      const [accessible, activeCafe] = await Promise.all([getAccessibleBranches(req), getManagedCafe(req)]);
      const branchIds = accessible.map(b => b.id);
      if (!branchIds.length) return res.json({ totals: null, branches: [] });

      const [cafes, tickets, orders, reservations, clicks, tags, waitlist, items] = await Promise.all([
        db.select().from(restaurants).where(inArray(restaurants.id, branchIds)).orderBy(asc(restaurants.name)),
        db.select().from(pagerTickets).where(inArray(pagerTickets.restaurantId, branchIds)),
        db.select().from(guestOrders).where(inArray(guestOrders.restaurantId, branchIds)),
        db.select().from(tableReservations).where(inArray(tableReservations.restaurantId, branchIds)),
        db.select().from(aggregatorClicks).where(inArray(aggregatorClicks.restaurantId, branchIds)),
        db.select().from(smartTags).where(inArray(smartTags.restaurantId, branchIds)),
        db.select().from(waitlistEntries).where(inArray(waitlistEntries.restaurantId, branchIds)),
        db
          .select({
            restaurantId: categories.restaurantId,
            isAvailable: menuItems.isAvailable,
          })
          .from(menuItems)
          .innerJoin(categories, eq(menuItems.categoryId, categories.id))
          .where(inArray(categories.restaurantId, branchIds)),
      ]);

      const branches = cafes.map(cafe => {
        const branchTickets = tickets.filter(t => t.restaurantId === cafe.id);
        const waitingCount = branchTickets.filter(t => t.status === 'waiting').length;
        const preparingCount = branchTickets.filter(t => t.status === 'preparing').length;
        const readyCount = branchTickets.filter(t => t.status === 'ready').length;
        const activeTickets = waitingCount + preparingCount + readyCount;
        const arrivedBaysCount = branchTickets.filter(
          t => ['waiting', 'preparing', 'ready'].includes(t.status) && t.etaStatus === 'arrived',
        ).length;
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
        const branchTags = tags.filter(t => t.restaurantId === cafe.id);
        const qrScans = branchTags.reduce((s, t) => s + (t.qrScans || 0), 0);
        const nfcTaps = branchTags.reduce((s, t) => s + (t.nfcTaps || 0), 0);
        const waitlistWaitingCount = waitlist.filter(
          w => w.restaurantId === cafe.id && ['waiting', 'ready'].includes(w.status),
        ).length;
        const branchItems = items.filter(i => i.restaurantId === cafe.id);

        return {
          id: cafe.id,
          name: cafe.name,
          slug: cafe.slug,
          status: cafe.status,
          theme: cafe.theme,
          orderingMode: cafe.orderingMode,
          currency: cafe.currency,
          isCurrentBranch: cafe.id === activeCafe?.id,
          activeTickets,
          waitingCount,
          preparingCount,
          readyCount,
          arrivedBaysCount,
          waitlistWaitingCount,
          totalTickets: branchTickets.length,
          avgPrepMins,
          peakHour: branchTickets.length > 0 ? `${String(peakHour).padStart(2, '0')}:00` : '—',
          totalOrders: branchOrders.length,
          revenue,
          reservations: branchRes.length,
          aggregatorClicks: branchClicks.length,
          qrScans,
          nfcTaps,
          visibleMenuItems: branchItems.filter(i => i.isAvailable).length,
          soldOutItems: branchItems.filter(i => !i.isAvailable).length,
        };
      });

      const prepBranches = branches.filter(b => b.avgPrepMins > 0);
      const totals = {
        branchesCount: branches.length,
        activeTicketsNow: branches.reduce((s, b) => s + b.activeTickets, 0),
        arrivedCurbsideNow: branches.reduce((s, b) => s + b.arrivedBaysCount, 0),
        waitingPartiesNow: branches.reduce((s, b) => s + b.waitlistWaitingCount, 0),
        totalTickets: branches.reduce((s, b) => s + b.totalTickets, 0),
        totalOrders: branches.reduce((s, b) => s + b.totalOrders, 0),
        combinedRevenue: branches.reduce((s, b) => s + Number(b.revenue), 0).toFixed(2),
        currency: branches[0]?.currency || 'QAR',
        totalQrScans: branches.reduce((s, b) => s + b.qrScans, 0),
        totalNfcTaps: branches.reduce((s, b) => s + b.nfcTaps, 0),
        avgPrepMins: prepBranches.length
          ? Number((prepBranches.reduce((s, b) => s + b.avgPrepMins, 0) / prepBranches.length).toFixed(1))
          : 0,
      };

      res.json({ totals, branches });
    } catch (e) {
      next(e);
    }
  });

  // ===== SUPER-ADMIN TENANT ORGANIZATIONS & QUOTA CONTROLS =====
  app.get('/api/super-admin/tenants', isSuperAdmin, async (_req, res, next) => {
    try {
      const [allTenants, allCafes, allUsers, allAssigns] = await Promise.all([
        db.select().from(tenants).orderBy(asc(tenants.name)),
        storage.getAllRestaurants(),
        storage.getAllUsers(),
        db.select().from(staffAssignments).where(eq(staffAssignments.isActive, true)),
      ]);
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      res.json({
        tenants: allTenants.map(t => {
          const owner = t.ownerUserId ? userMap.get(t.ownerUserId) : undefined;
          const branches = allCafes
            .filter(c => c.tenantId === t.id)
            .map(c => ({ id: c.id, name: c.name, slug: c.slug, status: c.status }));
          const branchIdSet = new Set(branches.map(b => b.id));
          const staffUserIds = new Set(
            allAssigns
              .filter(a => a.tenantId === t.id || (a.restaurantId && branchIdSet.has(a.restaurantId)))
              .map(a => a.userId),
          );
          if (t.ownerUserId) staffUserIds.add(t.ownerUserId);
          return {
            ...t,
            ownerEmail: owner?.email || null,
            ownerName: owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ') : null,
            staffCount: staffUserIds.size,
            branches,
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
          maxBranches: z.number().int().min(1).max(200).optional(),
          restaurantIds: z.array(z.string().uuid()).max(50).optional(),
        })
        .strict()
        .parse(req.body);

      const platformCfg = await loadPlatformConfig();
      const created = await db.transaction(async tx => {
        const effectiveMax = Math.max(body.maxBranches ?? platformCfg.defaultNewTenantMaxBranches, body.restaurantIds?.length || 1);
        const [tenant] = await tx
          .insert(tenants)
          .values({
            name: body.name,
            slug: body.slug || null,
            ownerUserId: body.ownerUserId || null,
            status: 'active',
            maxBranches: effectiveMax,
          })
          .returning();

        if (body.restaurantIds?.length) {
          await tx
            .update(restaurants)
            .set({ tenantId: tenant.id, updatedAt: new Date() })
            .where(inArray(restaurants.id, body.restaurantIds));
          await tx
            .update(staffAssignments)
            .set({ pinTenantId: tenant.id })
            .where(and(eq(staffAssignments.isActive, true), inArray(staffAssignments.restaurantId, body.restaurantIds)));
        }

        if (body.ownerUserId) {
          await tx.update(users).set({ tenantId: tenant.id }).where(eq(users.id, body.ownerUserId));
          await tx.insert(staffAssignments).values({
            userId: body.ownerUserId,
            tenantId: tenant.id,
            pinTenantId: tenant.id,
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

  app.patch('/api/super-admin/tenants/:id', isSuperAdmin, async (req, res, next) => {
    try {
      const tenantId = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          name: z.string().trim().min(1).max(150).optional(),
          slug: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(120)
            .nullable()
            .optional(),
          status: z.enum(['active', 'suspended']).optional(),
          maxBranches: z.number().int().min(1).max(200).optional(),
          ownerUserId: z.string().uuid().nullable().optional(),
        })
        .strict()
        .refine(v => Object.keys(v).length > 0, 'Provide a tenant field to update')
        .parse(req.body);

      const updated = await db.transaction(async tx => {
        const [existing] = await tx.select().from(tenants).where(eq(tenants.id, tenantId)).for('update');
        if (!existing) return null;

        const [saved] = await tx
          .update(tenants)
          .set({ ...body, updatedAt: new Date() })
          .where(eq(tenants.id, tenantId))
          .returning();

        if (body.status === 'suspended') {
          const tenantUsers = await tx.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId));
          for (const u of tenantUsers) {
            await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${u.id}`);
          }
        }
        return saved;
      });

      if (!updated) return res.status(404).json({ message: 'Tenant organization not found' });
      res.json({ tenant: updated });
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
}
