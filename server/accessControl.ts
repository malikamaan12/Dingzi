import type { Express, Request } from 'express';
import { and, asc, desc, eq, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { storage } from './storage';
import { isAuthenticated, isSuperAdmin } from './localAuth';
import {
  accessAudit,
  restaurants,
  staffAssignments,
  tenants,
  type AccessibleBranchSummary,
  type AuthUser,
  type EffectiveStaffRole,
  type Restaurant,
  type StaffAssignment,
  type StaffRole,
  type Tenant,
  type User,
} from '@shared/schema';
import {
  resolveStaffCapabilities,
  staffActionAllowed,
  type ResolvedStaffCapabilities,
} from '@shared/rbac';
import { deferRequestTask } from './workerContext';

declare module 'express-session' {
  interface SessionData {
    userId: string;
    cafeId?: string;
  }
}

export type TenantSummary = Pick<Tenant, 'id' | 'name' | 'slug' | 'status' | 'maxBranches'>;

export type CafeRequest = Request & {
  user: User;
  managedCafe?: Restaurant;
  managedCafeResolved?: boolean;
  effectiveStaffRole?: EffectiveStaffRole;
  effectiveCapabilities?: ResolvedStaffCapabilities;
  accessibleBranches?: AccessibleBranchSummary[];
  tenantContext?: TenantSummary | null;
};

interface ResolvedAccess {
  cafe: Restaurant | undefined;
  staffRole: EffectiveStaffRole;
  capabilities: ResolvedStaffCapabilities;
  accessibleBranches: AccessibleBranchSummary[];
  tenantContext: TenantSummary | null;
}

const ROLE_PRIORITY: Record<StaffRole, number> = {
  tenant_owner: 4,
  branch_manager: 3,
  host_cashier: 2,
  prep_barista: 1,
};

async function resolveUserAccess(req: any): Promise<ResolvedAccess> {
  if (req.managedCafeResolved && req.effectiveStaffRole && req.effectiveCapabilities) {
    return {
      cafe: req.managedCafe,
      staffRole: req.effectiveStaffRole,
      capabilities: req.effectiveCapabilities,
      accessibleBranches: req.accessibleBranches || [],
      tenantContext: req.tenantContext || null,
    };
  }

  const actor: User = req.user;
  if (actor.role === 'super_admin') {
    const cafe = req.session?.cafeId ? await storage.getRestaurantById(req.session.cafeId) : undefined;
    let tenantContext: TenantSummary | null = null;
    if (cafe?.tenantId) {
      const [t] = await db
        .select({
          id: tenants.id,
          name: tenants.name,
          slug: tenants.slug,
          status: tenants.status,
          maxBranches: tenants.maxBranches,
        })
        .from(tenants)
        .where(eq(tenants.id, cafe.tenantId));
      tenantContext = t || null;
    }
    const capabilities = resolveStaffCapabilities('super_admin');
    req.managedCafe = cafe;
    req.managedCafeResolved = true;
    req.effectiveStaffRole = 'super_admin';
    req.effectiveCapabilities = capabilities;
    req.accessibleBranches = cafe ? [{ id: cafe.id, name: cafe.name, slug: cafe.slug, tenantId: cafe.tenantId }] : [];
    req.tenantContext = tenantContext;
    return {
      cafe,
      staffRole: 'super_admin',
      capabilities,
      accessibleBranches: req.accessibleBranches,
      tenantContext,
    };
  }

  const [ownedCafes, assignments, ownedTenants] = await Promise.all([
    db.select().from(restaurants).where(eq(restaurants.userId, actor.id)).orderBy(asc(restaurants.name)),
    db
      .select()
      .from(staffAssignments)
      .where(and(eq(staffAssignments.userId, actor.id), eq(staffAssignments.isActive, true))),
    db.select().from(tenants).where(eq(tenants.ownerUserId, actor.id)),
  ]);

  const tenantIds = new Set<string>(ownedTenants.map(t => t.id));
  for (const a of assignments) {
    if (a.tenantId && !a.restaurantId) tenantIds.add(a.tenantId);
  }
  for (const oc of ownedCafes) {
    if (oc.tenantId && (ownedTenants.length > 0 || assignments.some(a => a.staffRole === 'tenant_owner'))) {
      tenantIds.add(oc.tenantId);
    }
  }

  const assignedRestaurantIds = assignments
    .map(a => a.restaurantId)
    .filter((id): id is string => Boolean(id));

  const extraBranches =
    tenantIds.size > 0 || assignedRestaurantIds.length > 0
      ? await db
          .select()
          .from(restaurants)
          .where(
            or(
              ...(tenantIds.size > 0 ? [inArray(restaurants.tenantId, Array.from(tenantIds))] : []),
              ...(assignedRestaurantIds.length > 0 ? [inArray(restaurants.id, assignedRestaurantIds)] : []),
            ),
          )
          .orderBy(asc(restaurants.name))
      : [];

  const branchMap = new Map<string, Restaurant>();
  for (const oc of ownedCafes) branchMap.set(oc.id, oc);
  for (const b of extraBranches) branchMap.set(b.id, b);

  const requestedCafeId = req.session?.cafeId;
  const activeCafe =
    (requestedCafeId && branchMap.get(requestedCafeId)) ||
    ownedCafes[0] ||
    Array.from(branchMap.values())[0];

  let staffRole: StaffRole = 'branch_manager';
  let matchedAssignment: StaffAssignment | undefined;

  if (activeCafe) {
    const candidates: { role: StaffRole; assignment?: StaffAssignment }[] = [];
    if (activeCafe.userId === actor.id) {
      const isTenantOwner = Boolean(
        activeCafe.tenantId && ownedTenants.some(t => t.id === activeCafe.tenantId),
      );
      candidates.push({ role: isTenantOwner ? 'tenant_owner' : 'branch_manager' });
    }
    if (activeCafe.tenantId && ownedTenants.some(t => t.id === activeCafe.tenantId)) {
      candidates.push({ role: 'tenant_owner' });
    }
    for (const a of assignments) {
      if (a.restaurantId === activeCafe.id || (!a.restaurantId && a.tenantId && a.tenantId === activeCafe.tenantId)) {
        candidates.push({ role: a.staffRole as StaffRole, assignment: a });
      }
    }
    if (candidates.length > 0) {
      candidates.sort((x, y) => ROLE_PRIORITY[y.role] - ROLE_PRIORITY[x.role]);
      staffRole = candidates[0].role;
      matchedAssignment = candidates[0].assignment;
    }
  } else if (ownedTenants.length > 0 || assignments.some(a => a.staffRole === 'tenant_owner')) {
    staffRole = 'tenant_owner';
  } else if (assignments.length > 0) {
    const sorted = [...assignments].sort(
      (x, y) => ROLE_PRIORITY[y.staffRole as StaffRole] - ROLE_PRIORITY[x.staffRole as StaffRole],
    );
    staffRole = sorted[0].staffRole as StaffRole;
    matchedAssignment = sorted[0];
  }

  let tenantContext: TenantSummary | null = null;
  const activeTenantId = activeCafe?.tenantId || actor.tenantId || Array.from(tenantIds)[0] || null;
  if (activeTenantId) {
    const [t] = await db
      .select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        status: tenants.status,
        maxBranches: tenants.maxBranches,
      })
      .from(tenants)
      .where(eq(tenants.id, activeTenantId));
    tenantContext = t || null;
  }

  const capabilities = resolveStaffCapabilities(staffRole, matchedAssignment?.capabilities);
  const accessibleBranches: AccessibleBranchSummary[] = Array.from(branchMap.values()).map(b => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    tenantId: b.tenantId,
  }));

  req.managedCafe = activeCafe;
  req.managedCafeResolved = true;
  req.effectiveStaffRole = staffRole;
  req.effectiveCapabilities = capabilities;
  req.accessibleBranches = accessibleBranches;
  req.tenantContext = tenantContext;

  return {
    cafe: activeCafe,
    staffRole,
    capabilities,
    accessibleBranches,
    tenantContext,
  };
}

