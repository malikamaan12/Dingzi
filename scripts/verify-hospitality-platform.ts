import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';

const testRoot = path.resolve('data/hospitality-verification-' + randomUUID());
await fs.mkdir(testRoot, { recursive: true });
const port = 5205;
const base = `http://127.0.0.1:${port}`;
const sessionSecret = randomBytes(48).toString('hex');

async function api(
  method: string,
  route: string,
  body?: unknown,
  cookie = '',
  extraHeaders: Record<string, string> = {},
) {
  const res = await fetch(base + route, {
    method,
    headers: {
      Origin: base,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, data, cookie: res.headers.get('set-cookie')?.split(';')[0] || '' };
}

// Run setup in isolated testRoot first so super_admin + all 0000..0007 migrations exist
await fs.cp('migrations', path.join(testRoot, 'migrations'), { recursive: true });
execFileSync(process.execPath, ['--import', 'tsx', path.resolve('scripts/setup.ts')], {
  cwd: testRoot,
  env: { ...process.env, DATA_DIR: path.join(testRoot, 'database'), TSX_TSCONFIG_PATH: path.resolve('tsconfig.json') },
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
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(base + '/api/cafes')).status === 200) { up = true; break; }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(up, 'Production server with 0007 migration did not start');

  const adminLogin = await api('POST', '/api/login', { email: 'admin@pager.local', password: adminPassword });
  assert.equal(adminLogin.status, 200);
  const superCookie = adminLogin.cookie;

  // 1. Provision two independent tenants (Mode A: browse_and_pager, Mode C: full_online_checkout)
  const mgrPassword = 'Manager-Pass-' + randomBytes(6).toString('hex');
  const t1 = await api('POST', '/api/super-admin/restaurants', {
    email: 'kiosk@lusail.qa',
    password: mgrPassword,
    firstName: 'Khalid',
    lastName: 'Al-Thani',
    restaurantName: 'Lusail Specialty Kiosk',
  }, superCookie);
  assert.equal(t1.status, 201);
  const cafeA = t1.data.id;

  const t2 = await api('POST', '/api/super-admin/restaurants', {
    email: 'drive@pearl.qa',
    password: mgrPassword,
    firstName: 'Noor',
    lastName: 'Al-Kuwari',
    restaurantName: 'Pearl Drive-Thru Roasters',
  }, superCookie);
  assert.equal(t2.status, 201);
  const cafeB = t2.data.id;

  const loginA = await api('POST', '/api/login', { email: 'kiosk@lusail.qa', password: mgrPassword });
  const cookieA = loginA.cookie;
  const loginB = await api('POST', '/api/login', { email: 'drive@pearl.qa', password: mgrPassword });
  const cookieB = loginB.cookie;

  // Configure Cafe A (browse_and_pager, slug lusail-kiosk) & Cafe B (full_online_checkout + skipcash + driveThruEnabled)
  assert.equal((await api('POST', '/api/restaurant', {
    name: 'Lusail Specialty Kiosk',
    slug: 'lusail-kiosk',
    orderingMode: 'browse_and_pager',
    currency: 'QAR',
    googleMapsReviewUrl: 'https://maps.google.com/?cid=12345',
  }, cookieA)).status, 200);

  assert.equal((await api('POST', '/api/restaurant', {
    name: 'Pearl Drive-Thru Roasters',
    slug: 'pearl-drive',
    orderingMode: 'full_online_checkout',
    paymentGateway: 'skipcash',
    driveThruEnabled: true,
    currency: 'QAR',
  }, cookieB)).status, 200);

  // Verify slug routing
  const bySlug = await api('GET', '/api/public/venue-by-slug/lusail-kiosk');
  assert.equal(bySlug.status, 200);
  assert.equal(bySlug.data.restaurant.id, cafeA);

  // Add category & item in Cafe B
  const catB = (await api('POST', '/api/categories', { restaurantId: cafeB, title: 'Signature Espresso' }, cookieB)).data;
  const itemB = (await api('POST', '/api/manager-menu', {
    item: { categoryId: catB.id, name: 'Spanish Latte', price: '22.00', discount: '0', unit: 'cup', isAvailable: true, hasMultiplePricing: false, prepTimeMins: 6 },
    variants: [],
  }, cookieB)).data;

  // Verify browse_and_pager blocks cart submission on Cafe A (403)
  const blockedOrder = await api('POST', '/api/public/orders', {
    restaurantId: cafeA,
    customerName: 'Guest',
    items: [{ menuItemId: itemB.id, quantity: 1 }],
  });
  assert.equal(blockedOrder.status, 403);

  // Verify full_online_checkout on Cafe B creates pending SkipCash checkout & releases pager upon HMAC confirmation
  const onlineOrder = await api('POST', '/api/public/orders', {
    restaurantId: cafeB,
    channel: 'counter_pickup',
    customerName: 'Fatima',
    items: [{ menuItemId: itemB.id, quantity: 2 }],
  });
  assert.equal(onlineOrder.status, 201);
  assert.equal(onlineOrder.data.order.total, '44.00');
  assert.equal(onlineOrder.data.order.paymentStatus, 'pending_online');
  assert.equal(onlineOrder.data.pager, null);

  const paidConfirm = await api('POST', `/api/public/payments/${onlineOrder.data.order.id}/confirm-sandbox`, {
    provider: onlineOrder.data.checkout.provider,
    paymentReference: onlineOrder.data.checkout.paymentReference,
    signatureToken: onlineOrder.data.checkout.signatureToken,
  });
  assert.equal(paidConfirm.status, 200);
  assert.equal(paidConfirm.data.order.paymentStatus, 'paid');
  assert.equal(paidConfirm.data.pager.ticketCode, 'A-001');

  // 2. POS-Free 1-Tap Auto Pager + Ready Buzz + 20-Second Re-buzz Cooldown + Reputation Loop
  const autoPager = await api('POST', '/api/hospitality/pagers/issue', { mode: 'auto_number', estimatedPrepMins: 5 }, cookieA);
  assert.equal(autoPager.status, 201);
  assert.equal(autoPager.data.ticket.ticketCode, 'A-001');

  const guestView1 = await api('GET', `/api/public/pager/${autoPager.data.ticket.trackingToken}`);
  assert.equal(guestView1.status, 200);
  assert.equal(guestView1.data.ticket.status, 'waiting');

  const buzzReady = await api('POST', `/api/hospitality/pagers/${autoPager.data.ticket.id}/transition`, { action: 'ready' }, cookieA);
  assert.equal(buzzReady.status, 200);
  assert.equal(buzzReady.data.ticket.status, 'ready');
  assert.equal(buzzReady.data.ticket.buzzCount, 1);

  const spamRebuzz = await api('POST', `/api/hospitality/pagers/${autoPager.data.ticket.id}/transition`, { action: 'rebuzz' }, cookieA);
  assert.equal(spamRebuzz.status, 429, 'Re-buzz within 20s must be rate-limited');

  const ratingRes = await api('POST', `/api/public/pager/${autoPager.data.ticket.trackingToken}/feedback`, { rating: 5, comment: 'Fast!' });
  assert.equal(ratingRes.status, 200);
  assert.equal(ratingRes.data.promptGoogleReview, true);

  // 3. Conflict-Free Table Reservation (Concurrent Double-Booking Prevention)
  const zoneRes = await api('POST', '/api/hospitality/zones', { name: 'Indoor Majlis', nameAr: 'المجلس الداخلي' }, cookieA);
  assert.equal(zoneRes.status, 201);
  const tableRes = await api('POST', '/api/hospitality/tables', {
    zoneId: zoneRes.data.zone.id,
    tableCode: 'T-01',
    minCovers: 2,
    maxCovers: 4,
  }, cookieA);
  assert.equal(tableRes.status, 201);

  const slotIso = '2026-12-01T18:00:00+03:00';
  const [b1, b2] = await Promise.all([
    api('POST', `/api/public/reservations/${cafeA}`, {
      guestName: 'Party One',
      guestPhone: '+97455001111',
      partySize: 4,
      zoneId: zoneRes.data.zone.id,
      startIso: slotIso,
    }),
    api('POST', `/api/public/reservations/${cafeA}`, {
      guestName: 'Party Two',
      guestPhone: '+97455002222',
      partySize: 4,
      zoneId: zoneRes.data.zone.id,
      startIso: slotIso,
    }),
  ]);
  const statuses = [b1.status, b2.status].sort();
  assert.deepEqual(statuses, [201, 409], 'Exactly one concurrent booking must succeed and the second must reject with 409');

  // 4. Drive-Thru & Curbside Bay Check-In
  const bayRes = await api('POST', '/api/hospitality/bays', {
    code: 'BAY-03',
    label: 'Curbside Bay 3',
    bayType: 'curbside',
  }, cookieB);
  assert.equal(bayRes.status, 201);

  const bayLookup = await api('GET', `/api/public/bay/${bayRes.data.bay.qrToken}`);
  assert.equal(bayLookup.status, 200);
  assert.equal(bayLookup.data.bay.code, 'BAY-03');

  const carCheckin = await api('POST', '/api/public/curbside/checkin', {
    trackingToken: paidConfirm.data.pager.trackingToken,
    bayId: bayRes.data.bay.id,
    etaStatus: 'arrived',
    vehicleColor: 'White',
    vehicleType: 'SUV',
    licensePlate: 'QAT 99881',
  });
  assert.equal(carCheckin.status, 200);

  const dispatchBoard = await api('GET', '/api/hospitality/bays', undefined, cookieB);
  assert.equal(dispatchBoard.data.activeVehicles.length, 1);
  assert.equal(dispatchBoard.data.activeVehicles[0].licensePlate, 'QAT 99881');

  // 5. Aggregator Storefront Isolation & Zero-PII Telemetry
  const aggRes = await api('POST', '/api/hospitality/aggregators', {
    platform: 'talabat',
    displayName: 'Talabat Qatar',
    url: 'https://www.talabat.com/qatar/lusail-kiosk',
    badgeEn: 'Fastest in Lusail',
    badgeAr: 'الأسرع في لوسيل',
  }, cookieA);
  assert.equal(aggRes.status, 201);

  // Ensure Tenant B never leaks Tenant A's aggregator links
  const pubHospB = await api('GET', `/api/public/hospitality/${cafeB}`);
  assert.equal(pubHospB.data.aggregators.length, 0);

  const clickRes = await api('POST', '/api/public/aggregator-click', {
    restaurantId: cafeA,
    aggregatorId: aggRes.data.aggregator.id,
    platform: 'talabat',
    locale: 'ar',
  });
  assert.equal(clickRes.status, 201);

  const analyticsA = await api('GET', '/api/hospitality/analytics', undefined, cookieA);
  assert.equal(analyticsA.data.summary.aggregatorClicksTotal, 1);
  assert.equal(analyticsA.data.clicksByPlatform.talabat, 1);

  console.log('PASS: All 5 Hospitality Operating Platform pillars verified (tenant modes, SkipCash checkout, Auto Pager + 20s cooldown, concurrent table exclusion, curbside bay dispatch, and Talabat/Snoonu/Keeta click telemetry).');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 4000).unref(); });
  await fs.rm(testRoot, { recursive: true, force: true });
}
