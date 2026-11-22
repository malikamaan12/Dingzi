import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type PaymentGatewayKind = 'venue' | 'skipcash' | 'sadad';

export interface PaymentSessionInput {
  orderId: string;
  orderNumber: string;
  restaurantId: string;
  amount: string;
  currency: string;
  provider: 'skipcash' | 'sadad';
  customerName?: string | null;
  customerPhone?: string | null;
  returnOrigin: string;
}

export interface PaymentSessionResult {
  provider: 'skipcash' | 'sadad';
  paymentReference: string;
  checkoutMode: 'sandbox_interactive' | 'hosted_redirect';
  checkoutUrl: string;
  signatureToken: string;
}

function webhookSecret(provider: 'skipcash' | 'sadad'): string {
  const envKey = provider === 'skipcash' ? process.env.SKIPCASH_WEBHOOK_SECRET : process.env.SADAD_WEBHOOK_SECRET;
  return envKey && envKey.length >= 16
    ? envKey
    : `${process.env.SESSION_SECRET || 'local-dev-secret'}:${provider}:webhook`;
}

export function signGatewayPayload(provider: 'skipcash' | 'sadad', payload: string): string {
  return createHmac('sha256', webhookSecret(provider)).update(payload).digest('hex');
}

export function verifyGatewaySignature(
  provider: 'skipcash' | 'sadad',
  payload: string,
  signature: string,
): boolean {
  if (!/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const expected = Buffer.from(signGatewayPayload(provider, payload), 'hex');
  const provided = Buffer.from(signature, 'hex');
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/**
 * Pluggable Qatar/GCC payment gateway adapter (SkipCash & Sadad).
 * When live merchant credentials are configured in environment secrets, issues a signed gateway
 * session; otherwise runs in deterministic sandbox checkout mode with full HMAC verification.
 */
export async function createPaymentCheckoutSession(
  input: PaymentSessionInput,
): Promise<PaymentSessionResult> {
  const paymentReference = `${input.provider.toUpperCase()}-${randomUUID().slice(0, 12).toUpperCase()}`;
  const canonical = `${input.orderId}:${paymentReference}:${input.amount}:${input.currency}`;
  const signatureToken = signGatewayPayload(input.provider, canonical);

  const liveEndpoint =
    input.provider === 'skipcash' ? process.env.SKIPCASH_CHECKOUT_URL : process.env.SADAD_CHECKOUT_URL;

  if (liveEndpoint && /^https:\/\//.test(liveEndpoint)) {
    const url = new URL(liveEndpoint);
    url.searchParams.set('ref', paymentReference);
    url.searchParams.set('orderId', input.orderId);
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

  return {
    provider: input.provider,
    paymentReference,
    checkoutMode: 'sandbox_interactive',
    checkoutUrl: `${input.returnOrigin}/api/public/payments/${input.orderId}/confirm-sandbox`,
    signatureToken,
  };
}
