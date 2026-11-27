import type { Express } from 'express';
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db';
import { isAuthenticated } from '../localAuth';
import { authUser, getAccessibleBranches, getEffectiveStaffRole, getManagedCafe } from '../accessControl';
import bcrypt from '../passwords';
import { computeStationPinLookup } from '../pinSecurity';
import {
  accessAudit,
  emailSchema,
  orderingModes,
  passwordSchema,
  restaurants,
  sessions,
  staffAssignments,
  staffRoles,
  tenants,
  users,
  type Restaurant,
  type StaffRole,
  type Tenant,
} from '@shared/schema';
import {
  resolveStaffCapabilities,
  staffCapabilitiesSchema,
  stationPinSchema,
} from '@shared/rbac';

const ROLE_RANK: Record<StaffRole, number> = {
  tenant_owner: 4,
  branch_manager: 3,
  host_cashier: 2,
  prep_barista: 1,
};

export async function ensureCafeTenantTx(tx: any, cafe: Restaurant): Promise<Tenant> {
  if (cafe.tenantId) {
    const [existing] = await tx.select().from(tenants).where(eq(tenants.id, cafe.tenantId)).for('update');
    if (existing) return existing;
  }

  const [created] = await tx
    .insert(tenants)
    .values({
      name: cafe.name,
      slug: `org-${cafe.id.slice(0, 12)}`,
      ownerUserId: cafe.userId,
      status: 'active',
      maxBranches: 1,
    })
    .returning();

  await tx.update(restaurants).set({ tenantId: created.id }).where(eq(restaurants.id, cafe.id));
  await tx
    .update(users)
    .set({ tenantId: created.id })
    .where(and(eq(users.id, cafe.userId), eq(users.role, 'admin'), isNull(users.tenantId)));
  await tx
    .insert(staffAssignments)
    .values({
      userId: cafe.userId,
      tenantId: created.id,
      pinTenantId: created.id,
      staffRole: 'tenant_owner',
      isActive: true,
    })
    .onConflictDoNothing();

  cafe.tenantId = created.id;
  return created;
}

async function userBelongsToForeignTenantTx(tx: any, userId: string, currentTenantId: string): Promise<boolean> {
  const [userRow] = await tx.select({ tenantId: users.tenantId }).from(users).where(eq(users.id, userId));
  if (userRow?.tenantId && userRow.tenantId !== currentTenantId) return true;

  const [foreignOwnedCafe] = await tx
    .select({ id: restaurants.id })
    .from(restaurants)
    .where(and(eq(restaurants.userId, userId), ne(restaurants.tenantId, currentTenantId)))
    .limit(1);
  if (foreignOwnedCafe) return true;

  const [foreignAssign] = await tx
    .select({ id: staffAssignments.id })
    .from(staffAssignments)
    .leftJoin(restaurants, eq(staffAssignments.restaurantId, restaurants.id))
    .where(
      and(
        eq(staffAssignments.userId, userId),
        eq(staffAssignments.isActive, true),
        or(
          and(sql`${staffAssignments.tenantId} IS NOT NULL`, ne(staffAssignments.tenantId, currentTenantId)),
          and(sql`${restaurants.tenantId} IS NOT NULL`, ne(restaurants.tenantId, currentTenantId)),
        ),
      ),
    )
    .limit(1);
  return Boolean(foreignAssign);
}

