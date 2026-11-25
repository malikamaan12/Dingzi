import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import { storage } from './storage';
import { isAuthenticated, isSuperAdmin } from './localAuth';
import { authUser, getAccessibleBranches, getEffectiveStaffRole, getManagedCafe } from './accessControl';
import { rateLimit } from './httpSecurity';
import { attachSseStream, publishRealtimeEvent } from './realtimeHub';
import { deferRequestTask } from './workerContext';
import { dispatchPushAlertToScopes } from './pushService';
import { withTenantRlsTransaction } from './rlsContext';
import bcrypt from './passwords';
import {
  createPaymentCheckoutSession,
  decryptGatewaySecret,
  encryptGatewaySecret,
  maskGatewayValue,
  signGatewayPayload,
  verifyGatewaySignature,
  type BranchGatewaySecrets,
} from './payments/gateways';
import {
  customizationTotal,
  missingModifierGroups,
  reconcileModifierSelections,
  selectedModifierOptions,
  type MenuModifierSelections,
} from '@shared/menuCustomization';
import {
  aggregatorClicks,
  aggregatorLinks,
  branchPaymentConfigs,
  diningTables,
  diningZones,
  emailSchema,
  guestOrders,
  pagerTickets,
  passwordSchema,
  restaurants,
  serviceBays,
  sessions,
  smartTagHardwareKinds,
  smartTags,
  smartTagTargetTypes,
  staffAssignments,
  staffRoles,
  tableReservations,
  tenants,
  users,
  waitlistEntries,
  type DiningTable,
  type OrderLineItem,
  type PublicCafe,
  type Restaurant,
  type SmartTag,
  type TableReservation,
} from '@shared/schema';

const REBUZZ_COOLDOWN_MS = 20_000;
const DEPOSIT_HOLD_TTL_MS = 15 * 60_000;

async function loadBranchGatewaySecrets(restaurantId: string): Promise<BranchGatewaySecrets | undefined> {
  const [cfg] = await db
    .select()
    .from(branchPaymentConfigs)
    .where(eq(branchPaymentConfigs.restaurantId, restaurantId));
  if (!cfg) return undefined;
  return {
    skipcashKeyId: cfg.skipcashKeyId,
    skipcashSecret: decryptGatewaySecret(cfg.skipcashSecretEnc),
    skipcashCheckoutUrl: cfg.skipcashCheckoutUrl,
    sadadMerchantId: cfg.sadadMerchantId,
    sadadSecret: decryptGatewaySecret(cfg.sadadSecretEnc),
    sadadCheckoutUrl: cfg.sadadCheckoutUrl,
  };
}

function parseHhMmToMins(hhmm?: string | null, fallbackMins = 8 * 60): number {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return fallbackMins;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function resolveBranchOperatingMinutes(restaurant: Pick<Restaurant, 'openTime' | 'closeTime' | 'openingHours'>): {
  openMins: number;
  closeMins: number;
} {
  let openStr = restaurant.openTime || '08:00';
  let closeStr = restaurant.closeTime || '23:00';
  if (
    openStr === '08:00' &&
    closeStr === '23:00' &&
    restaurant.openingHours &&
    /([01]?\d|2[0-3]):[0-5]\d/.test(restaurant.openingHours)
  ) {
    const matches = Array.from(restaurant.openingHours.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g));
    if (matches.length >= 2) {
      openStr = `${matches[0][1].padStart(2, '0')}:${matches[0][2]}`;
      closeStr = `${matches[1][1].padStart(2, '0')}:${matches[1][2]}`;
    }
  }
  const openMins = parseHhMmToMins(openStr, 8 * 60);
  let closeMins = parseHhMmToMins(closeStr, 23 * 60);
  if (closeMins <= openMins) {
    // Late-night operating window wrapping past midnight (e.g. 14:00 -> 01:00)
    closeMins += 24 * 60;
  }
  return { openMins, closeMins };
}

function reservationBlocksWindow(
  res: Pick<TableReservation, 'status' | 'startAt' | 'endAt' | 'createdAt'>,
  slotStartMs: number,
  slotEndMs: number,
  nowMs: number,
): boolean {
  if (res.status === 'pending_deposit') {
    const ageMs = nowMs - new Date(res.createdAt).getTime();
    if (ageMs > DEPOSIT_HOLD_TTL_MS) return false;
  } else if (res.status !== 'confirmed' && res.status !== 'seated') {
    return false;
  }
  return new Date(res.startAt).getTime() < slotEndMs && new Date(res.endAt).getTime() > slotStartMs;
}

