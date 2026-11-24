import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  createVapidAuthHeader,
  decryptWebPushAes128GcmForTest,
  encryptWebPushAes128Gcm,
  generateVapidKeys,
  isAllowedPushEndpoint,
} from '../server/webPushCrypto';

const subtle = globalThis.crypto.subtle;

// 1. Cryptographic RFC 8292 (VAPID ES256) + RFC 8291 (aes128gcm) unit verification
const vapid = await generateVapidKeys();
const rawPub = base64UrlToBytes(vapid.publicKeyBase64Url);
assert.equal(rawPub.length, 65, 'Uncompressed P-256 public key must be 65 bytes');
assert.equal(rawPub[0], 0x04, 'Uncompressed P-256 public key must start with 0x04');

const authHeader = await createVapidAuthHeader('https://fcm.googleapis.com/fcm/send/mock-token', vapid);
const headerMatch = authHeader.match(/^vapid t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+), k=([A-Za-z0-9_-]+)$/);
assert.ok(headerMatch, 'VAPID Authorization header format mismatch');
assert.equal(headerMatch[3], vapid.publicKeyBase64Url);

const verifyKey = await subtle.importKey('raw', rawPub as BufferSource, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
const jwtValid = await subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  verifyKey,
  base64UrlToBytes(headerMatch[2]) as BufferSource,
  new TextEncoder().encode(headerMatch[1]),
);
assert.equal(jwtValid, true, 'VAPID ES256 JWT signature failed Web Crypto verification');

const clientKeyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const clientPubBytes = new Uint8Array(await subtle.exportKey('raw', clientKeyPair.publicKey));
const clientAuthSecret = globalThis.crypto.getRandomValues(new Uint8Array(16));

const sampleMessage = JSON.stringify({
  title: 'Lusail Specialty Kiosk · A-001 Ready!',
  body: 'طلبك جاهز للاستلام — Head to the pickup counter now.',
  ticketCode: 'A-001',
  urgent: true,
});
const ciphertext = await encryptWebPushAes128Gcm(
  sampleMessage,
  bytesToBase64Url(clientPubBytes),
  bytesToBase64Url(clientAuthSecret),
);
assert.ok(ciphertext.length > 86, 'aes128gcm payload must include 86-byte header + encrypted record');
const roundTripPlain = await decryptWebPushAes128GcmForTest(
  ciphertext,
  clientKeyPair.privateKey,
  clientPubBytes,
  clientAuthSecret,
);
assert.equal(roundTripPlain, sampleMessage, 'RFC 8291 aes128gcm round-trip decryption mismatch');

// Tampered ciphertext must fail authentication tag check
const tampered = new Uint8Array(ciphertext);
tampered[tampered.length - 1] ^= 0xff;
await assert.rejects(
  () => decryptWebPushAes128GcmForTest(tampered, clientKeyPair.privateKey, clientPubBytes, clientAuthSecret),
  'Tampered aes128gcm tag must reject',
);

// SSRF guard unit checks
assert.equal(isAllowedPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
assert.equal(isAllowedPushEndpoint('https://web.push.apple.com/Qxyz'), true);
assert.equal(isAllowedPushEndpoint('http://169.254.169.254/latest/meta-data/'), false);
assert.equal(isAllowedPushEndpoint('https://10.0.0.5/push'), false);
assert.equal(isAllowedPushEndpoint('https://localhost/push'), false);
assert.equal(isAllowedPushEndpoint('https://redis.internal/push'), false);

// 2. End-to-End Server + Mock Web Push Receiver Verification
interface CapturedPush {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: Uint8Array;
}
const capturedPushes: CapturedPush[] = [];

const pushReceiver = http.createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on('data', chunk => chunks.push(chunk));
  req.on('end', () => {
    const reqPath = req.url || '/';
    capturedPushes.push({
      path: reqPath,
      headers: req.headers,
      body: new Uint8Array(Buffer.concat(chunks)),
    });
    if (reqPath.includes('dead-gone')) {
      res.writeHead(410, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Subscription expired' }));
      return;
    }
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });
});

await new Promise<void>(resolve => pushReceiver.listen(0, '127.0.0.1', resolve));
const receiverPort = (pushReceiver.address() as { port: number }).port;
const receiverOrigin = `http://127.0.0.1:${receiverPort}`;

const testRoot = path.resolve('data/pwa-push-verification-' + randomUUID());
await fs.mkdir(testRoot, { recursive: true });
const port = 5206;
const base = `http://127.0.0.1:${port}`;
const sessionSecret = randomBytes(48).toString('hex');

