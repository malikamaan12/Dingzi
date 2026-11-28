import { createHmac } from 'node:crypto';

/**
 * Formats a 6-digit Station PIN with an explicit domain-separation prefix
 * (`35` UTF-8 bytes) before `bcrypt.hash` / `bcrypt.compare`.
 * Keeps PIN hashes domain-isolated from user passwords and satisfies the
 * `10..72` byte preimage invariant enforced by `cafe-passwords` on Workers.
 */
export function formatStationPinSecret(pin: string): string {
  return `dingzi-station-pin-secret:v1:${pin.trim()}`;
}

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