function busyTableIdsForWindow(
  reservations: Pick<TableReservation, 'tableId' | 'combinedTableIds' | 'status' | 'startAt' | 'endAt' | 'createdAt'>[],
  slotStart: Date,
  slotEnd: Date,
): Set<string> {
  const busy = new Set<string>();
  const startMs = slotStart.getTime();
  const endMs = slotEnd.getTime();
  const nowMs = Date.now();
  for (const r of reservations) {
    if (!reservationBlocksWindow(r, startMs, endMs, nowMs)) continue;
    busy.add(r.tableId);
    for (const id of r.combinedTableIds || []) {
      busy.add(id);
    }
  }
  return busy;
}

/**
 * Finds either the best-fit single table or the tightest combination of 2..4
 * `isCombinable = true` tables in the same dining zone whose combined `maxCovers >= partySize`.
 */
function findTableAllocation(
  allActiveTables: DiningTable[],
  busyIds: Set<string>,
  partySize: number,
  zoneId?: string | null,
): DiningTable[] | null {
  const zoneFiltered = allActiveTables.filter(t => !busyIds.has(t.id) && (!zoneId || t.zoneId === zoneId));

  // 1. Prefer a single table fitting minCovers..maxCovers with minimum wasted capacity
  const singleFits = zoneFiltered
    .filter(t => t.minCovers <= partySize && t.maxCovers >= partySize)
    .sort((a, b) => a.maxCovers - b.maxCovers || a.tableCode.localeCompare(b.tableCode));
  if (singleFits.length > 0) {
    return [singleFits[0]];
  }

  // 2. Pair 2..4 combinable tables within the same zone
  const byZone = new Map<string, DiningTable[]>();
  for (const t of zoneFiltered) {
    if (!t.isCombinable) continue;
    const arr = byZone.get(t.zoneId) || [];
    arr.push(t);
    byZone.set(t.zoneId, arr);
  }

  let bestCombo: DiningTable[] | null = null;
  let bestCovers = Infinity;

  for (const zoneTables of Array.from(byZone.values())) {
    if (zoneTables.length < 2) continue;
    const sorted = [...zoneTables].sort((a, b) => b.maxCovers - a.maxCovers || a.tableCode.localeCompare(b.tableCode));
    const maxTotal = sorted.reduce((s, t) => s + t.maxCovers, 0);
    if (maxTotal < partySize) continue;

    // Search combinations of size 2..Math.min(4, sorted.length)
    const limit = Math.min(sorted.length, 10);
    const candidates = sorted.slice(0, limit);

    const search = (startIdx: number, chosen: DiningTable[], sumCovers: number) => {
      if (sumCovers >= partySize && chosen.length >= 2) {
        if (
          sumCovers < bestCovers ||
          (sumCovers === bestCovers && bestCombo && chosen.length < bestCombo.length)
        ) {
          bestCombo = [...chosen];
          bestCovers = sumCovers;
        }
        return;
      }
      if (chosen.length >= 4) return;
      for (let i = startIdx; i < candidates.length; i++) {
        chosen.push(candidates[i]);
        search(i + 1, chosen, sumCovers + candidates[i].maxCovers);
        chosen.pop();
      }
    };
    search(0, [], 0);
  }

  return bestCombo;
}

function countAvailableSlotAllocations(
  allActiveTables: DiningTable[],
  busyIds: Set<string>,
  partySize: number,
  zoneId?: string | null,
): { count: number; requiresCombination: boolean } {
  const simulatedBusy = new Set(busyIds);
  let count = 0;
  let usedCombo = false;
  while (count < 20) {
    const alloc = findTableAllocation(allActiveTables, simulatedBusy, partySize, zoneId);
    if (!alloc) break;
    if (alloc.length > 1) usedCombo = true;
    for (const t of alloc) simulatedBusy.add(t.id);
    count++;
  }
  return { count, requiresCombination: count > 0 && usedCombo };
}

