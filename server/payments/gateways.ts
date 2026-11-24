import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';

export type PaymentGatewayKind = 'venue' | 'skipcash' | 'sadad';

export interface BranchGatewaySecrets {
  skipcashKeyId?: string | null;
  skipcashSecret?: string | null;
  skipcashCheckoutUrl?: string | null;
  sadadMerchantId?: string | null;
  sadadSecret?: string | null;
  sadadCheckoutUrl?: string | null;
}

export interface PaymentSessionInput {
  targetKind?: 'order' | 'reservation';
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  amount: string;
  currency: string;
  provider: 'skipcash' | 'sadad';
  customerName?: string | null;
  customerPhone?: string | null;
  returnOrigin: string;
  branchSecrets?: BranchGatewaySecrets;
}

export interface PaymentSessionResult {
  provider: 'skipcash' | 'sadad';
  paymentReference: string;
  checkoutMode: 'sandbox_interactive' | 'hosted_redirect';
  checkoutUrl: string;
  signatureToken: string;
}

function encryptionKey(): Buffer {
  const material = process.env.SESSION_SECRET || 'dingzi-local-dev-secret-key-material';
  return createHash('sha256').update(`dingzi:gateway-vault:v1:${material}`).digest();
}

export function encryptGatewaySecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptGatewaySecret(encoded?: string | null): string | null {
  if (!encoded) return null;
  const parts = encoded.split('.');
  if (parts.length !== 3) return null;
  try {
    const iv = Buffer.from(parts[0], 'base64url');
    const tag = Buffer.from(parts[1], 'base64url');
    const ciphertext = Buffer.from(parts[2], 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function maskGatewayValue(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

function webhookSecret(provider: 'skipcash' | 'sadad', branchSecrets?: BranchGatewaySecrets): string {
  const branchSpecific =
    provider === 'skipcash' ? branchSecrets?.skipcashSecret : branchSecrets?.sadadSecret;
  if (branchSpecific && branchSpecific.length >= 8) {
    return branchSpecific;
  }
  const envKey = provider === 'skipcash' ? process.env.SKIPCASH_WEBHOOK_SECRET : process.env.SADAD_WEBHOOK_SECRET;
  return envKey && envKey.length >= 16
    ? envKey
    : `${process.env.SESSION_SECRET || 'local-dev-secret'}:${provider}:webhook`;
}

export function signGatewayPayload(
  provider: 'skipcash' | 'sadad',
  payload: string,
  branchSecrets?: BranchGatewaySecrets,
): string {
  return createHmac('sha256', webhookSecret(provider, branchSecrets)).update(payload).digest('hex');
}

export function verifyGatewaySignature(
  provider: 'skipcash' | 'sadad',
  payload: string,
  signature: string,
  branchSecrets?: BranchGatewaySecrets,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = Buffer.from(signGatewayPayload(provider, payload, branchSecrets), 'hex');
  const provided = Buffer.from(signature, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * Pluggable Qatar/GCC payment gateway adapter (SkipCash & Sadad).
 * Supports per-branch encrypted credentials or environment secrets, with deterministic
 * HMAC-signed sandbox confirmation when hosted redirect URLs are not configured.
 */
export async function createPaymentCheckoutSession(
  input: PaymentSessionInput,
): Promise<PaymentSessionResult> {
  const kind = input.targetKind || 'order';
  const prefix = kind === 'reservation' ? 'DEP' : input.provider.toUpperCase();
  const paymentReference = `${prefix}-${randomUUID().slice(0, 12).toUpperCase()}`;
  const canonical = `${input.orderId}:${paymentReference}:${input.amount}:${input.currency}`;
  const signatureToken = signGatewayPayload(input.provider, canonical, input.branchSecrets);

  const liveEndpoint =
    input.provider === 'skipcash'
      ? input.branchSecrets?.skipcashCheckoutUrl || process.env.SKIPCASH_CHECKOUT_URL
      : input.branchSecrets?.sadadCheckoutUrl || process.env.SADAD_CHECKOUT_URL;

  if (liveEndpoint && /^https:\/\//.test(liveEndpoint)) {
    const url = new URL(liveEndpoint);
    url.searchParams.set('ref', paymentReference);
    url.searchParams.set(kind === 'reservation' ? 'reservationId' : 'orderId', input.orderId);
    url.searchParams.set('amount', input.amount);
    url.searchParams.set('currency', input.currency);
    return {
      provider: input.provider,
      paymentReference,
      checkoutMode: 'hosted_redirect',
      checkoutUrl: url.toString(),
      signatureToken,
    };
  }

  const confirmPath =
    kind === 'reservation'
      ? `/api/public/reservations/${input.orderId}/confirm-deposit`
      : `/api/public/payments/${input.orderId}/confirm-sandbox`;

  return {
    provider: input.provider,
    paymentReference,
    checkoutMode: 'sandbox_interactive',
    checkoutUrl: `${input.returnOrigin}${confirmPath}`,
    signatureToken,
  };
}
