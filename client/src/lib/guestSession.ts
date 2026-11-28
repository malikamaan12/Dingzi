import { useEffect, useState } from 'react';
import type { GuestCartItem } from '@/components/hospitality/GuestHospitalityBar';

export interface SavedGuestPass {
  kind: 'pager' | 'waitlist' | 'booking';
  trackingToken: string;
  code: string;
  restaurantId: string;
  restaurantName: string;
  updatedAt: number;
  startAt?: string;
}

const PASSES_STORAGE_KEY = 'dingzi-active-passes-v1';
const PASSES_EVENT = 'dingzi:passes-updated';
const PROFILE_STORAGE_KEY = 'dingzi-guest-profile-v1';
const LAST_ORDER_PREFIX = 'dingzi-last-order-v1-';

export function saveLastGuestOrder(restaurantId: string, items: GuestCartItem[]) {
  if (typeof window === 'undefined' || !restaurantId || !items.length) return;
  try {
    localStorage.setItem(
      `${LAST_ORDER_PREFIX}${restaurantId}`,
      JSON.stringify({ savedAt: Date.now(), items: items.slice(0, 12) }),
    );
  } catch {}
}

export function readLastGuestOrder(restaurantId?: string): GuestCartItem[] {
  if (typeof window === 'undefined' || !restaurantId) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(`${LAST_ORDER_PREFIX}${restaurantId}`) || 'null');
    if (!raw || !Array.isArray(raw.items)) return [];
    return raw.items.filter(
      (i: any): i is GuestCartItem =>
        Boolean(i && typeof i.key === 'string' && typeof i.menuItemId === 'string' && Number(i.quantity) > 0),
    );
  } catch {
    return [];
  }
}

export interface SavedGuestProfile {
  name: string;
  phone: string;
  vehicleColor: string;
  vehicleType: string;
  licensePlate: string;
}

export function readGuestProfile(): SavedGuestProfile {
  const empty: SavedGuestProfile = {
    name: '',
    phone: '',
    vehicleColor: '',
    vehicleType: '',
    licensePlate: '',
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || '{}');
    if (!raw || typeof raw !== 'object') return empty;
    return {
      name: typeof raw.name === 'string' ? raw.name : '',
      phone: typeof raw.phone === 'string' ? raw.phone : '',
      vehicleColor: typeof raw.vehicleColor === 'string' ? raw.vehicleColor : '',
      vehicleType: typeof raw.vehicleType === 'string' ? raw.vehicleType : '',
      licensePlate: typeof raw.licensePlate === 'string' ? raw.licensePlate : '',
    };
  } catch {
    return empty;
  }
}

export function saveGuestProfile(patch: Partial<SavedGuestProfile>) {
  if (typeof window === 'undefined') return;
  try {
    const prev = readGuestProfile();
    const next: SavedGuestProfile = {
      name: patch.name !== undefined ? patch.name.trim() : prev.name,
      phone: patch.phone !== undefined ? patch.phone.trim() : prev.phone,
      vehicleColor: patch.vehicleColor !== undefined ? patch.vehicleColor : prev.vehicleColor,
      vehicleType: patch.vehicleType !== undefined ? patch.vehicleType : prev.vehicleType,
      licensePlate: patch.licensePlate !== undefined ? patch.licensePlate.trim() : prev.licensePlate,
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Private browsing works without storage */
  }
}

function readAllPasses(): SavedGuestPass[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(PASSES_STORAGE_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return raw.filter(
      (p): p is SavedGuestPass =>
        Boolean(p && typeof p.trackingToken === 'string' && typeof p.kind === 'string' && (p.updatedAt || 0) > cutoff),
    );
  } catch {
    return [];
  }
}

function writeAllPasses(passes: SavedGuestPass[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PASSES_STORAGE_KEY, JSON.stringify(passes.slice(0, 12)));
    window.dispatchEvent(new CustomEvent(PASSES_EVENT));
  } catch {
    /* Private browsing works without storage */
  }
}

export function saveGuestPass(pass: Omit<SavedGuestPass, 'updatedAt'>) {
  const current = readAllPasses().filter(
    p => !(p.kind === pass.kind && p.trackingToken === pass.trackingToken),
  );
  writeAllPasses([{ ...pass, updatedAt: Date.now() }, ...current]);
}

export function dismissGuestPass(kind: SavedGuestPass['kind'], trackingToken: string) {
  const next = readAllPasses().filter(p => !(p.kind === kind && p.trackingToken === trackingToken));
  writeAllPasses(next);
}

export function useSavedGuestPasses(restaurantId?: string): SavedGuestPass[] {
  const [passes, setPasses] = useState<SavedGuestPass[]>(() => readAllPasses());

  useEffect(() => {
    const sync = () => setPasses(readAllPasses());
    window.addEventListener(PASSES_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(PASSES_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return restaurantId ? passes.filter(p => p.restaurantId === restaurantId) : passes;
}

export function usePersistedGuestCart(restaurantId?: string) {
  const storageKey = restaurantId ? `dingzi-cart-v1-${restaurantId}` : null;
  const [cart, setCart] = useState<GuestCartItem[]>([]);

  useEffect(() => {
    if (!storageKey) {
      setCart([]);
      return;
    }
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) {
        setCart(
          parsed.filter(
            (i): i is GuestCartItem =>
              Boolean(i && typeof i.key === 'string' && typeof i.menuItemId === 'string' && Number(i.quantity) > 0),
          ),
        );
      } else {
        setCart([]);
      }
    } catch {
      setCart([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(cart));
    } catch {
      /* Storage optional */
    }
  }, [storageKey, cart]);

  return [cart, setCart] as const;
}

export function buildReservationIcsFile(params: {
  restaurantName: string;
  address?: string | null;
  tableCode?: string | null;
  partySize: number;
  startAtIso: string;
  endAtIso: string;
  bookingUrl: string;
}): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escapeIcs = (s: string) => s.replace(/[,;\\]/g, '\\$&').replace(/\n/g, '\\n');
  const summary = `${params.restaurantName} · Table Reservation (${params.partySize} guests)`;
  const description = `Manage reservation: ${params.bookingUrl}${params.tableCode ? `\\nTable: ${params.tableCode}` : ''}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dingzi Hospitality//Table Booking//EN',
    'BEGIN:VEVENT',
    `UID:${fmt(params.startAtIso)}-${Math.random().toString(36).slice(2, 9)}@dingzi.app`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(params.startAtIso)}`,
    `DTEND:${fmt(params.endAtIso)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    ...(params.address ? [`LOCATION:${escapeIcs(params.address)}`] : []),
    `DESCRIPTION:${description}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
