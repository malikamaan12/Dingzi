import { and, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { decryptGatewaySecret, type BranchGatewaySecrets } from '../payments/gateways';
import { branchPaymentConfigs, pagerTickets, waitlistEntries, type DiningTable, type PublicCafe, type Restaurant, type TableReservation } from '@shared/schema';


export const REBUZZ_COOLDOWN_MS = 20_000;
export const DEPOSIT_HOLD_TTL_MS = 15 * 60_000;

export async function loadBranchGatewaySecrets(restaurantId: string): Promise<BranchGatewaySecrets | undefined> {
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

export function parseHhMmToMins(hhmm?: string | null, fallbackMins = 8 * 60): number {
  if (!hhmm || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return fallbackMins;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function resolveBranchOperatingMinutes(restaurant: Pick<Restaurant, 'openTime' | 'closeTime' | 'openingHours'>): {
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

export function reservationBlocksWindow(
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

export function busyTableIdsForWindow(
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
export function findTableAllocation(
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

export function countAvailableSlotAllocations(
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

export function toPublicCafe(restaurant: Restaurant): PublicCafe {
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

export function branchLocalDate(timezone = 'Asia/Qatar'): string {
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

export async function nextDailyPagerCode(tx: typeof db, restaurantId: string, ticketDate: string) {
  const existing = await tx
    .select({ maxSeq: sql<number>`coalesce(max(${pagerTickets.dailySeq}), 0)` })
    .from(pagerTickets)
    .where(and(eq(pagerTickets.restaurantId, restaurantId), eq(pagerTickets.ticketDate, ticketDate)));
  const seq = Number(existing[0]?.maxSeq || 0) + 1;
  const code = `A-${String(seq).padStart(3, '0')}`;
  return { seq, code };
}

export async function nextWaitlistCode(tx: typeof db, restaurantId: string) {
  const countRows = await tx
    .select({ n: sql<number>`count(*)` })
    .from(waitlistEntries)
    .where(eq(waitlistEntries.restaurantId, restaurantId));
  const seq = (Number(countRows[0]?.n || 0) % 999) + 1;
  return `W-${String(seq).padStart(3, '0')}`;
}

