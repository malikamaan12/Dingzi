import { z } from 'zod';
import type { EffectiveStaffRole, StaffRole } from './schema';

export const STAFF_CAPABILITY_KEYS = [
  'canManageTables',
  'canSettlePos',
  'canIssuePagers',
  'canSnoozeMenu',
  'canManagePaymentVault',
] as const;

export type StaffCapabilityKey = (typeof STAFF_CAPABILITY_KEYS)[number];
export type StaffCapabilityOverrides = Partial<Record<StaffCapabilityKey, boolean>>;
export type ResolvedStaffCapabilities = Record<StaffCapabilityKey, boolean>;

export const staffCapabilitiesSchema = z
  .object({
    canManageTables: z.boolean().optional(),
    canSettlePos: z.boolean().optional(),
    canIssuePagers: z.boolean().optional(),
    canSnoozeMenu: z.boolean().optional(),
    canManagePaymentVault: z.boolean().optional(),
  })
  .strict();

export const stationPinSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'Station PIN must be exactly 6 digits');

export const ROLE_DEFAULT_CAPABILITIES: Readonly<Record<EffectiveStaffRole, ResolvedStaffCapabilities>> = {
  super_admin: {
    canManageTables: true,
    canSettlePos: true,
    canIssuePagers: true,
    canSnoozeMenu: true,
    canManagePaymentVault: true,
  },
  tenant_owner: {
    canManageTables: true,
    canSettlePos: true,
    canIssuePagers: true,
    canSnoozeMenu: true,
    canManagePaymentVault: true,
  },
  branch_manager: {
    canManageTables: true,
    canSettlePos: true,
    canIssuePagers: true,
    canSnoozeMenu: true,
    canManagePaymentVault: true,
  },
  host_cashier: {
    canManageTables: true,
    canSettlePos: true,
    canIssuePagers: true,
    canSnoozeMenu: false,
    canManagePaymentVault: false,
  },
  prep_barista: {
    canManageTables: false,
    canSettlePos: false,
    canIssuePagers: false,
    canSnoozeMenu: true,
    canManagePaymentVault: false,
  },
};

export const CAPABILITY_LABELS: Readonly<
  Record<StaffCapabilityKey, { label: string; description: string }>
> = {
  canManageTables: {
    label: 'Reception: Waitlist & Reservations',
    description: 'Add walk-in parties, ring ready tables, and seat reservations at the host stand.',
  },
  canSettlePos: {
    label: 'Cashier: Counter POS & Payments',
    description: 'Ring up walk-in orders and settle Pay-at-Venue bills as Paid.',
  },
  canIssuePagers: {
    label: 'Counter Pagers & NFC Coasters',
    description: 'Issue instant virtual pagers and bind/release reusable NFC coasters.',
  },
  canSnoozeMenu: {
    label: '86 Item & Modifier Stock Snooze',
    description: 'Temporarily mark sold-out menu items or modifiers unavailable during rush.',
  },
  canManagePaymentVault: {
    label: 'Payment Gateway Vault',
    description: 'View and update SkipCash / Sadad API credentials for the branch.',
  },
};

export const STAFF_ROLE_META: Readonly<
  Record<StaffRole, { label: string; shortLabel: string; summary: string }>
> = {
  tenant_owner: {
    label: 'Tenant Admin',
    shortLabel: 'Tenant Admin',
    summary:
      'Full organization control across all tenant branches, branch creation within quota, payment vault, and all team accounts.',
  },
  branch_manager: {
    label: 'Branch Manager',
    shortLabel: 'Branch Manager',
    summary:
      'Full branch management: menus, pricing, tables, bays, QR/NFC tags, analytics, and Reception/Prep staff for assigned branches.',
  },
  host_cashier: {
    label: 'Reception & Cashier',
    shortLabel: 'Reception',
    summary:
      'Front-desk & counter desk: walk-in waitlist, table bookings, virtual pagers, NFC coasters, and Counter POS settlement.',
  },
  prep_barista: {
    label: 'Order Prep / Barista',
    shortLabel: 'Order Prep',
    summary:
      'Prep rail & curbside runner: advance order prep states, check off line items, 30s recall, and 1-tap 86 stock snooze.',
  },
};