export async function getManagedCafe(req: any): Promise<Restaurant | undefined> {
  return (await resolveUserAccess(req)).cafe;
}

export async function getEffectiveStaffRole(req: any): Promise<EffectiveStaffRole> {
  return (await resolveUserAccess(req)).staffRole;
}

export async function getEffectiveCapabilities(req: any): Promise<ResolvedStaffCapabilities> {
  return (await resolveUserAccess(req)).capabilities;
}

export async function getAccessibleBranches(req: any): Promise<AccessibleBranchSummary[]> {
  return (await resolveUserAccess(req)).accessibleBranches;
}

export async function mediaOwner(req: any): Promise<string> {
  return (await getManagedCafe(req))?.userId || req.user.id;
}

export async function authUser(req: any): Promise<AuthUser> {
  const { password, ...user } = req.user;
  const { cafe, staffRole, capabilities, accessibleBranches, tenantContext } = await resolveUserAccess(req);
  const owner = cafe
    ? cafe.userId === req.user.id
      ? req.user
      : await storage.getUser(cafe.userId)
    : undefined;
  return {
    ...user,
    staffRole,
    capabilities,
    tenantContext,
    accessibleBranches,
    cafeContext: cafe
      ? {
          id: cafe.id,
          name: cafe.name,
          theme: cafe.theme,
          owner: owner
            ? {
                id: owner.id,
                email: owner.email,
                firstName: owner.firstName,
                lastName: owner.lastName,
              }
            : null,
        }
      : null,
  };
}

const publicGet =
  /^\/api\/(?:cafes$|(?:menu|restaurant|categories|menu-items)\/public\/[^/]+$|price-variants\/public\/(?:[^/]+|restaurant\/[^/]+)$|public\/)/;
const publicPost = /^\/api\/(?:public\/|webhooks\/payments\/)/;
const cafePath =
  /^\/api\/(?:restaurant|categories|menu-items|price-variants|manager-menu|category-order|cafe-backup|cafe-menu|objects\/upload|hospitality)(?:\/|$)/;
