import { createHmac } from 'node:crypto';

/**
 * Computes an HMAC-SHA256 lookup digest keyed with `SESSION_SECRET` and scoped
 * to `tenantId` so 6-digit Station PIN sign-in resolves in O(1) via partial index
 * before running a single constant-time `bcrypt.compare` verification.
 */
export function computeStationPinLookup(tenantId: string, pin: string): string {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 32) {
    throw new Error('SESSION_SECRET must be configured for station PIN verification');
  }
  return createHmac('sha256', secret)
    .update(`dingzi-station-pin:v1:${tenantId}:${pin.trim()}`)
    .digest('hex');
}
