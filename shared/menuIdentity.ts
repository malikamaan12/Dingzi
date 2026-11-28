// Printed restaurant QRs use the configured public origin for this isolated platform.
const viteEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
const nodeEnv = typeof process !== 'undefined' ? process.env : undefined;

export const PUBLIC_MENU_ORIGIN = (
  viteEnv?.VITE_PUBLIC_MENU_ORIGIN ||
  nodeEnv?.PUBLIC_MENU_ORIGIN ||
  'https://pager-menu.example.workers.dev'
).replace(/\/+$/, '');

export const MANAGEMENT_ORIGIN = (
  viteEnv?.VITE_MANAGEMENT_ORIGIN ||
  nodeEnv?.MANAGEMENT_ORIGIN ||
  'https://pager-staff.example.workers.dev'
).replace(/\/+$/, '');

export function isPublicMenuOrigin(origin?: string): boolean {
  const normalized = (origin || '').replace(/\/+$/, '');
  if (!normalized) return false;
  return normalized === PUBLIC_MENU_ORIGIN || /^https?:\/\/[^/]*-menu\./i.test(normalized);
}

export function permanentMenuUrl(restaurantId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(restaurantId)) {
    throw new Error('A saved restaurant is required for its menu QR.');
  }
  return `${PUBLIC_MENU_ORIGIN}/menu/${restaurantId}`;
}

export function publicExperienceOrigin(currentOrigin?: string): string {
  const normalizedCurrent = (currentOrigin || '').replace(/\/+$/, '');
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(normalizedCurrent)) {
    return normalizedCurrent;
  }
  if (PUBLIC_MENU_ORIGIN && !PUBLIC_MENU_ORIGIN.includes('.example.workers.dev')) {
    return PUBLIC_MENU_ORIGIN;
  }
  return normalizedCurrent || PUBLIC_MENU_ORIGIN;
}

export function smartTagUrl(token: string, source?: 'nfc' | 'qr', currentOrigin?: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(token)) {
    throw new Error('A valid smart tag token is required.');
  }
  const base = publicExperienceOrigin(currentOrigin);
  return `${base}/tag/${token}${source === 'nfc' ? '?src=nfc' : ''}`;
}