const sharedPath = /^\/api\/(?:auth\/user|account\/password|menu-library)(?:\/|$)/;

export function mountAccessControl(app: Express) {
  // Every private API passes through one live role + capability check. Public menu & guest hospitality endpoints are explicit.
  app.use(async (req: any, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    if (['GET', 'HEAD'].includes(req.method) && publicGet.test(req.path)) return next();
    if (req.method === 'POST' && publicPost.test(req.path)) return next();
    isAuthenticated(req, res, async (error?: any) => {
      if (error) return next(error);
      try {
        const actor: User = req.user;
        if (!['admin', 'super_admin'].includes(actor.role)) {
          return res.status(403).json({ message: 'This account has no management role' });
        }
        const requestPath = req.path;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          res.once('finish', () => {
            const candidate =
              req.platformCafe?.id ||
              req.managedCafe?.id ||
              (requestPath === '/api/super-admin/cafe-access' || requestPath === '/api/hospitality/switch-branch'
                ? req.session?.cafeId || req.body?.restaurantId
                : null) ||
              (requestPath.startsWith('/api/menu-library/') ? req.body?.restaurantId : null);
            const cafeId = typeof candidate === 'string' && z.string().uuid().safeParse(candidate).success ? candidate : null;
            deferRequestTask(
              (async () => {
                const affected =
                  req.platformCafe || req.managedCafe || (cafeId ? await storage.getRestaurantById(cafeId) : undefined);
                await db.insert(accessAudit).values({
                  actorId: actor.id,
                  actorEmail: actor.email,
                  actorRole: req.effectiveStaffRole || actor.role,
                  tenantId: affected?.tenantId || req.tenantContext?.id || actor.tenantId || null,
                  cafeId,
                  cafeName: affected?.name || null,
                  action: `${req.method} ${requestPath}`,
                  status: res.statusCode,
                });
              })(),
            );
          });
        }
        if (requestPath.startsWith('/api/super-admin/')) {
          if (actor.role !== 'super_admin') return res.status(403).json({ message: 'Super admin access required' });
          return next();
        }
        const { cafe, staffRole, capabilities, tenantContext } = await resolveUserAccess(req);
        if (actor.role !== 'super_admin' && tenantContext?.status === 'suspended') {
          return res.status(403).json({ message: 'This tenant organization is currently suspended.' });
        }
        if (sharedPath.test(requestPath)) {
          if (requestPath.startsWith('/api/menu-library')) {
            if (staffRole === 'prep_barista' || staffRole === 'host_cashier') {
              return res.status(403).json({ message: 'Menu library requires Branch Manager or Tenant Admin access.' });
            }
          }
          return next();
        }
        if (!cafePath.test(requestPath)) return res.status(404).json({ message: 'API route not found' });
        if (actor.role === 'super_admin' && !cafe) {
          return res.status(409).json({ message: 'Open a café workspace from the platform dashboard first' });
        }
        if (requestPath !== '/api/hospitality/switch-branch' && requestPath !== '/api/hospitality/branches') {
          const expected = req.get('X-Cafe-Context');
          if (
            (expected && expected !== cafe?.id) ||
            (actor.role === 'super_admin' && !['GET', 'HEAD'].includes(req.method) && expected !== cafe?.id)
          ) {
            return res.status(409).json({ message: 'The café workspace changed. Reload before saving.' });
          }
        }
        if (!staffActionAllowed(staffRole, capabilities, req.method, requestPath, req.body)) {
          return res.status(403).json({
            message: `Your role (${staffRole.replace('_', ' ')}) does not have permission for this action.`,
          });
        }
        next();
      } catch (e) {
        next(e);
      }
    });
  });

  app.post('/api/super-admin/cafe-access', isSuperAdmin, async (req: any, res, next) => {
    try {
      const { restaurantId } = z.object({ restaurantId: z.string().uuid() }).strict().parse(req.body);
      const cafe = await storage.getRestaurantById(restaurantId);
      if (!cafe) return res.status(404).json({ message: 'Café not found' });
      const owner = await storage.getUser(cafe.userId);
      if (!owner || !['admin', 'super_admin'].includes(owner.role)) {
        return res.status(409).json({ message: 'This café needs a valid manager account' });
      }
      req.session.cafeId = cafe.id;
      await new Promise<void>((resolve, reject) => req.session.save((err: Error) => (err ? reject(err) : resolve())));
      req.managedCafe = cafe;
      req.managedCafeResolved = false;
      res.json(await authUser(req));
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/super-admin/cafe-access', isSuperAdmin, async (req: any, res, next) => {
    try {
      const previousId = req.session.cafeId;
      delete req.session.cafeId;
      await new Promise<void>((resolve, reject) => req.session.save((err: Error) => (err ? reject(err) : resolve())));
      req.managedCafe = previousId ? await storage.getRestaurantById(previousId) : undefined;
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/super-admin/access-audit', isSuperAdmin, async (_req, res, next) => {
    try {
      res.json(await db.select().from(accessAudit).orderBy(desc(accessAudit.createdAt)).limit(200));
    } catch (e) {
      next(e);
    }
  });
}
