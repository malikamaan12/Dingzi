// Pure Web Crypto API implementation of RFC 8292 (VAPID ES256) and RFC 8291 (aes128gcm Web Push Encryption).
// Runs identically in Node.js 22+ and Cloudflare Workers with zero native C++ addons.

const subtle = globalThis.crypto.subtle;

export interface VapidKeyBundle {
  publicKeyBase64Url: string;
  privateJwk: JsonWebKey;
  publicJwk: JsonWebKey;
}

export function isAllowedPushEndpoint(endpointUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password) return false;
  const host = parsed.hostname.toLowerCase();

  if (
    process.env.ALLOW_LOCAL_PUSH_TEST_ENDPOINT === 'true' &&
    (host === '127.0.0.1' || host === 'localhost') &&
    (parsed.protocol === 'http:' || parsed.protocol === 'https:')
  ) {
    return true;
  }

  if (parsed.protocol !== 'https:') return false;
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host.startsWith('[') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.localhost') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)
  ) {
    return false;
  }
  return host.includes('.');
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function concatBytes(...chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, c) => sum + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return merged;
}

async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', key, data));
}

export async function generateVapidKeys(): Promise<VapidKeyBundle> {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const rawPublic = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const privateJwk = await subtle.exportKey('jwk', pair.privateKey);
  const publicJwk = await subtle.exportKey('jwk', pair.publicKey);
  return {
    publicKeyBase64Url: bytesToBase64Url(rawPublic),
    privateJwk,
    publicJwk,
  };
}

export async function createVapidAuthHeader(
  endpoint: string,
  vapid: VapidKeyBundle,
  subject = 'mailto:alerts@dingzi.app',
): Promise<string> {
  const origin = new URL(endpoint).origin;
  const nowSec = Math.floor(Date.now() / 1000);
  const enc = new TextEncoder();
  const headerB64 = bytesToBase64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payloadB64 = bytesToBase64Url(
    enc.encode(JSON.stringify({ aud: origin, exp: nowSec + 12 * 3600, sub: subject })),
  );
  const signingInput = `${headerB64}.${payloadB64}`;
  const privateKey = await subtle.importKey(
    'jwk',
    vapid.privateJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(
    await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, enc.encode(signingInput)),
  );
  const jwt = `${signingInput}.${bytesToBase64Url(signature)}`;
  return `vapid t=${jwt}, k=${vapid.publicKeyBase64Url}`;
}

export async function encryptWebPushAes128Gcm(
  plaintextJson: string,
  clientP256dhBase64Url: string,
  clientAuthBase64Url: string,
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const uaPublicBytes = base64UrlToBytes(clientP256dhBase64Url);
  const authSecret = base64UrlToBytes(clientAuthBase64Url);
  if (uaPublicBytes.length !== 65 || authSecret.length !== 16) {
    throw new Error('Invalid Web Push subscription key lengths');
  }

  const uaPublicKey = await subtle.importKey(
    'raw',
    uaPublicBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );

  const serverEcdh = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublicBytes = new Uint8Array(await subtle.exportKey('raw', serverEcdh.publicKey));
  const sharedSecret = new Uint8Array(
    await subtle.deriveBits({ name: 'ECDH', public: uaPublicKey }, serverEcdh.privateKey, 256),
  );

  // RFC 8291 §3.3 IKM derivation
  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes, new Uint8Array([1]));
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hmacSha256(prkKey, keyInfo);

  // RFC 8188 §2.2 / §2.3 CEK & Nonce derivation
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, concatBytes(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmacSha256(prk, concatBytes(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const paddedPlaintext = concatBytes(enc.encode(plaintextJson), new Uint8Array([2]));
  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, paddedPlaintext),
  );

  // 86-byte aes128gcm header: salt(16) || rs(4, 4096) || idlen(1, 65) || keyid(65, as_public)
  const header = new Uint8Array(86);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096, false);
  header[20] = 65;
  header.set(asPublicBytes, 21);

  return concatBytes(header, ciphertext);
}

/**
 * Used in automated verification tests to confirm RFC 8291 round-trip decryption.
 */
export async function decryptWebPushAes128GcmForTest(
  encryptedBody: Uint8Array,
  uaPrivateKey: CryptoKey,
  uaPublicBytes: Uint8Array,
  authSecret: Uint8Array,
): Promise<string> {
  const enc = new TextEncoder();
  const salt = encryptedBody.slice(0, 16);
  const idlen = encryptedBody[20];
  const asPublicBytes = encryptedBody.slice(21, 21 + idlen);
  const ciphertext = encryptedBody.slice(21 + idlen);

  const asPublicKey = await subtle.importKey('raw', asPublicBytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedSecret = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asPublicKey }, uaPrivateKey, 256));

  const keyInfo = concatBytes(enc.encode('WebPush: info\0'), uaPublicBytes, asPublicBytes, new Uint8Array([1]));
  const prkKey = await hmacSha256(authSecret, sharedSecret);
  const ikm = await hmacSha256(prkKey, keyInfo);

  const prk = await hmacSha256(salt, ikm);
  const cek = (await hmacSha256(prk, concatBytes(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmacSha256(prk, concatBytes(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);

  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const padded = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ciphertext));
  let end = padded.length - 1;
  while (end >= 0 && padded[end] === 0) end--;
  if (padded[end] !== 2) throw new Error('Invalid RFC 8188 record delimiter');
  return new TextDecoder().decode(padded.slice(0, end));
}
