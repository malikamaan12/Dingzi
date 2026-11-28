import type { Express } from 'express';
import { and, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { storage } from '../storage';
import { isSuperAdmin } from '../localAuth';
import bcrypt from '../passwords';
import { computeStationPinLookup, formatStationPinSecret } from '../pinSecurity';
import { loadPlatformConfig } from './platformSettingsRoutes';
import { stationPinSchema } from '@shared/rbac';
import {
  accessAudit,
  aggregatorLinks,
  diningTables,
  diningZones,
  emailSchema,
  guestOrders,
  orderingModes,
  pagerTickets,
  passwordSchema,
  restaurants,
  serviceBays,
  sessions,
  smartTags,
  staffAssignments,
  tableReservations,
  tenants,
  users,
  waitlistEntries,
} from '@shared/schema';

function toCleanSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function mountSuperAdminLifecycleRoutes(app: Express) {
  // ===== 1. TURNKEY CAFÉ / RESTAURANT ONBOARDING PROVISIONER =====
  app.post('/api/super-admin/onboarding/provision', isSuperAdmin, async (req: any, res, next) => {
    try {
      const schema = z
        .object({
          tenantMode: z.enum(['new_tenant', 'existing_tenant']).default('new_tenant'),
          tenantId: z.string().uuid().optional().nullable(),
          tenantName: z.string().trim().max(150).optional().nullable(),
          maxBranches: z.number().int().min(1).max(200).optional(),

          restaurantName: z.string().trim().min(2).max(120),
          restaurantNameAr: z.string().trim().max(120).optional().nullable(),
          slug: z
            .string()
            .trim()
            .max(80)
            .regex(/^[a-z0-9-]*$/, 'Slug may only contain lowercase letters, numbers, and hyphens')
            .optional()
            .nullable(),
          cuisineType: z.string().trim().max(120).optional().nullable(),
          cuisineTypeAr: z.string().trim().max(120).optional().nullable(),
          address: z.string().trim().max(240).optional().nullable(),
          phone: z.string().trim().max(40).optional().nullable(),
          openingHours: z.string().trim().max(120).optional().nullable(),

          orderingMode: z.enum(orderingModes).default('cart_pay_at_venue'),
          reservationsEnabled: z.boolean().default(true),
          waitlistEnabled: z.boolean().default(true),
          driveThruEnabled: z.boolean().default(false),

          seedStarterFloor: z.boolean().default(true),
          seedStarterSmartTags: z.boolean().default(true),

          ownerFirstName: z.string().trim().max(100).optional().nullable(),
          ownerLastName: z.string().trim().max(100).optional().nullable(),
          ownerEmail: emailSchema.optional().nullable(),
          ownerPassword: passwordSchema.optional().nullable(),
          ownerPin: stationPinSchema.optional().nullable(),
        })
        .strict();

      const body = schema.parse(req.body);
      const platformCfg = await loadPlatformConfig();

      if (body.tenantMode === 'new_tenant') {
        if (!body.ownerEmail || !body.ownerPassword || !body.ownerFirstName || !body.ownerLastName) {
          return res.status(400).json({
            message: 'Provide the Tenant Owner name, email, and initial password (10+ characters).',
          });
        }
        const existingUser = await storage.getUserByEmail(body.ownerEmail);
        if (existingUser) {
          return res.status(409).json({ message: 'That owner email is already registered on the platform.' });
        }
      } else if (!body.tenantId) {
        return res.status(400).json({ message: 'Select an existing Tenant Brand Group.' });
      }

      const baseSlug = toCleanSlug(body.slug || body.restaurantName) || `venue-${Date.now().toString(36)}`;
      const allCafes = await storage.getAllRestaurants();
      const usedSlugs = new Set(allCafes.map(c => (c.slug || '').toLowerCase()).filter(Boolean));
      let resolvedSlug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(resolvedSlug)) {
        resolvedSlug = `${baseSlug}-${suffix++}`;
      }

      // Perform bcrypt hashing outside the DB transaction for Worker safety
      const hashedOwnerPw =
        body.tenantMode === 'new_tenant' && body.ownerPassword
          ? await bcrypt.hash(body.ownerPassword, 12)
          : null;
      const hashedOwnerPin = body.ownerPin
        ? await bcrypt.hash(formatStationPinSecret(body.ownerPin), 12)
        : null;

      const created = await db.transaction(async tx => {
        let activeTenant: typeof tenants.$inferSelect;
        let ownerUser: typeof users.$inferSelect;

        if (body.tenantMode === 'existing_tenant') {
          const [existingTenant] = await tx
            .select()
            .from(tenants)
            .where(eq(tenants.id, body.tenantId!))
            .for('update');
          if (!existingTenant) {
            throw Object.assign(new Error('Selected Tenant Group was not found.'), { status: 404 });
          }
          const branchCountRows = await tx
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(eq(restaurants.tenantId, existingTenant.id));
          if (branchCountRows.length >= existingTenant.maxBranches) {
            const bumpedQuota = branchCountRows.length + 1;
            const [updatedT] = await tx
              .update(tenants)
              .set({ maxBranches: bumpedQuota })
              .where(eq(tenants.id, existingTenant.id))
              .returning();
            activeTenant = updatedT;
          } else {
            activeTenant = existingTenant;
          }

          const fallbackUserId = existingTenant.ownerUserId || req.user.id;
          const [foundOwner] = await tx.select().from(users).where(eq(users.id, fallbackUserId));
          ownerUser = foundOwner || req.user;
        } else {
          const [insertedUser] = await tx
            .insert(users)
            .values({
              email: body.ownerEmail!,
              password: hashedOwnerPw!,
              firstName: body.ownerFirstName!,
              lastName: body.ownerLastName!,
              role: 'admin',
            })
            .returning();

          const groupName = body.tenantName?.trim() || body.restaurantName;
          const groupSlugBase = toCleanSlug(groupName) || `org-${insertedUser.id.slice(0, 8)}`;
          const [existingOrgSlug] = await tx
            .select({ id: tenants.id })
            .from(tenants)
            .where(eq(tenants.slug, groupSlugBase));

          const [insertedTenant] = await tx
            .insert(tenants)
            .values({
              name: groupName,
              slug: existingOrgSlug ? `${groupSlugBase}-${Date.now().toString(36).slice(-4)}` : groupSlugBase,
              ownerUserId: insertedUser.id,
              status: 'active',
              maxBranches: body.maxBranches ?? platformCfg.defaultNewTenantMaxBranches,
            })
            .returning();

          await tx.update(users).set({ tenantId: insertedTenant.id }).where(eq(users.id, insertedUser.id));

          const pinLookupHash = body.ownerPin
            ? computeStationPinLookup(insertedTenant.id, body.ownerPin)
            : null;

          await tx.insert(staffAssignments).values({
            userId: insertedUser.id,
            restaurantId: null,
            tenantId: insertedTenant.id,
            pinTenantId: pinLookupHash ? insertedTenant.id : null,
            staffRole: 'tenant_owner',
            pinHash: hashedOwnerPin,
            pinLookupHash,
            isActive: true,
          });

          activeTenant = insertedTenant;
          ownerUser = insertedUser;
        }

        const [cafe] = await tx
          .insert(restaurants)
          .values({
            userId: ownerUser.id,
            tenantId: activeTenant.id,
            name: body.restaurantName,
            nameAr: body.restaurantNameAr?.trim() || null,
            slug: resolvedSlug,
            cuisineType: body.cuisineType?.trim() || null,
            cuisineTypeAr: body.cuisineTypeAr?.trim() || null,
            address: body.address?.trim() || null,
            phone: body.phone?.trim() || null,
            openingHours: body.openingHours?.trim() || 'Daily · 08:00 AM – 11:00 PM',
            openTime: '08:00',
            closeTime: '23:00',
            currency: platformCfg.defaultCurrency,
            timezone: platformCfg.defaultTimezone,
            orderingMode: body.orderingMode,
            reservationsEnabled: body.reservationsEnabled,
            waitlistEnabled: body.waitlistEnabled,
            driveThruEnabled: body.driveThruEnabled,
            pagerMiniGameEnabled: true,
          })
          .returning();

        let tablesCreated = 0;
        let baysCreated = 0;
        let firstTableId: string | null = null;
        let firstBayId: string | null = null;

        if (body.seedStarterFloor) {
          const [z1] = await tx
            .insert(diningZones)
            .values({ restaurantId: cafe.id, name: 'Main Dining Room', nameAr: 'الصالة الرئيسية', order: 0 })
            .returning();
          const [z2] = await tx
            .insert(diningZones)
            .values({ restaurantId: cafe.id, name: 'Outdoor Terrace', nameAr: 'التراس الخارجي', order: 1 })
            .returning();

          const tableRows = await tx
            .insert(diningTables)
            .values([
              { restaurantId: cafe.id, zoneId: z1.id, tableCode: 'T-01', minCovers: 1, maxCovers: 2, isCombinable: false },
              { restaurantId: cafe.id, zoneId: z1.id, tableCode: 'T-02', minCovers: 2, maxCovers: 4, isCombinable: true },
              { restaurantId: cafe.id, zoneId: z1.id, tableCode: 'T-03', minCovers: 2, maxCovers: 4, isCombinable: true },
              { restaurantId: cafe.id, zoneId: z2.id, tableCode: 'T-04', minCovers: 4, maxCovers: 6, isCombinable: true },
            ])
            .returning();
          tablesCreated = tableRows.length;
          firstTableId = tableRows[0]?.id || null;
        }

        if (body.driveThruEnabled) {
          const bayRows = await tx
            .insert(serviceBays)
            .values([
              { restaurantId: cafe.id, code: 'BAY-01', label: 'Curbside Pickup Spot 1', bayType: 'curbside', order: 0 },
              { restaurantId: cafe.id, code: 'BAY-02', label: 'Curbside Pickup Spot 2', bayType: 'curbside', order: 1 },
            ])
            .returning();
          baysCreated = bayRows.length;
          firstBayId = bayRows[0]?.id || null;
        }

        let smartTagsCreated = 0;
        if (body.seedStarterSmartTags) {
          const tagSpecs: (typeof smartTags.$inferInsert)[] = [
            {
              restaurantId: cafe.id,
              tagCode: 'MENU-MAIN',
              label: 'Counter Menu Stand (QR + NFC)',
              hardwareKind: 'dual_qr_nfc',
              targetType: 'venue_menu',
            },
            {
              restaurantId: cafe.id,
              tagCode: 'HOST-WL',
              label: 'Entrance Walk-In Waitlist Stand',
              hardwareKind: 'dual_qr_nfc',
              targetType: 'waitlist_join',
            },
            ...(firstTableId
              ? [
                  {
                    restaurantId: cafe.id,
                    tagCode: 'TBL-T01',
                    label: 'Table T-01 Ordering Disc',
                    hardwareKind: 'dual_qr_nfc' as const,
                    targetType: 'dining_table' as const,
                    tableId: firstTableId,
                  },
                ]
              : []),
            ...(firstBayId
              ? [
                  {
                    restaurantId: cafe.id,
                    tagCode: 'BAY-01-SIGN',
                    label: 'Curbside Bay 1 Sign',
                    hardwareKind: 'dual_qr_nfc' as const,
                    targetType: 'curbside_bay' as const,
                    bayId: firstBayId,
                  },
                ]
              : []),
            {
              restaurantId: cafe.id,
              tagCode: 'COASTER-01',
              label: 'Reusable Pager Coaster #01',
              hardwareKind: 'coaster_puck',
              targetType: 'reusable_pager',
            },
            {
              restaurantId: cafe.id,
              tagCode: 'COASTER-02',
              label: 'Reusable Pager Coaster #02',
              hardwareKind: 'coaster_puck',
              targetType: 'reusable_pager',
            },
            {
              restaurantId: cafe.id,
              tagCode: 'COASTER-03',
              label: 'Reusable Pager Coaster #03',
              hardwareKind: 'coaster_puck',
              targetType: 'reusable_pager',
            },
          ];
          const insertedTags = await tx.insert(smartTags).values(tagSpecs).returning();
          smartTagsCreated = insertedTags.length;
        }

        await tx.insert(accessAudit).values({
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorRole: 'super_admin',
          tenantId: activeTenant.id,
          cafeId: cafe.id,
          cafeName: cafe.name,
          action: 'POST /api/super-admin/onboarding/provision',
          status: 201,
        });

        return {
          cafe,
          tenant: activeTenant,
          ownerEmail: ownerUser.email,
          seededSummary: {
            tablesCreated,
            baysCreated,
            smartTagsCreated,
          },
        };
      });

      res.status(201).json(created);
    } catch (e: any) {
      if (e.code === '23505' || e.cause?.code === '23505') {
        return res.status(409).json({ message: 'Duplicate email, slug, or station PIN conflict.' });
      }
      next(e);
    }
  });

  // ===== 2. VENUE ONBOARDING READINESS & OFFBOARDING IMPACT SUMMARY =====
  app.get('/api/super-admin/restaurants/:id/lifecycle', isSuperAdmin, async (req, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const cafe = await storage.getRestaurantById(id);
      if (!cafe) return res.status(404).json({ message: 'Venue not found' });

      const [cats, items, orders, tickets, reservations, zones, tables, bays, tags, tenantRows] =
        await Promise.all([
          storage.getCategoriesByRestaurantId(id),
          storage.getMenuItemsByRestaurantId(id),
          db.select().from(guestOrders).where(eq(guestOrders.restaurantId, id)),
          db.select().from(pagerTickets).where(eq(pagerTickets.restaurantId, id)),
          db.select().from(tableReservations).where(eq(tableReservations.restaurantId, id)),
          db.select().from(diningZones).where(eq(diningZones.restaurantId, id)),
          db.select().from(diningTables).where(eq(diningTables.restaurantId, id)),
          db.select().from(serviceBays).where(eq(serviceBays.restaurantId, id)),
          db.select().from(smartTags).where(eq(smartTags.restaurantId, id)),
          cafe.tenantId ? db.select().from(tenants).where(eq(tenants.id, cafe.tenantId)) : Promise.resolve([]),
        ]);

      const tenant = tenantRows[0] || null;
      const otherTenantBranches = cafe.tenantId
        ? await db
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(and(eq(restaurants.tenantId, cafe.tenantId), ne(restaurants.id, id)))
        : [];

      const staffAssigns = await db
        .select()
        .from(staffAssignments)
        .where(
          and(
            eq(staffAssignments.isActive, true),
            or(
              eq(staffAssignments.restaurantId, id),
              ...(cafe.tenantId
                ? [and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, cafe.tenantId))]
                : []),
            ),
          ),
        );
      const uniqueStaffIds = new Set([cafe.userId, ...staffAssigns.map(a => a.userId)]);
      const hasAnyPin = staffAssigns.some(a => Boolean(a.pinHash));

      const checklist = [
        {
          id: 'identity',
          label: 'Venue name, opening hours & contact info',
          done: Boolean(cafe.name && (cafe.openingHours || cafe.openTime)),
        },
        {
          id: 'slug',
          label: `Short guest link (/v/${cafe.slug || 'slug'}) configured`,
          done: Boolean(cafe.slug),
        },
        {
          id: 'menu',
          label: 'Menu categories & available items published',
          done: cats.length > 0 && items.some(i => i.isAvailable),
        },
        {
          id: 'floor',
          label: 'Dining zones & tables (or counter mode) ready',
          done: !cafe.reservationsEnabled || (zones.length > 0 && tables.length > 0),
        },
        {
          id: 'qr_nfc',
          label: 'QR / NFC smart tags or counter coasters created',
          done: tags.length > 0,
        },
        {
          id: 'team_pins',
          label: 'Owner & staff Station PINs ready for tablets',
          done: uniqueStaffIds.size >= 1 && hasAnyPin,
        },
      ];
      const completedCount = checklist.filter(c => c.done).length;
      const settledRevenue = orders
        .filter(o => o.paymentStatus === 'paid' || o.paymentStatus === 'pay_at_venue')
        .reduce((s, o) => s + Number(o.total), 0)
        .toFixed(2);

      res.json({
        onboarding: {
          completedCount,
          totalCount: checklist.length,
          completionPct: Math.round((completedCount / checklist.length) * 100),
          checklist,
        },
        impact: {
          tenantName: tenant?.name || null,
          otherTenantBranchesCount: otherTenantBranches.length,
          categoriesCount: cats.length,
          menuItemsCount: items.length,
          ordersCount: orders.length,
          settledRevenue,
          currency: cafe.currency,
          activeTicketsCount: tickets.filter(t => ['waiting', 'preparing', 'ready'].includes(t.status)).length,
          reservationsCount: reservations.length,
          tablesCount: tables.length,
          baysCount: bays.length,
          smartTagsCount: tags.length,
          staffMembersCount: uniqueStaffIds.size,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== 3. COMPLETE PORTABLE OFFBOARDING ARCHIVE DOWNLOAD (.JSON) =====
  app.get('/api/super-admin/restaurants/:id/offboarding-archive', isSuperAdmin, async (req: any, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const cafe = await storage.getRestaurantById(id);
      if (!cafe) return res.status(404).json({ message: 'Venue not found' });

      const [cats, items, variants, zones, tables, bays, aggregators, tags, orders, reservations, waitlist, tenantRows] =
        await Promise.all([
          storage.getCategoriesByRestaurantId(id),
          storage.getMenuItemsByRestaurantId(id),
          storage.getPriceVariantsByRestaurantId(id),
          db.select().from(diningZones).where(eq(diningZones.restaurantId, id)),
          db.select().from(diningTables).where(eq(diningTables.restaurantId, id)),
          db.select().from(serviceBays).where(eq(serviceBays.restaurantId, id)),
          db.select().from(aggregatorLinks).where(eq(aggregatorLinks.restaurantId, id)),
          db.select().from(smartTags).where(eq(smartTags.restaurantId, id)),
          db.select().from(guestOrders).where(eq(guestOrders.restaurantId, id)).orderBy(desc(guestOrders.createdAt)),
          db.select().from(tableReservations).where(eq(tableReservations.restaurantId, id)),
          db.select().from(waitlistEntries).where(eq(waitlistEntries.restaurantId, id)),
          cafe.tenantId ? db.select().from(tenants).where(eq(tenants.id, cafe.tenantId)) : Promise.resolve([]),
        ]);

      const rosterRows = await db
        .select({
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          accountStatus: users.accountStatus,
          staffRole: staffAssignments.staffRole,
          capabilities: staffAssignments.capabilities,
        })
        .from(staffAssignments)
        .innerJoin(users, eq(staffAssignments.userId, users.id))
        .where(
          and(
            eq(staffAssignments.isActive, true),
            or(
              eq(staffAssignments.restaurantId, id),
              ...(cafe.tenantId
                ? [and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, cafe.tenantId))]
                : []),
            ),
          ),
        );

      await db.insert(accessAudit).values({
        actorId: req.user.id,
        actorEmail: req.user.email,
        actorRole: 'super_admin',
        tenantId: cafe.tenantId,
        cafeId: cafe.id,
        cafeName: cafe.name,
        action: 'GET /api/super-admin/restaurants/:id/offboarding-archive',
        status: 200,
      });

      const dateTag = new Date().toISOString().slice(0, 10);
      const safeSlug = cafe.slug || cafe.id.slice(0, 8);
      res.attachment(`dingzi-offboarding-archive-${safeSlug}-${dateTag}.json`).json({
        archiveVersion: 1,
        exportedAt: new Date().toISOString(),
        exportedBy: req.user.email,
        tenant: tenantRows[0] || null,
        restaurant: cafe,
        teamRoster: rosterRows,
        catalog: {
          categories: cats,
          menuItems: items,
          priceVariants: variants,
        },
        floorAndHardware: {
          diningZones: zones,
          diningTables: tables,
          serviceBays: bays,
          smartTags: tags.map(({ activeTicketId: _a, ...rest }) => rest),
          aggregatorLinks: aggregators,
        },
        history: {
          ordersCount: orders.length,
          orders,
          reservations,
          waitlist,
        },
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== 4. STRUCTURED 3-STAGE OFFBOARDING & REACTIVATION =====
  app.post('/api/super-admin/restaurants/:id/offboard', isSuperAdmin, async (req: any, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const body = z
        .object({
          stage: z.enum(['hide_public', 'pause_venue', 'decommission']),
          reason: z.string().trim().max(300).optional(),
          freezeExclusiveStaff: z.boolean().default(true),
          confirmName: z.string().trim().max(200).optional(),
        })
        .strict()
        .parse(req.body);

      const cafe = await storage.getRestaurantById(id);
      if (!cafe) return res.status(404).json({ message: 'Venue not found' });

      if (body.stage === 'hide_public') {
        const updated = await storage.updateRestaurant(cafe.id, { hidden: true });
        await db.insert(accessAudit).values({
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorRole: 'super_admin',
          tenantId: cafe.tenantId,
          cafeId: cafe.id,
          cafeName: cafe.name,
          action: 'POST /api/super-admin/restaurants/:id/offboard [hide_public]',
          status: 200,
        });
        return res.json({ stage: 'hide_public', restaurant: updated });
      }

      if (body.stage === 'pause_venue') {
        const reason = (body.reason || '').trim();
        if (reason.length < 5) {
          return res.status(400).json({ message: 'Provide an offboarding / pause reason (at least 5 characters).' });
        }

        const result = await db.transaction(async tx => {
          const [updated] = await tx
            .update(restaurants)
            .set({ status: 'suspended', suspensionReason: reason, updatedAt: new Date() })
            .where(eq(restaurants.id, cafe.id))
            .returning();

          // Close dangling active pagers & detach reusable coasters cleanly
          await tx
            .update(pagerTickets)
            .set({ status: 'no_show', collectedAt: new Date() })
            .where(
              and(
                eq(pagerTickets.restaurantId, cafe.id),
                inArray(pagerTickets.status, ['waiting', 'preparing', 'ready']),
              ),
            );
          await tx
            .update(smartTags)
            .set({ activeTicketId: null })
            .where(eq(smartTags.restaurantId, cafe.id));

          // Revoke PIN/branch sessions pinned to this venue
          await tx.delete(sessions).where(sql`${sessions.sess}->>'cafeId' = ${cafe.id}`);

          let frozenStaffCount = 0;
          if (body.freezeExclusiveStaff) {
            const candidatePauseIds = new Set<string>([cafe.userId]);
            const branchAssigns = await tx
              .select({ userId: staffAssignments.userId })
              .from(staffAssignments)
              .where(
                and(
                  eq(staffAssignments.isActive, true),
                  or(
                    eq(staffAssignments.restaurantId, cafe.id),
                    ...(cafe.tenantId
                      ? [and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, cafe.tenantId))]
                      : []),
                  ),
                ),
              );
            for (const a of branchAssigns) candidatePauseIds.add(a.userId);

            const otherActiveTenantBranches = cafe.tenantId
              ? await tx
                  .select({ id: restaurants.id })
                  .from(restaurants)
                  .where(
                    and(
                      eq(restaurants.tenantId, cafe.tenantId),
                      ne(restaurants.id, cafe.id),
                      eq(restaurants.status, 'active'),
                    ),
                  )
                  .limit(1)
              : [];

            for (const userId of Array.from(candidatePauseIds)) {
              const [u] = await tx.select().from(users).where(eq(users.id, userId));
              if (!u || u.role === 'super_admin' || u.id === req.user.id) continue;

              const otherOwned = await tx
                .select({ id: restaurants.id })
                .from(restaurants)
                .where(and(eq(restaurants.userId, userId), ne(restaurants.id, cafe.id), eq(restaurants.status, 'active')))
                .limit(1);
              const otherBranchAssign = await tx
                .select({ id: staffAssignments.id })
                .from(staffAssignments)
                .where(
                  and(
                    eq(staffAssignments.userId, userId),
                    eq(staffAssignments.isActive, true),
                    sql`${staffAssignments.restaurantId} IS NOT NULL`,
                    ne(staffAssignments.restaurantId, cafe.id),
                  ),
                )
                .limit(1);
              const hasTenantWideOnActiveSibling =
                otherActiveTenantBranches.length > 0 &&
                (
                  await tx
                    .select({ id: staffAssignments.id })
                    .from(staffAssignments)
                    .where(
                      and(
                        eq(staffAssignments.userId, userId),
                        eq(staffAssignments.isActive, true),
                        isNull(staffAssignments.restaurantId),
                        eq(staffAssignments.tenantId, cafe.tenantId!),
                      ),
                    )
                    .limit(1)
                ).length > 0;

              if (!otherOwned.length && !otherBranchAssign.length && !hasTenantWideOnActiveSibling) {
                await tx.update(users).set({ accountStatus: 'frozen', updatedAt: new Date() }).where(eq(users.id, userId));
                await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${userId}`);
                frozenStaffCount++;
              }
            }
          }

          await tx.insert(accessAudit).values({
            actorId: req.user.id,
            actorEmail: req.user.email,
            actorRole: 'super_admin',
            tenantId: cafe.tenantId,
            cafeId: cafe.id,
            cafeName: cafe.name,
            action: 'POST /api/super-admin/restaurants/:id/offboard [pause_venue]',
            status: 200,
          });

          return { restaurant: updated, frozenStaffCount };
        });

        return res.json({ stage: 'pause_venue', ...result });
      }

      // Stage 3: Permanent Decommission (Irreversible)
      if ((body.confirmName || '').trim() !== cafe.name.trim()) {
        return res.status(400).json({
          message: `Type the exact venue name "${cafe.name}" to confirm permanent decommissioning.`,
        });
      }

      const decommissioned = await db.transaction(async tx => {
        const candidateUserIds = new Set<string>([cafe.userId]);
        const branchAssigns = await tx
          .select({ userId: staffAssignments.userId })
          .from(staffAssignments)
          .where(
            or(
              eq(staffAssignments.restaurantId, cafe.id),
              ...(cafe.tenantId
                ? [and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, cafe.tenantId))]
                : []),
            ),
          );
        for (const a of branchAssigns) candidateUserIds.add(a.userId);

        await tx.delete(sessions).where(sql`${sessions.sess}->>'cafeId' = ${cafe.id}`);
        await tx.delete(restaurants).where(eq(restaurants.id, cafe.id));

        let tenantDeleted = false;
        if (cafe.tenantId) {
          const remainingInTenant = await tx
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(eq(restaurants.tenantId, cafe.tenantId))
            .limit(1);
          if (remainingInTenant.length === 0) {
            await tx.delete(staffAssignments).where(eq(staffAssignments.tenantId, cafe.tenantId));
            await tx.update(users).set({ tenantId: null }).where(eq(users.tenantId, cafe.tenantId));
            await tx.delete(tenants).where(eq(tenants.id, cafe.tenantId));
            tenantDeleted = true;
          }
        }

        let removedUsers = 0;
        for (const uid of Array.from(candidateUserIds)) {
          const [u] = await tx.select().from(users).where(eq(users.id, uid));
          if (!u || u.role === 'super_admin' || u.id === req.user.id) continue;

          const stillOwns = await tx
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(eq(restaurants.userId, uid))
            .limit(1);
          const stillAssigned = await tx
            .select({ id: staffAssignments.id })
            .from(staffAssignments)
            .where(and(eq(staffAssignments.userId, uid), eq(staffAssignments.isActive, true)))
            .limit(1);

          if (!stillOwns.length && !stillAssigned.length) {
            await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${uid}`);
            await tx.delete(users).where(and(eq(users.id, uid), eq(users.role, 'admin')));
            removedUsers++;
          }
        }

        await tx.insert(accessAudit).values({
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorRole: 'super_admin',
          tenantId: tenantDeleted ? null : cafe.tenantId,
          cafeId: null,
          cafeName: cafe.name,
          action: 'POST /api/super-admin/restaurants/:id/offboard [decommission]',
          status: 200,
        });

        return { deletedVenueName: cafe.name, tenantDeleted, removedUsers };
      });

      return res.json({ stage: 'decommission', ...decommissioned });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/super-admin/restaurants/:id/reactivate', isSuperAdmin, async (req: any, res, next) => {
    try {
      const id = z.string().uuid().parse(req.params.id);
      const cafe = await storage.getRestaurantById(id);
      if (!cafe) return res.status(404).json({ message: 'Venue not found' });

      const updated = await db.transaction(async tx => {
        const [restored] = await tx
          .update(restaurants)
          .set({ status: 'active', hidden: false, suspensionReason: null, updatedAt: new Date() })
          .where(eq(restaurants.id, cafe.id))
          .returning();

        const restoreUserIds = new Set<string>([cafe.userId]);
        const assigns = await tx
          .select({ userId: staffAssignments.userId })
          .from(staffAssignments)
          .where(
            and(
              eq(staffAssignments.isActive, true),
              or(
                eq(staffAssignments.restaurantId, cafe.id),
                ...(cafe.tenantId
                  ? [and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, cafe.tenantId))]
                  : []),
              ),
            ),
          );
        for (const a of assigns) restoreUserIds.add(a.userId);
        for (const userId of Array.from(restoreUserIds)) {
          await tx
            .update(users)
            .set({ accountStatus: 'active', updatedAt: new Date() })
            .where(and(eq(users.id, userId), eq(users.accountStatus, 'frozen')));
        }

        if (cafe.tenantId) {
          await tx.update(tenants).set({ status: 'active' }).where(eq(tenants.id, cafe.tenantId));
        }

        await tx.insert(accessAudit).values({
          actorId: req.user.id,
          actorEmail: req.user.email,
          actorRole: 'super_admin',
          tenantId: cafe.tenantId,
          cafeId: cafe.id,
          cafeName: cafe.name,
          action: 'POST /api/super-admin/restaurants/:id/reactivate',
          status: 200,
        });

        return restored;
      });

      res.json({ restaurant: updated });
    } catch (e) {
      next(e);
    }
  });
}