export function resolveStaffCapabilities(
  role: EffectiveStaffRole,
  overrides?: StaffCapabilityOverrides | null,
): ResolvedStaffCapabilities {
  if (role === 'super_admin' || role === 'tenant_owner') {
    return { ...ROLE_DEFAULT_CAPABILITIES.tenant_owner };
  }
  const base = { ...ROLE_DEFAULT_CAPABILITIES[role] };
  if (!overrides) return base;
  for (const key of STAFF_CAPABILITY_KEYS) {
    if (typeof overrides[key] === 'boolean') {
      base[key] = overrides[key]!;
    }
  }
  return base;
}

export function formatEffectiveRoleTitle(
  role?: EffectiveStaffRole | null,
  capabilities?: ResolvedStaffCapabilities | null,
): string {
  if (!role || role === 'branch_manager') return 'Branch Manager';
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'tenant_owner') return 'Tenant Admin';
  if (role === 'prep_barista') return 'Order Prep / Barista';
  if (role === 'host_cashier' && capabilities) {
    if (capabilities.canManageTables && !capabilities.canSettlePos) return 'Reception / Host';
    if (!capabilities.canManageTables && capabilities.canSettlePos) return 'Counter Cashier';
  }
  return 'Reception & Cashier';
}

/**
 * Single source of truth enforcing endpoint-level RBAC + capability overrides
 * across Express (`server/accessControl.ts`) and Cloudflare Workers.
 */
export function staffActionAllowed(
  staffRole: EffectiveStaffRole,
  capabilities: ResolvedStaffCapabilities,
  method: string,
  path: string,
  body?: any,
): boolean {
  if (staffRole === 'super_admin' || staffRole === 'tenant_owner') {
    return true;
  }

  if (staffRole === 'branch_manager') {
    if (path === '/api/hospitality/branches') return false;
    if (path === '/api/hospitality/payment-config' && !capabilities.canManagePaymentVault) {
      return false;
    }
    return true;
  }

  const isRead = method === 'GET' || method === 'HEAD';

  // Read-only branch context endpoints shared by Reception & Prep stations
  if (
    isRead &&
    (/^\/api\/(?:restaurant|manager-menu|categories|menu-items)$/.test(path) ||
      /^\/api\/hospitality\/(?:stream|pagers|bays|orders|smart-tags|push\/status)$/.test(path))
  ) {
    return true;
  }

  if (method === 'POST' && (/^\/api\/hospitality\/push\/(?:subscribe|test)$/.test(path) || path === '/api/hospitality/switch-branch')) {
    return true;
  }

  // Reception: Floor read + Walk-in waitlist & reservations management
  if (capabilities.canManageTables) {
    if (isRead && path === '/api/hospitality/floor') return true;
    if (
      method === 'POST' &&
      (path === '/api/hospitality/waitlist' ||
        /^\/api\/hospitality\/waitlist\/[^/]+\/action$/.test(path) ||
        path === '/api/hospitality/reservations' ||
        /^\/api\/hospitality\/reservations\/[^/]+\/status$/.test(path))
    ) {
      return true;
    }
  }

  // Counter Pager & Reusable NFC Coaster issuance
  if (capabilities.canIssuePagers) {
    if (
      method === 'POST' &&
      (path === '/api/hospitality/pagers/issue' ||
        /^\/api\/hospitality\/smart-tags\/[^/]+\/assign-ticket$/.test(path))
    ) {
      return true;
    }
  }

  // Counter POS Order Creation & Pay-at-Venue Settlement
  if (capabilities.canSettlePos) {
    if (
      method === 'POST' &&
      (path === '/api/hospitality/orders' ||
        /^\/api\/hospitality\/orders\/[^/]+\/payment-status$/.test(path))
    ) {
      return true;
    }
  }

  // Live Pager & Prep Rail transitions + line-item checkoffs (including 30s Recall)
  if (staffRole === 'prep_barista' || capabilities.canIssuePagers || capabilities.canSettlePos) {
    if (method === 'POST' && /^\/api\/hospitality\/pagers\/[^/]+\/line-items\/\d+\/toggle$/.test(path)) {
      return true;
    }
    if (method === 'POST' && /^\/api\/hospitality\/pagers\/[^/]+\/transition$/.test(path)) {
      if (body?.action === 'confirm_venue_payment') {
        return capabilities.canSettlePos;
      }
      return true;
    }
  }

  // 86 Item & Modifier Stock Snooze
  if (capabilities.canSnoozeMenu) {
    if (
      method === 'POST' &&
      (/^\/api\/hospitality\/items\/[^/]+\/snooze$/.test(path) ||
        /^\/api\/hospitality\/items\/[^/]+\/modifiers\/[^/]+\/snooze$/.test(path))
    ) {
      return true;
    }
  }

  return false;
}
