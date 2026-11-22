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

export function permanentMenuUrl(restaurantId: string): string {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(restaurantId)) {
    throw new Error('A saved restaurant is required for its menu QR.');
  }
  return `${PUBLIC_MENU_ORIGIN}/menu/${restaurantId}`;
}