function toPublicCafe(restaurant: Restaurant): PublicCafe {
  const {
    id,
    name,
    slug,
    theme,
    brandAccentHex,
    currency,
    timezone,
    logoUrl,
    coverMediaUrl,
    coverMediaType,
    cuisineType,
    address,
    phone,
    openingHours,
    openTime,
    closeTime,
    orderingMode,
    paymentGateway,
    googleMapsReviewUrl,
    reservationsEnabled,
    waitlistEnabled,
    driveThruEnabled,
    pagerMiniGameEnabled,
    slotIntervalMins,
    defaultTurnDurationMins,
    reservationDepositAmount,
  } = restaurant;
  return {
    id,
    name,
    slug,
    theme,
    brandAccentHex,
    currency,
    timezone,
    logoUrl,
    coverMediaUrl,
    coverMediaType,
    cuisineType,
    address,
    phone,
    openingHours,
    openTime,
    closeTime,
    orderingMode,
    paymentGateway,
    googleMapsReviewUrl,
    reservationsEnabled,
    waitlistEnabled,
    driveThruEnabled,
    pagerMiniGameEnabled,
    slotIntervalMins,
    defaultTurnDurationMins,
    reservationDepositAmount,
  };
}

function branchLocalDate(timezone = 'Asia/Qatar'): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

async function nextDailyPagerCode(tx: typeof db, restaurantId: string, ticketDate: string) {
  const existing = await tx
    .select({ maxSeq: sql<number>`coalesce(max(${pagerTickets.dailySeq}), 0)` })
    .from(pagerTickets)
    .where(and(eq(pagerTickets.restaurantId, restaurantId), eq(pagerTickets.ticketDate, ticketDate)));
  const seq = Number(existing[0]?.maxSeq || 0) + 1;
  const code = `A-${String(seq).padStart(3, '0')}`;
  return { seq, code };
}

async function nextWaitlistCode(tx: typeof db, restaurantId: string) {
  const countRows = await tx
    .select({ n: sql<number>`count(*)` })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.restaurantId, restaurantId));
  const seq = (Number(countRows[0]?.n || 0) % 999) + 1;
  return `W-${String(seq).padStart(3, '0')}`;
}