export function mountTeamAndRbacRoutes(app: Express) {
  // ===== TENANT & BRANCH TEAM ROSTER =====
  app.get('/api/hospitality/team', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const staffRole = await getEffectiveStaffRole(req);
      const accessibleBranches = await getAccessibleBranches(req);

      const tenant = await db.transaction(tx => ensureCafeTenantTx(tx, cafe));
      const tenantBranches = await db
        .select()
        .from(restaurants)
        .where(eq(restaurants.tenantId, tenant.id))
        .orderBy(asc(restaurants.name));
      const tenantBranchIds = tenantBranches.map(b => b.id);
      const branchNameById = new Map(tenantBranches.map(b => [b.id, b.name]));

      const canViewEntireTenant = staffRole === 'super_admin' || staffRole === 'tenant_owner';
      const allowedBranchIds = canViewEntireTenant
        ? tenantBranchIds
        : accessibleBranches.map(b => b.id);

      const rawAssignments = await db
        .select({
          id: staffAssignments.id,
          userId: staffAssignments.userId,
          restaurantId: staffAssignments.restaurantId,
          tenantId: staffAssignments.tenantId,
          staffRole: staffAssignments.staffRole,
          capabilities: staffAssignments.capabilities,
          pinHash: staffAssignments.pinHash,
          isActive: staffAssignments.isActive,
          createdAt: staffAssignments.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          accountStatus: users.accountStatus,
        })
        .from(staffAssignments)
        .innerJoin(users, eq(staffAssignments.userId, users.id))
        .where(
          and(
            eq(staffAssignments.isActive, true),
            ne(users.accountStatus, 'deleted'),
            or(
              ...(allowedBranchIds.length > 0 ? [inArray(staffAssignments.restaurantId, allowedBranchIds)] : []),
              and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, tenant.id)),
            ),
          ),
        )
        .orderBy(desc(staffAssignments.createdAt));

      const [primaryOwner] = await db
        .select({
          id: users.id,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
          accountStatus: users.accountStatus,
        })
        .from(users)
        .where(eq(users.id, tenant.ownerUserId || cafe.userId));

      const sanitizedFlat = rawAssignments.map(({ pinHash, ...rest }) => ({
        ...rest,
        branchName: rest.restaurantId ? branchNameById.get(rest.restaurantId) || null : null,
        hasPin: Boolean(pinHash),
        resolvedCapabilities: resolveStaffCapabilities(rest.staffRole as StaffRole, rest.capabilities),
      }));

      const membersMap = new Map<
        string,
        {
          userId: string;
          email: string;
          firstName: string | null;
          lastName: string | null;
          accountStatus: string;
          isPrimaryTenantOwner: boolean;
          highestRole: StaffRole;
          hasPin: boolean;
          assignments: typeof sanitizedFlat;
        }
      >();

      for (const a of sanitizedFlat) {
        const existing = membersMap.get(a.userId);
        const role = a.staffRole as StaffRole;
        if (!existing) {
          membersMap.set(a.userId, {
            userId: a.userId,
            email: a.email,
            firstName: a.firstName,
            lastName: a.lastName,
            accountStatus: a.accountStatus,
            isPrimaryTenantOwner: a.userId === (tenant.ownerUserId || cafe.userId),
            highestRole: role,
            hasPin: a.hasPin,
            assignments: [a],
          });
        } else {
          existing.assignments.push(a);
          if (ROLE_RANK[role] > ROLE_RANK[existing.highestRole]) existing.highestRole = role;
          if (a.hasPin) existing.hasPin = true;
        }
      }

      res.json({
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          maxBranches: tenant.maxBranches,
          currentBranchesCount: tenantBranches.length,
        },
        tenantBranches: canViewEntireTenant
          ? tenantBranches.map(b => ({ id: b.id, name: b.name, slug: b.slug, status: b.status }))
          : accessibleBranches.map(b => ({ id: b.id, name: b.name, slug: b.slug, status: 'active' })),
        primaryManager: primaryOwner || null,
        assignments: sanitizedFlat,
        members: Array.from(membersMap.values()),
        callerRole: staffRole,
        accessibleBranches,
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== PROVISION TENANT / BRANCH STAFF OR RECEPTION ACCOUNT =====
  app.post('/api/hospitality/team', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      const accessibleBranches = await getAccessibleBranches(req);

      const body = z
        .object({
          email: emailSchema,
          password: passwordSchema.optional(),
          firstName: z.string().trim().min(1).max(100),
          lastName: z.string().trim().min(1).max(100),
          staffRole: z.enum(staffRoles),
          applyTenantWide: z.boolean().default(false),
          restaurantIds: z.array(z.string().uuid()).max(50).optional(),
          capabilities: staffCapabilitiesSchema.optional(),
          stationPin: stationPinSchema.optional(),
        })
        .strict()
        .parse(req.body);

      const isTenantAdminOrHigher = callerRole === 'super_admin' || callerRole === 'tenant_owner';
      if (!isTenantAdminOrHigher) {
        if (body.staffRole === 'tenant_owner' || body.staffRole === 'branch_manager') {
          return res.status(403).json({
            message: 'Branch Managers can only provision Reception & Cashier or Order Prep accounts.',
          });
        }
        if (body.applyTenantWide) {
          return res.status(403).json({
            message: 'Only a Tenant Admin can grant access across all tenant branches.',
          });
        }
      }

      const hashedPassword = body.password ? await bcrypt.hash(body.password, 12) : null;
      const hashedPin = body.stationPin ? await bcrypt.hash(body.stationPin, 12) : null;

      const created = await db.transaction(async tx => {
        const tenant = await ensureCafeTenantTx(tx, cafe);
        const tenantBranches = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(eq(restaurants.tenantId, tenant.id));
        const validTenantBranchSet = new Set(tenantBranches.map(b => b.id));
        const callerAllowedSet = isTenantAdminOrHigher
          ? validTenantBranchSet
          : new Set(accessibleBranches.map(b => b.id));

        const useTenantWide = body.staffRole === 'tenant_owner' || body.applyTenantWide;
        const targetBranchIds = useTenantWide
          ? []
          : Array.from(new Set(body.restaurantIds?.length ? body.restaurantIds : [cafe.id]));

        for (const bid of targetBranchIds) {
          if (!validTenantBranchSet.has(bid) || !callerAllowedSet.has(bid)) {
            throw Object.assign(new Error('Selected branch is outside your tenant or branch permissions.'), {
              status: 403,
            });
          }
        }

        let [user] = await tx
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${body.email}`)
          .for('update');

        if (!user) {
          if (!hashedPassword) {
            throw Object.assign(new Error('Provide an initial password (10+ characters) for a new staff account.'), {
              status: 400,
            });
          }
          [user] = await tx
            .insert(users)
            .values({
              email: body.email,
              password: hashedPassword,
              firstName: body.firstName,
              lastName: body.lastName,
              role: 'admin',
              tenantId: tenant.id,
            })
            .returning();
        } else {
          if (user.role === 'super_admin') {
            throw Object.assign(new Error('Super admin accounts already have full workspace elevation.'), {
              status: 409,
            });
          }
          if (user.accountStatus !== 'active') {
            throw Object.assign(new Error('This staff account is frozen or deleted.'), { status: 409 });
          }
          if (await userBelongsToForeignTenantTx(tx, user.id, tenant.id)) {
            throw Object.assign(
              new Error('This email belongs to another tenant organization. Use a dedicated staff email.'),
              { status: 409 },
            );
          }
          if (!user.tenantId) {
            await tx.update(users).set({ tenantId: tenant.id }).where(eq(users.id, user.id));
          }
        }

        let pinLookupHash: string | null = null;
        if (body.stationPin) {
          pinLookupHash = computeStationPinLookup(tenant.id, body.stationPin);
          const [pinConflict] = await tx
            .select({ id: staffAssignments.id })
            .from(staffAssignments)
            .where(
              and(
                eq(staffAssignments.isActive, true),
                eq(staffAssignments.pinTenantId, tenant.id),
                eq(staffAssignments.pinLookupHash, pinLookupHash),
                ne(staffAssignments.userId, user.id),
              ),
            )
            .limit(1);
          if (pinConflict) {
            throw Object.assign(
              new Error('Another staff member in your tenant already uses that 6-digit Station PIN.'),
              { status: 409 },
            );
          }
        }

        const insertedAssignments = [];
        if (useTenantWide) {
          await tx
            .update(staffAssignments)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(staffAssignments.userId, user.id),
                eq(staffAssignments.isActive, true),
                or(eq(staffAssignments.tenantId, tenant.id), inArray(staffAssignments.restaurantId, Array.from(validTenantBranchSet))),
              ),
            );
          const [row] = await tx
            .insert(staffAssignments)
            .values({
              userId: user.id,
              restaurantId: null,
              tenantId: tenant.id,
              pinTenantId: pinLookupHash ? tenant.id : null,
              staffRole: body.staffRole,
              capabilities: body.capabilities || {},
              pinHash: hashedPin,
              pinLookupHash,
              isActive: true,
            })
            .returning();
          insertedAssignments.push(row);
        } else {
          await tx
            .update(staffAssignments)
            .set({ isActive: false, updatedAt: new Date() })
            .where(
              and(
                eq(staffAssignments.userId, user.id),
                eq(staffAssignments.isActive, true),
                inArray(staffAssignments.restaurantId, targetBranchIds),
              ),
            );
          for (let idx = 0; idx < targetBranchIds.length; idx++) {
            const branchId = targetBranchIds[idx];
            // Store the unique indexed lookup hash on the first active assignment row (or check across rows)
            const [row] = await tx
              .insert(staffAssignments)
              .values({
                userId: user.id,
                restaurantId: branchId,
                tenantId: null,
                pinTenantId: idx === 0 && pinLookupHash ? tenant.id : null,
                staffRole: body.staffRole,
                capabilities: body.capabilities || {},
                pinHash: hashedPin,
                pinLookupHash: idx === 0 ? pinLookupHash : null,
                isActive: true,
              })
              .returning();
            insertedAssignments.push(row);
          }
        }

        const { pinHash: _ph, ...primaryAssignment } = insertedAssignments[0];
        return {
          assignment: { ...primaryAssignment, hasPin: Boolean(hashedPin) },
          assignments: insertedAssignments.map(({ pinHash: _p, ...r }) => ({ ...r, hasPin: Boolean(hashedPin) })),
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
          },
        };
      });

      res.status(201).json(created);
    } catch (e: any) {
      if (e.code === '23505' || e.cause?.code === '23505') {
        return res.status(409).json({ message: 'Duplicate staff email, assignment, or 6-digit Station PIN.' });
      }
      next(e);
    }
  });

  // ===== SELF-SERVICE STAFF LIFECYCLE (ROLE, CAPABILITIES, FREEZE, PASSWORD, PIN) =====
  app.patch('/api/hospitality/team/:userId', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      const accessibleBranches = await getAccessibleBranches(req);
      const targetUserId = z.string().uuid().parse(req.params.userId);

      const body = z
        .object({
          firstName: z.string().trim().min(1).max(100).optional(),
          lastName: z.string().trim().min(1).max(100).optional(),
          staffRole: z.enum(staffRoles).optional(),
          applyTenantWide: z.boolean().optional(),
          restaurantIds: z.array(z.string().uuid()).min(1).max(50).optional(),
          capabilities: staffCapabilitiesSchema.optional(),
          accountStatus: z.enum(['active', 'frozen']).optional(),
          newPassword: passwordSchema.optional(),
          stationPin: stationPinSchema.nullable().optional(),
        })
        .strict()
        .refine(v => Object.keys(v).length > 0, 'Provide at least one staff field to update')
        .parse(req.body);

      const isTenantAdminOrHigher = callerRole === 'super_admin' || callerRole === 'tenant_owner';
      const hashedPassword = body.newPassword ? await bcrypt.hash(body.newPassword, 12) : undefined;
      const hashedPin =
        typeof body.stationPin === 'string' ? await bcrypt.hash(body.stationPin, 12) : undefined;

      const updated = await db.transaction(async tx => {
        const tenant = await ensureCafeTenantTx(tx, cafe);
        const [targetUser] = await tx.select().from(users).where(eq(users.id, targetUserId)).for('update');
        if (!targetUser || targetUser.role === 'super_admin' || targetUser.accountStatus === 'deleted') {
          throw Object.assign(new Error('Staff member not found in your tenant.'), { status: 404 });
        }

        const tenantBranches = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(eq(restaurants.tenantId, tenant.id));
        const tenantBranchIds = tenantBranches.map(b => b.id);
        const validTenantBranchSet = new Set(tenantBranchIds);
        const callerAllowedSet = isTenantAdminOrHigher
          ? validTenantBranchSet
          : new Set(accessibleBranches.map(b => b.id));

        const currentAssignments = await tx
          .select()
          .from(staffAssignments)
          .where(
            and(
              eq(staffAssignments.userId, targetUser.id),
              eq(staffAssignments.isActive, true),
              or(
                ...(tenantBranchIds.length > 0 ? [inArray(staffAssignments.restaurantId, tenantBranchIds)] : []),
                and(isNull(staffAssignments.restaurantId), eq(staffAssignments.tenantId, tenant.id)),
              ),
            ),
          )
          .for('update');

        if (currentAssignments.length === 0 && targetUser.tenantId !== tenant.id) {
          throw Object.assign(new Error('Staff member does not belong to your tenant.'), { status: 403 });
        }

        const currentTopRole = currentAssignments.reduce<StaffRole>(
          (best, cur) =>
            ROLE_RANK[cur.staffRole as StaffRole] > ROLE_RANK[best] ? (cur.staffRole as StaffRole) : best,
          'prep_barista',
        );

        if (!isTenantAdminOrHigher) {
          if (currentTopRole === 'tenant_owner' || currentTopRole === 'branch_manager') {
            throw Object.assign(new Error('Only a Tenant Admin can modify Manager or Owner accounts.'), {
              status: 403,
            });
          }
          if (body.staffRole === 'tenant_owner' || body.staffRole === 'branch_manager' || body.applyTenantWide) {
            throw Object.assign(new Error('Branch Managers can only assign Reception or Prep roles.'), {
              status: 403,
            });
          }
        }

        const isPrimaryOwner = targetUser.id === tenant.ownerUserId;
        if (isPrimaryOwner && body.accountStatus === 'frozen') {
          throw Object.assign(new Error('The primary Tenant Admin account cannot be frozen from Team Settings.'), {
            status: 400,
          });
        }
        if (targetUser.id === req.user.id && body.accountStatus === 'frozen') {
          throw Object.assign(new Error('You cannot freeze your own active account.'), { status: 400 });
        }
        if (isPrimaryOwner && body.staffRole && body.staffRole !== 'tenant_owner') {
          throw Object.assign(new Error('The primary Tenant Admin must retain Tenant Admin access.'), {
            status: 400,
          });
        }

        const userPatch: Record<string, any> = { updatedAt: new Date() };
        if (body.firstName !== undefined) userPatch.firstName = body.firstName;
        if (body.lastName !== undefined) userPatch.lastName = body.lastName;
        if (body.accountStatus !== undefined) userPatch.accountStatus = body.accountStatus;
        if (hashedPassword) userPatch.password = hashedPassword;
        await tx.update(users).set(userPatch).where(eq(users.id, targetUser.id));

        const nextRole: StaffRole = body.staffRole || currentTopRole;
        const nextCapabilities =
          body.capabilities !== undefined ? body.capabilities : currentAssignments[0]?.capabilities || {};

        let nextPinHash = currentAssignments.find(a => a.pinHash)?.pinHash || null;
        let nextPinLookup = currentAssignments.find(a => a.pinLookupHash)?.pinLookupHash || null;
        if (body.stationPin === null) {
          nextPinHash = null;
          nextPinLookup = null;
        } else if (typeof body.stationPin === 'string') {
          nextPinLookup = computeStationPinLookup(tenant.id, body.stationPin);
          nextPinHash = hashedPin!;
          const [pinConflict] = await tx
            .select({ id: staffAssignments.id })
            .from(staffAssignments)
            .where(
              and(
                eq(staffAssignments.isActive, true),
                eq(staffAssignments.pinTenantId, tenant.id),
                eq(staffAssignments.pinLookupHash, nextPinLookup),
                ne(staffAssignments.userId, targetUser.id),
              ),
            )
            .limit(1);
          if (pinConflict) {
            throw Object.assign(
              new Error('Another staff member in your tenant already uses that 6-digit Station PIN.'),
              { status: 409 },
            );
          }
        }

        const scopeChanged = body.applyTenantWide !== undefined || body.restaurantIds !== undefined || body.staffRole === 'tenant_owner';
        if (scopeChanged) {
          const useTenantWide =
            nextRole === 'tenant_owner' ||
            (body.applyTenantWide ?? currentAssignments.some(a => a.tenantId && !a.restaurantId));
          const targetBranchIds = useTenantWide
            ? []
            : Array.from(
                new Set(
                  body.restaurantIds ||
                    currentAssignments.map(a => a.restaurantId).filter((x): x is string => Boolean(x)) || [cafe.id],
                ),
              );
          for (const bid of targetBranchIds) {
            if (!validTenantBranchSet.has(bid) || !callerAllowedSet.has(bid)) {
              throw Object.assign(new Error('Selected branch is outside your permissions.'), { status: 403 });
            }
          }

          await tx
            .update(staffAssignments)
            .set({ isActive: false, pinLookupHash: null, updatedAt: new Date() })
            .where(inArray(staffAssignments.id, currentAssignments.map(a => a.id)));

          if (useTenantWide) {
            await tx.insert(staffAssignments).values({
              userId: targetUser.id,
              restaurantId: null,
              tenantId: tenant.id,
              pinTenantId: nextPinLookup ? tenant.id : null,
              staffRole: nextRole,
              capabilities: nextCapabilities,
              pinHash: nextPinHash,
              pinLookupHash: nextPinLookup,
              isActive: true,
            });
          } else {
            for (let idx = 0; idx < targetBranchIds.length; idx++) {
              await tx.insert(staffAssignments).values({
                userId: targetUser.id,
                restaurantId: targetBranchIds[idx],
                tenantId: null,
                pinTenantId: idx === 0 && nextPinLookup ? tenant.id : null,
                staffRole: nextRole,
                capabilities: nextCapabilities,
                pinHash: nextPinHash,
                pinLookupHash: idx === 0 ? nextPinLookup : null,
                isActive: true,
              });
            }
          }
        } else if (currentAssignments.length > 0) {
          for (let idx = 0; idx < currentAssignments.length; idx++) {
            const row = currentAssignments[idx];
            await tx
              .update(staffAssignments)
              .set({
                staffRole: nextRole,
                capabilities: nextCapabilities,
                pinHash: nextPinHash,
                pinLookupHash: idx === 0 ? nextPinLookup : null,
                pinTenantId: idx === 0 && nextPinLookup ? tenant.id : null,
                updatedAt: new Date(),
              })
              .where(eq(staffAssignments.id, row.id));
          }
        }

        await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${targetUser.id}`);
        return { userId: targetUser.id, staffRole: nextRole, accountStatus: body.accountStatus || targetUser.accountStatus };
      });

      res.json(updated);
    } catch (e: any) {
      if (e.code === '23505' || e.cause?.code === '23505') {
        return res.status(409).json({ message: 'Duplicate 6-digit Station PIN in this tenant.' });
      }
      next(e);
    }
  });

  app.delete('/api/hospitality/team/:assignmentId', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      const assignmentId = z.string().uuid().parse(req.params.assignmentId);

      const tenant = await db.transaction(tx => ensureCafeTenantTx(tx, cafe));
      const [target] = await db
        .select()
        .from(staffAssignments)
        .where(eq(staffAssignments.id, assignmentId));
      if (!target) return res.status(404).json({ message: 'Staff assignment not found' });

      const tenantBranches = await db
        .select({ id: restaurants.id })
        .from(restaurants)
        .where(eq(restaurants.tenantId, tenant.id));
      const tenantBranchSet = new Set(tenantBranches.map(b => b.id));

      const belongsToTenant =
        target.tenantId === tenant.id || (target.restaurantId && tenantBranchSet.has(target.restaurantId));
      if (!belongsToTenant) {
        return res.status(403).json({ message: 'Assignment belongs to another tenant' });
      }

      if (callerRole !== 'super_admin' && callerRole !== 'tenant_owner') {
        if (target.staffRole === 'tenant_owner' || target.staffRole === 'branch_manager') {
          return res.status(403).json({ message: 'Only a Tenant Admin can revoke Manager or Owner access.' });
        }
        if (target.restaurantId !== cafe.id) {
          return res.status(403).json({ message: 'Assignment belongs to another branch.' });
        }
      }

      if (target.userId === tenant.ownerUserId && target.staffRole === 'tenant_owner') {
        return res.status(400).json({ message: 'Cannot revoke the primary Tenant Admin assignment.' });
      }

      await db.transaction(async tx => {
        await tx
          .update(staffAssignments)
          .set({ isActive: false, pinLookupHash: null, updatedAt: new Date() })
          .where(eq(staffAssignments.id, assignmentId));
        await tx.delete(sessions).where(sql`${sessions.sess}->>'userId' = ${target.userId}`);
      });

      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ===== TENANT ADMIN SELF-SERVICE NEW BRANCH CREATION (QUOTA ENFORCED) =====
  app.post('/api/hospitality/branches', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      if (callerRole !== 'tenant_owner' && callerRole !== 'super_admin') {
        return res.status(403).json({ message: 'Only a Tenant Admin can create additional branches.' });
      }

      const body = z
        .object({
          name: z.string().trim().min(1).max(150),
          slug: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers, and hyphens')
            .max(120)
            .optional()
            .nullable(),
          cuisineType: z.string().trim().max(200).optional().nullable(),
          address: z.string().trim().max(500).optional().nullable(),
          orderingMode: z.enum(orderingModes).optional(),
          switchImmediately: z.boolean().default(true),
        })
        .strict()
        .parse(req.body);

      const created = await db.transaction(async tx => {
        const tenant = await ensureCafeTenantTx(tx, cafe);
        const existingBranches = await tx
          .select({ id: restaurants.id })
          .from(restaurants)
          .where(eq(restaurants.tenantId, tenant.id));

        if (callerRole !== 'super_admin' && existingBranches.length >= tenant.maxBranches) {
          throw Object.assign(
            new Error(
              `Branch quota reached (${existingBranches.length}/${tenant.maxBranches}). Contact dingzi platform administration to expand your tenant quota.`,
            ),
            { status: 403 },
          );
        }

        if (body.slug) {
          const [dupSlug] = await tx
            .select({ id: restaurants.id })
            .from(restaurants)
            .where(sql`lower(${restaurants.slug}) = ${body.slug}`)
            .limit(1);
          if (dupSlug) {
            throw Object.assign(new Error(`Slug "${body.slug}" is already in use.`), { status: 409 });
          }
        }

        const ownerId = tenant.ownerUserId || cafe.userId;
        const [branch] = await tx
          .insert(restaurants)
          .values({
            userId: ownerId,
            tenantId: tenant.id,
            name: body.name,
            slug: body.slug || null,
            cuisineType: body.cuisineType || cafe.cuisineType || null,
            address: body.address || null,
            currency: cafe.currency,
            timezone: cafe.timezone,
            theme: cafe.theme,
            brandAccentHex: cafe.brandAccentHex,
            orderingMode: body.orderingMode || cafe.orderingMode,
          })
          .returning();

        return { branch, tenant };
      });

      if (body.switchImmediately) {
        req.session.cafeId = created.branch.id;
        await new Promise<void>((resolve, reject) => req.session.save((err: Error) => (err ? reject(err) : resolve())));
        req.managedCafeResolved = false;
      }

      res.status(201).json({
        branch: created.branch,
        user: await authUser(req),
      });
    } catch (e) {
      next(e);
    }
  });

  // ===== SCOPED TENANT & BRANCH SECURITY AUDIT LOG =====
  app.get('/api/hospitality/audit-log', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const callerRole = await getEffectiveStaffRole(req);
      if (callerRole === 'host_cashier' || callerRole === 'prep_barista') {
        return res.status(403).json({ message: 'Audit log requires Branch Manager or Tenant Admin access.' });
      }

      const canViewEntireTenant = callerRole === 'super_admin' || callerRole === 'tenant_owner';
      const rows =
        canViewEntireTenant && cafe.tenantId
          ? await db
              .select()
              .from(accessAudit)
              .where(eq(accessAudit.tenantId, cafe.tenantId))
              .orderBy(desc(accessAudit.createdAt))
              .limit(100)
          : await db
              .select()
              .from(accessAudit)
              .where(eq(accessAudit.cafeId, cafe.id))
              .orderBy(desc(accessAudit.createdAt))
              .limit(100);

      res.json({ logs: rows });
    } catch (e) {
      next(e);
    }
  });
}