async function api(
  method: string,
  route: string,
  body?: unknown,
  cookie = '',
) {
  const res = await fetch(base + route, {
    method,
    headers: {
      Origin: base,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return {
    status: res.status,
    data,
    headers: res.headers,
    cookie: res.headers.get('set-cookie')?.split(';')[0] || '',
  };
}

await fs.cp('migrations', path.join(testRoot, 'migrations'), { recursive: true });
execFileSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/setup.ts')], {
  cwd: testRoot,
  env: {
    ...process.env,
    DATA_DIR: path.join(testRoot, 'database'),
    TSX_TSCONFIG_PATH: path.resolve('tsconfig.json'),
  },
  windowsHide: true,
});
const creds = await fs.readFile(path.join(testRoot, 'SETUP-CREDENTIALS.txt'), 'utf8');
const adminPassword = creds.match(/Password: (.+)/)![1].trim();

const server = spawn(process.execPath, ['dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    DATA_DIR: path.join(testRoot, 'database'),
    SESSION_SECRET: sessionSecret,
    COOKIE_SECURE: 'false',
    ALLOW_LOCAL_PUSH_TEST_ENDPOINT: 'true',
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/api/cafes')).status === 200) {
        up = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(up, 'Production server with 0008 PWA/Push migration did not start');

  // Verify PWA manifest, Service Worker, icons, and CSP headers
  const manifestRes = await api('GET', '/manifest.webmanifest');
  assert.equal(manifestRes.status, 200);
  assert.equal(manifestRes.data.display, 'standalone');
  assert.equal(manifestRes.data.short_name, 'Dingzi');
  assert.equal(manifestRes.data.theme_color, '#6236FF');
  assert.equal(manifestRes.data.background_color, '#17132E');
  assert.ok(manifestRes.headers.get('content-security-policy')?.includes("worker-src 'self'"));
  assert.ok(manifestRes.headers.get('content-security-policy')?.includes("manifest-src 'self'"));
  assert.ok(manifestRes.headers.get('content-security-policy')?.includes("media-src 'self' data: blob:"));

  const swRes = await api('GET', '/sw.js');
  assert.equal(swRes.status, 200);
  assert.ok(String(swRes.data).includes("self.addEventListener('push'"));
  assert.ok(String(swRes.data).includes('requireInteraction: true'));

  for (const iconPath of ['/icon-192.svg', '/icon-512.svg', '/apple-touch-icon.svg']) {
    const iconRes = await api('GET', iconPath);
    assert.equal(iconRes.status, 200, `Missing PWA icon ${iconPath}`);
  }

  const vapidRes = await api('GET', '/api/public/push/vapid-key');
  assert.equal(vapidRes.status, 200);
  assert.equal(base64UrlToBytes(vapidRes.data.publicKey).length, 65);

  // Provision manager & café
  const superLogin = await api('POST', '/api/login', { email: 'admin@pager.local', password: adminPassword });
  assert.equal(superLogin.status, 200);
  const mgrPassword = 'Mgr-' + randomBytes(8).toString('hex');
  const tenant = await api(
    'POST',
    '/api/super-admin/restaurants',
    {
      email: 'mobile@lusail.qa',
      password: mgrPassword,
      firstName: 'Dana',
      lastName: 'Al-Sulaiti',
      restaurantName: 'Lusail Roastery Mobile',
    },
    superLogin.cookie,
  );
  assert.equal(tenant.status, 201);

  const mgrLogin = await api('POST', '/api/login', { email: 'mobile@lusail.qa', password: mgrPassword });
  assert.equal(mgrLogin.status, 200);
  const mgrCookie = mgrLogin.cookie;

  // Issue Pager Ticket A-001
  const issued = await api(
    'POST',
    '/api/hospitality/pagers/issue',
    { mode: 'auto_number', estimatedPrepMins: 4 },
    mgrCookie,
  );
  assert.equal(issued.status, 201);
  const trackingToken = issued.data.ticket.trackingToken as string;
  const pagerId = issued.data.ticket.id as string;

  // Verify SSRF metadata endpoint is rejected even when ALLOW_LOCAL_PUSH_TEST_ENDPOINT=true
  const ssrfAttempt = await api('POST', '/api/public/push/subscribe', {
    scope: `pager:${trackingToken}`,
    subscription: {
      platform: 'web_push',
      endpoint: 'http://169.254.169.254/latest/meta-data/',
      keys: {
        p256dh: bytesToBase64Url(clientPubBytes),
        auth: bytesToBase64Url(clientAuthSecret),
      },
    },
  });
  assert.equal(ssrfAttempt.status, 400, 'Metadata SSRF endpoint must be rejected');

  // Subscribe 1 live guest device + 1 expired (410) guest device
  const liveSub = await api('POST', '/api/public/push/subscribe', {
    scope: `pager:${trackingToken}`,
    subscription: {
      platform: 'web_push',
      endpoint: `${receiverOrigin}/push/guest-live`,
      keys: {
        p256dh: bytesToBase64Url(clientPubBytes),
        auth: bytesToBase64Url(clientAuthSecret),
      },
    },
  });
  assert.equal(liveSub.status, 201);

  const deadSub = await api('POST', '/api/public/push/subscribe', {
    scope: `pager:${trackingToken}`,
    subscription: {
      platform: 'web_push',
      endpoint: `${receiverOrigin}/push/dead-gone`,
      keys: {
        p256dh: bytesToBase64Url(clientPubBytes),
        auth: bytesToBase64Url(clientAuthSecret),
      },
    },
  });
  assert.equal(deadSub.status, 201);

  // Transition Pager A-001 to READY -> triggers high-urgency encrypted Web Push
  const buzz = await api(
    'POST',
    `/api/hospitality/pagers/${pagerId}/transition`,
    { action: 'ready' },
    mgrCookie,
  );
  assert.equal(buzz.status, 200);

  // Wait up to 3s for async deferRequestTask push delivery
  for (let i = 0; i < 30 && capturedPushes.length < 2; i++) {
    await new Promise(r => setTimeout(r, 100));
  }
  assert.equal(capturedPushes.length, 2, 'Expected push dispatch to both active and dead guest subscriptions');

  const guestPush = capturedPushes.find(p => p.path === '/push/guest-live');
  assert.ok(guestPush, 'Guest live endpoint did not receive push');
  assert.equal(guestPush.headers['urgency'], 'high');
  assert.equal(guestPush.headers['content-encoding'], 'aes128gcm');
  assert.equal(guestPush.headers['ttl'], '300');
  assert.ok(String(guestPush.headers['authorization']).startsWith('vapid t='));

  const decryptedGuestJson = JSON.parse(
    await decryptWebPushAes128GcmForTest(
      guestPush.body,
      clientKeyPair.privateKey,
      clientPubBytes,
      clientAuthSecret,
    ),
  );
  assert.equal(decryptedGuestJson.ticketCode, 'A-001');
  assert.equal(decryptedGuestJson.urgent, true);
  assert.equal(decryptedGuestJson.url, `/pager/${trackingToken}`);
  assert.ok(String(decryptedGuestJson.title).includes('A-001'));

  // Confirm 410 subscription was automatically pruned from DB
  for (let i = 0; i < 20; i++) {
    const st = await api('GET', '/api/hospitality/push/status', undefined, mgrCookie);
    if (st.data.guestDevices === 1) break;
    await new Promise(r => setTimeout(r, 100));
  }
  const statusAfterPrune = await api('GET', '/api/hospitality/push/status', undefined, mgrCookie);
  assert.equal(statusAfterPrune.data.guestDevices, 1, 'HTTP 410 dead subscription must be pruned');

  // Subscribe Staff KDS device & trigger staff lock-screen test push
  const staffSub = await api(
    'POST',
    '/api/hospitality/push/subscribe',
    {
      subscription: {
        platform: 'web_push',
        endpoint: `${receiverOrigin}/push/staff-live`,
        keys: {
          p256dh: bytesToBase64Url(clientPubBytes),
          auth: bytesToBase64Url(clientAuthSecret),
        },
      },
    },
    mgrCookie,
  );
  assert.equal(staffSub.status, 201);

  const staffTest = await api('POST', '/api/hospitality/push/test', {}, mgrCookie);
  assert.equal(staffTest.status, 200);
  assert.equal(staffTest.data.delivered, 1);

  const staffPush = capturedPushes.find(p => p.path === '/push/staff-live');
  assert.ok(staffPush, 'Staff endpoint did not receive test push');
  const decryptedStaffJson = JSON.parse(
    await decryptWebPushAes128GcmForTest(
      staffPush.body,
      clientKeyPair.privateKey,
      clientPubBytes,
      clientAuthSecret,
    ),
  );
  assert.equal(decryptedStaffJson.url, '/admin/kds');
  assert.equal(decryptedStaffJson.urgent, true);

  console.log(
    'PASS: Installable PWA assets, Service Worker, RFC 8292 VAPID ES256 JWT, RFC 8291 aes128gcm encryption/decryption, SSRF protection, KDS->Guest Lock-Screen Push, Staff KDS Push, and 410 pruning verified end-to-end.',
  );
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => {
    server.once('exit', resolve);
    setTimeout(resolve, 4000).unref();
  });
  pushReceiver.closeAllConnections?.();
  await new Promise<void>(resolve => pushReceiver.close(() => resolve()));
  await fs.rm(testRoot, { recursive: true, force: true });
}