export function mountHospitalityRoutes(app: Express) {
  // ===== REALTIME STREAMS =====

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
      vehicleType: z.enum(['Sedan', 'SUV', 'Pickup', 'Coupe', 'Other']).optional().nullable(),
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

      let totalCents = 0;
      let maxPrepMins = 8;
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
        maxPrepMins = Math.max(maxPrepMins, menuItem.prepTimeMins || 10);

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

      const totalFormatted = (totalCents / 100).toFixed(2);
      const isOnlineCheckout = restaurant.orderingMode === 'full_online_checkout';
      const gateway: 'skipcash' | 'sadad' =
        restaurant.paymentGateway === 'sadad' ? 'sadad' : 'skipcash';
      const ticketDate = branchLocalDate(restaurant.timezone);

      const created = await db.transaction(async tx => {
        const { seq, code } = await nextDailyPagerCode(tx as any, restaurant.id, ticketDate);
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
            subtotal: totalFormatted,
            total: totalFormatted,
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
        .select({ timezone: restaurants.timezone })
        .from(restaurants)
        .where(eq(restaurants.id, order.restaurantId));
      const ticketDate = branchLocalDate(restaurant?.timezone);
      const { seq, code } = await nextDailyPagerCode(tx as any, order.restaurantId, ticketDate);

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
          estimatedPrepMins: 12,
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
        .map(i => ({ id: i.id, name: i.name, price: i.price, discount: i.discount, imageUrl: i.imageUrl, unit: i.unit }));

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
      res.json({
        ticket: updated,
        promptGoogleReview: rating >= 4 && Boolean(restaurant?.googleMapsReviewUrl),
        googleMapsReviewUrl: rating >= 4 ? restaurant?.googleMapsReviewUrl || null : null,
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
          vehicleType: z.enum(['Sedan', 'SUV', 'Pickup', 'Coupe', 'Other']),
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
        const ticketDate = branchLocalDate(restaurant.timezone);
        updatedTicket = await db.transaction(async tx => {
          const { seq, code } = await nextDailyPagerCode(tx as any, restaurant.id, ticketDate);
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
      const partySize = z.coerce.number().int().min(1).max(30).parse(req.query.partySize || 2);
      const zoneId = req.query.zoneId ? z.string().uuid().parse(req.query.zoneId) : undefined;

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active' || !restaurant.reservationsEnabled) {
        return res.status(404).json({ message: 'Table reservations are not enabled for this branch' });
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
        const busyIds = busyTableIdsForWindow(existingBookings, slotStart, slotEnd);
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
          partySize: z.number().int().min(1).max(30),
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

          const busyIds = busyTableIdsForWindow(overlapping, startAt, endAt);
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
          partySize: z.number().int().min(1).max(30),
          zoneId: z.string().uuid().optional().nullable(),
          notes: z.string().trim().max(300).optional().nullable(),
        })
        .strict()
        .parse(req.body);

      const restaurant = await storage.getRestaurantById(restaurantId);
      if (!restaurant || restaurant.hidden || restaurant.status !== 'active' || !restaurant.waitlistEnabled) {
        return res.status(404).json({ message: 'Walk-in waitlist is currently closed for this branch' });
      }

      const entry = await db.transaction(async tx => {
        const ticketCode = await nextWaitlistCode(tx as any, restaurantId);
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
  app.get('/api/hospitality/pagers', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [tickets, orders, bays, coasters] = await Promise.all([
        db
          .select()
          .from(pagerTickets)
          .where(eq(pagerTickets.restaurantId, cafe.id))
          .orderBy(asc(pagerTickets.queuedAt))
          .limit(200),
        db
          .select()
          .from(guestOrders)
          .where(eq(guestOrders.restaurantId, cafe.id))
          .orderBy(desc(guestOrders.createdAt))
          .limit(100),
        db
          .select()
          .from(serviceBays)
          .where(eq(serviceBays.restaurantId, cafe.id))
          .orderBy(asc(serviceBays.order)),
        db
          .select()
          .from(smartTags)
          .where(and(eq(smartTags.restaurantId, cafe.id), eq(smartTags.targetType, 'reusable_pager'), eq(smartTags.isActive, true)))
          .orderBy(asc(smartTags.tagCode)),
      ]);
      res.json({ tickets, orders, bays, coasters });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/pagers/issue', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          mode: z.enum(['auto_number', 'pos_invoice']),
          invoiceNumber: z.string().trim().max(40).optional(),
          customerName: z.string().trim().max(120).optional(),
          notes: z.string().trim().max(300).optional(),
          estimatedPrepMins: z.number().int().min(1).max(120).default(8),
          bayId: z.string().uuid().optional().nullable(),
          smartTagId: z.string().uuid().optional().nullable(),
        })
        .strict()
        .parse(req.body);

      if (body.mode === 'pos_invoice' && !body.invoiceNumber?.trim()) {
        return res.status(400).json({ message: 'Enter the POS invoice or receipt number.' });
      }

      const ticketDate = branchLocalDate(cafe.timezone);
      const { ticket, coaster } = await db.transaction(async tx => {
        let targetCoaster: SmartTag | undefined;
        if (body.smartTagId) {
          const [found] = await tx
            .select()
            .from(smartTags)
            .where(and(eq(smartTags.id, body.smartTagId), eq(smartTags.restaurantId, cafe.id)))
            .for('update');
          if (!found || !found.isActive || found.targetType !== 'reusable_pager') {
            throw Object.assign(new Error('Selected reusable NFC/QR coaster is unavailable.'), { status: 400 });
          }
          targetCoaster = found;
        }

        const auto = body.mode === 'auto_number' ? await nextDailyPagerCode(tx as any, cafe.id, ticketDate) : null;
        const ticketCode = auto ? auto.code : body.invoiceNumber!.trim().toUpperCase();
        const [created] = await tx
          .insert(pagerTickets)
          .values({
            restaurantId: cafe.id,
            bayId: body.bayId || null,
            ticketCode,
            ticketDate,
            dailySeq: auto?.seq ?? null,
            source: body.mode,
            status: 'waiting',
            customerName: body.customerName || null,
            notes: body.notes || null,
            estimatedPrepMins: body.estimatedPrepMins,
          })
          .returning();

        let boundCoaster: SmartTag | null = null;
        if (targetCoaster) {
          const [updatedTag] = await tx
            .update(smartTags)
            .set({ activeTicketId: created.id })
            .where(eq(smartTags.id, targetCoaster.id))
            .returning();
          boundCoaster = updatedTag || null;
        }
        return { ticket: created, coaster: boundCoaster };
      });

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${ticket.trackingToken}`], {
        type: 'pager.created',
        branchId: cafe.id,
        data: { ticket, coaster },
      });
      if (coaster) {
        publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${coaster.token}`], {
          type: 'coaster.updated',
          branchId: cafe.id,
          data: { tag: coaster, ticket },
        });
      }

      res.status(201).json({ ticket, coaster });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/pagers/:id/transition', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const id = z.string().uuid().parse(req.params.id);
      const { action } = z
        .object({ action: z.enum(['preparing', 'ready', 'rebuzz', 'collected', 'no_show', 'confirm_venue_payment']) })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(pagerTickets)
        .where(and(eq(pagerTickets.id, id), eq(pagerTickets.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Pager ticket not found in this branch' });

      if (action === 'confirm_venue_payment' && existing.orderId) {
        await db
          .update(guestOrders)
          .set({ paymentStatus: 'paid', paidAt: new Date() })
          .where(and(eq(guestOrders.id, existing.orderId), eq(guestOrders.restaurantId, cafe.id)));
        publishRealtimeEvent([`branch:${cafe.id}`, `pager:${existing.trackingToken}`], {
          type: 'order.paid',
          branchId: cafe.id,
          data: { ticketId: existing.id, orderId: existing.orderId },
        });
        return res.json({ ticket: existing, paymentConfirmed: true });
      }

      const now = new Date();
      if (action === 'rebuzz') {
        if (existing.status !== 'ready') {
          return res.status(400).json({ message: 'Mark the ticket Ready before re-buzzing.' });
        }
        if (existing.lastBuzzedAt && now.getTime() - new Date(existing.lastBuzzedAt).getTime() < REBUZZ_COOLDOWN_MS) {
          const waitSecs = Math.ceil(
            (REBUZZ_COOLDOWN_MS - (now.getTime() - new Date(existing.lastBuzzedAt).getTime())) / 1000,
          );
          return res.status(429).json({ message: `Cooldown active. Wait ${waitSecs}s before re-buzzing.` });
        }
        const [buzzed] = await db
          .update(pagerTickets)
          .set({ buzzCount: existing.buzzCount + 1, lastBuzzedAt: now })
          .where(eq(pagerTickets.id, existing.id))
          .returning();
        publishRealtimeEvent([`branch:${cafe.id}`, `pager:${buzzed.trackingToken}`], {
          type: 'pager.buzzed',
          branchId: cafe.id,
          data: { ticket: buzzed },
        });
        deferRequestTask(
          dispatchPushAlertToScopes([`pager:${buzzed.trackingToken}`], {
            title: `${cafe.name} · Order ${buzzed.ticketCode} Ready!`,
            body: `Reminder (#${buzzed.buzzCount}): Your order is waiting at the pickup counter.`,
            tag: `pager-${buzzed.ticketCode}`,
            url: `/pager/${buzzed.trackingToken}`,
            ticketCode: buzzed.ticketCode,
            urgent: true,
          }),
        );
        return res.json({ ticket: buzzed });
      }

      const patch: Partial<typeof pagerTickets.$inferInsert> = { status: action };
      if (action === 'preparing' && !existing.preparingAt) patch.preparingAt = now;
      if (action === 'ready') {
        if (!existing.preparingAt) patch.preparingAt = now;
        patch.readyAt = existing.readyAt || now;
        patch.buzzCount = existing.buzzCount + 1;
        patch.lastBuzzedAt = now;
      }
      if (action === 'collected' || action === 'no_show') {
        patch.collectedAt = now;
      }

      const [updated] = await db
        .update(pagerTickets)
        .set(patch)
        .where(eq(pagerTickets.id, existing.id))
        .returning();

      let releasedCoasters: SmartTag[] = [];
      if (action === 'collected' || action === 'no_show') {
        releasedCoasters = await db
          .update(smartTags)
          .set({ activeTicketId: null })
          .where(and(eq(smartTags.restaurantId, cafe.id), eq(smartTags.activeTicketId, existing.id)))
          .returning();
        for (const c of releasedCoasters) {
          publishRealtimeEvent([`branch:${cafe.id}`, `coaster:${c.token}`], {
            type: 'coaster.updated',
            branchId: cafe.id,
            data: { tag: c, ticket: null },
          });
        }
      }

      publishRealtimeEvent([`branch:${cafe.id}`, `pager:${updated.trackingToken}`], {
        type: action === 'ready' ? 'pager.buzzed' : 'pager.updated',
        branchId: cafe.id,
        data: { ticket: updated },
      });
      if (action === 'ready') {
        deferRequestTask(
          dispatchPushAlertToScopes([`pager:${updated.trackingToken}`], {
            title: `${cafe.name} · Order ${updated.ticketCode} Ready!`,
            body: 'Your order is hot and ready for pickup! Show your code at the counter.',
            tag: `pager-${updated.ticketCode}`,
            url: `/pager/${updated.trackingToken}`,
            ticketCode: updated.ticketCode,
            urgent: true,
          }),
        );
      }

      res.json({ ticket: updated });
    } catch (e) {
      next(e);
    }
  });

  // 1-Tap Out-of-Stock Item Snooze
  app.post('/api/hospitality/items/:id/snooze', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const itemId = z.string().uuid().parse(req.params.id);
      const { isAvailable } = z.object({ isAvailable: z.boolean() }).strict().parse(req.body);
      const items = await storage.getMenuItemsByRestaurantId(cafe.id);
      if (!items.some(i => i.id === itemId)) return res.status(404).json({ message: 'Item not found in this branch' });
      const updated = await storage.updateMenuItem(itemId, { isAvailable });
      res.json({ item: updated });
    } catch (e) {
      next(e);
    }
  });

  // 1-Tap Out-of-Stock Modifier Option Snooze (PRD §3 & §4.1.3)
  app.post('/api/hospitality/items/:id/modifiers/:optionId/snooze', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const itemId = z.string().uuid().parse(req.params.id);
      const optionId = z.string().uuid().parse(req.params.optionId);
      const { isAvailable } = z.object({ isAvailable: z.boolean() }).strict().parse(req.body);
      const items = await storage.getMenuItemsByRestaurantId(cafe.id);
      const target = items.find(i => i.id === itemId);
      if (!target) return res.status(404).json({ message: 'Item not found in this branch' });
      let found = false;
      const nextGroups = (target.modifierGroups || []).map(group => ({
        ...group,
        options: group.options.map(opt => {
          if (opt.id !== optionId) return opt;
          found = true;
          return { ...opt, isAvailable };
        }),
      }));
      if (!found) return res.status(404).json({ message: 'Modifier option not found on this item' });
      const updated = await storage.updateMenuItem(itemId, { modifierGroups: nextGroups });
      res.json({ item: updated });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 3: Staff Floor Zones, Tables, Reservations & Waitlist Management
  app.get('/api/hospitality/floor', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [zones, tables, reservations, waitlist] = await Promise.all([
        db.select().from(diningZones).where(eq(diningZones.restaurantId, cafe.id)).orderBy(asc(diningZones.order)),
        db.select().from(diningTables).where(eq(diningTables.restaurantId, cafe.id)).orderBy(asc(diningTables.tableCode)),
        db
          .select()
          .from(tableReservations)
          .where(eq(tableReservations.restaurantId, cafe.id))
          .orderBy(asc(tableReservations.startAt))
          .limit(200),
        db
          .select()
          .from(waitlistEntries)
          .where(eq(waitlistEntries.restaurantId, cafe.id))
          .orderBy(asc(waitlistEntries.joinedAt))
          .limit(200),
      ]);
      res.json({ zones, tables, reservations, waitlist });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/zones', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          name: z.string().trim().min(1).max(80),
          nameAr: z.string().trim().max(80).optional().nullable(),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [zone] = await db
        .insert(diningZones)
        .values({ restaurantId: cafe.id, name: body.name, nameAr: body.nameAr || null, order: body.order })
        .returning();
      res.status(201).json({ zone });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/zones/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(diningZones).where(and(eq(diningZones.id, req.params.id), eq(diningZones.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/tables', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          zoneId: z.string().uuid(),
          tableCode: z.string().trim().min(1).max(40),
          minCovers: z.number().int().min(1).max(30).default(1),
          maxCovers: z.number().int().min(1).max(30).default(4),
          isCombinable: z.boolean().default(false),
        })
        .strict()
        .parse(req.body);
      if (body.maxCovers < body.minCovers) {
        return res.status(400).json({ message: 'Maximum covers must be at least minimum covers.' });
      }
      const [zone] = await db
        .select()
        .from(diningZones)
        .where(and(eq(diningZones.id, body.zoneId), eq(diningZones.restaurantId, cafe.id)));
      if (!zone) return res.status(400).json({ message: 'Choose a dining zone from this branch' });
      const [table] = await db
        .insert(diningTables)
        .values({
          restaurantId: cafe.id,
          zoneId: body.zoneId,
          tableCode: body.tableCode.toUpperCase(),
          minCovers: body.minCovers,
          maxCovers: body.maxCovers,
          isCombinable: body.isCombinable,
        })
        .returning();
      res.status(201).json({ table });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/tables/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(diningTables).where(and(eq(diningTables.id, req.params.id), eq(diningTables.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/reservations/:id/status', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const { status } = z
        .object({ status: z.enum(['confirmed', 'seated', 'completed', 'cancelled', 'no_show']) })
        .strict()
        .parse(req.body);
      const [updated] = await db
        .update(tableReservations)
        .set({ status, ...(status === 'cancelled' ? { cancelledAt: new Date() } : {}) })
        .where(and(eq(tableReservations.id, req.params.id), eq(tableReservations.restaurantId, cafe.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Reservation not found' });
      publishRealtimeEvent([`branch:${cafe.id}`], {
        type: 'reservation.updated',
        branchId: cafe.id,
        data: { reservation: updated },
      });
      res.json({ reservation: updated });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/waitlist/:id/action', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const { action } = z
        .object({ action: z.enum(['ready', 'rebuzz', 'seated', 'expired']) })
        .strict()
        .parse(req.body);

      const [existing] = await db
        .select()
        .from(waitlistEntries)
        .where(and(eq(waitlistEntries.id, req.params.id), eq(waitlistEntries.restaurantId, cafe.id)));
      if (!existing) return res.status(404).json({ message: 'Waitlist entry not found' });

      const now = new Date();
      if (action === 'rebuzz' && existing.lastBuzzedAt && now.getTime() - new Date(existing.lastBuzzedAt).getTime() < REBUZZ_COOLDOWN_MS) {
        return res.status(429).json({ message: 'Wait 20 seconds before re-buzzing this guest.' });
      }

      const patch: Partial<typeof waitlistEntries.$inferInsert> =
        action === 'ready' || action === 'rebuzz'
          ? {
              status: 'ready',
              readyAt: existing.readyAt || now,
              holdExpiresAt: new Date(now.getTime() + 10 * 60_000),
              buzzCount: existing.buzzCount + 1,
              lastBuzzedAt: now,
            }
          : action === 'seated'
            ? { status: 'seated', seatedAt: now, closedAt: now }
            : { status: 'expired', closedAt: now };

      const [updated] = await db
        .update(waitlistEntries)
        .set(patch)
        .where(eq(waitlistEntries.id, existing.id))
        .returning();

      publishRealtimeEvent([`branch:${cafe.id}`, `waitlist:${updated.trackingToken}`], {
        type: action === 'ready' || action === 'rebuzz' ? 'waitlist.buzzed' : 'waitlist.updated',
        branchId: cafe.id,
        data: { entry: updated },
      });
      if (action === 'ready' || action === 'rebuzz') {
        deferRequestTask(
          dispatchPushAlertToScopes([`waitlist:${updated.trackingToken}`], {
            title: `${cafe.name} · Your Table is Ready (${updated.ticketCode})!`,
            body: 'Please head to the host stand — your table is held for 10 minutes.',
            tag: `waitlist-${updated.ticketCode}`,
            url: `/waitlist/${updated.trackingToken}`,
            ticketCode: updated.ticketCode,
            urgent: true,
          }),
        );
      }

      res.json({ entry: updated });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 4: Staff Drive-Thru Lanes & Curbside Bays
  app.get('/api/hospitality/bays', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [bays, activeVehicles] = await Promise.all([
        db.select().from(serviceBays).where(eq(serviceBays.restaurantId, cafe.id)).orderBy(asc(serviceBays.order), asc(serviceBays.code)),
        db
          .select()
          .from(pagerTickets)
          .where(
            and(
              eq(pagerTickets.restaurantId, cafe.id),
              inArray(pagerTickets.status, ['waiting', 'preparing', 'ready']),
              sql`(${pagerTickets.bayId} IS NOT NULL OR ${pagerTickets.licensePlate} IS NOT NULL)`,
            ),
          )
          .orderBy(asc(pagerTickets.arrivedAt), asc(pagerTickets.queuedAt)),
      ]);
      res.json({ bays, activeVehicles });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/bays', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          code: z.string().trim().min(1).max(40),
          label: z.string().trim().min(1).max(80),
          bayType: z.enum(['curbside', 'drive_thru']).default('curbside'),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [bay] = await db
        .insert(serviceBays)
        .values({
          restaurantId: cafe.id,
          code: body.code.toUpperCase(),
          label: body.label,
          bayType: body.bayType,
          order: body.order,
        })
        .returning();
      res.status(201).json({ bay });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/bays/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db.delete(serviceBays).where(and(eq(serviceBays.id, req.params.id), eq(serviceBays.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Pillar 5: Staff Aggregator Links Management
  app.get('/api/hospitality/aggregators', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const links = await db
        .select()
        .from(aggregatorLinks)
        .where(eq(aggregatorLinks.restaurantId, cafe.id))
        .orderBy(asc(aggregatorLinks.order));
      res.json({ aggregators: links });
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/hospitality/aggregators', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          platform: z.enum(['talabat', 'snoonu', 'keeta', 'custom']),
          displayName: z.string().trim().min(1).max(80),
          url: z.string().trim().url('Enter a valid https:// storefront URL').max(500),
          badgeEn: z.string().trim().max(80).optional().nullable(),
          badgeAr: z.string().trim().max(80).optional().nullable(),
          isActive: z.boolean().default(true),
          order: z.number().int().min(0).default(0),
        })
        .strict()
        .parse(req.body);
      const [link] = await db
        .insert(aggregatorLinks)
        .values({
          restaurantId: cafe.id,
          platform: body.platform,
          displayName: body.displayName,
          url: body.url,
          badgeEn: body.badgeEn || null,
          badgeAr: body.badgeAr || null,
          isActive: body.isActive,
          order: body.order,
        })
        .returning();
      res.status(201).json({ aggregator: link });
    } catch (e) {
      next(e);
    }
  });

  app.put('/api/hospitality/aggregators/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const body = z
        .object({
          displayName: z.string().trim().min(1).max(80).optional(),
          url: z.string().trim().url().max(500).optional(),
          badgeEn: z.string().trim().max(80).nullable().optional(),
          badgeAr: z.string().trim().max(80).nullable().optional(),
          isActive: z.boolean().optional(),
          order: z.number().int().min(0).optional(),
        })
        .strict()
        .parse(req.body);
      const [updated] = await db
        .update(aggregatorLinks)
        .set(body)
        .where(and(eq(aggregatorLinks.id, req.params.id), eq(aggregatorLinks.restaurantId, cafe.id)))
        .returning();
      if (!updated) return res.status(404).json({ message: 'Aggregator link not found' });
      res.json({ aggregator: updated });
    } catch (e) {
      next(e);
    }
  });

  app.delete('/api/hospitality/aggregators/:id', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      await db
        .delete(aggregatorLinks)
        .where(and(eq(aggregatorLinks.id, req.params.id), eq(aggregatorLinks.restaurantId, cafe.id)));
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // ===== QR & NFC SMART TAG STUDIO + REUSABLE PAGER COASTERS =====

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

  // Branch SLA, Congestion & Aggregator Analytics
  app.get('/api/hospitality/analytics', isAuthenticated, async (req: any, res, next) => {
    try {
      const cafe = await getManagedCafe(req);
      if (!cafe) return res.status(404).json({ message: 'Set up your café first' });
      const [tickets, orders, reservations, waitlist, clicks, allItems] = await Promise.all([
        db.select().from(pagerTickets).where(eq(pagerTickets.restaurantId, cafe.id)),
        db.select().from(guestOrders).where(eq(guestOrders.restaurantId, cafe.id)),
        db.select().from(tableReservations).where(eq(tableReservations.restaurantId, cafe.id)),
        db.select().from(waitlistEntries).where(eq(waitlistEntries.restaurantId, cafe.id)),
        db.select().from(aggregatorClicks).where(eq(aggregatorClicks.restaurantId, cafe.id)),
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
        },
        clicksByPlatform,
        topClickedItems,
        hourlyBuckets,
      });
    } catch (e) {
      next(e);
    }
  });

  // Super Admin / Tenant Owner Multi-Branch Comparison Analytics
  app.get('/api/super-admin/portfolio-analytics', isSuperAdmin, async (_req, res, next) => {
    try {
      const [cafes, tickets, orders, reservations, clicks] = await Promise.all([
        storage.getAllRestaurants(),
        db.select().from(pagerTickets),
        db.select().from(guestOrders),
        db.select().from(tableReservations),
        db.select().from(aggregatorClicks),
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
        const branchOrders = orders.filter(o => o.restaurantId === cafe.id);
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
          totalOrders: branchOrders.length,
          reservations: branchRes.length,
          aggregatorClicks: branchClicks.length,
        };
      });

      res.json({ branches });
    } catch (e) {
      next(e);
    }
  });

  // ===== ORDERS & RECEIPTS CONSOLE + POS COUNTER ENTRY =====

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
