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
    items: [{ menuItemId: itemB.id, quantity: 2, notes: 'Extra hot, oat milk' }],
  });
  assert.equal(onlineOrder.status, 201);
  assert.equal(onlineOrder.data.order.total, '44.00');
  assert.equal(onlineOrder.data.order.lineItems[0].notes, 'Extra hot, oat milk');
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

  const tableQrLookup = await api('GET', `/api/public/table/${tableRes.data.table.qrToken}`);
  assert.equal(tableQrLookup.status, 200);
  assert.equal(tableQrLookup.data.table.tableCode, 'T-01');
  assert.equal(tableQrLookup.data.restaurant.id, cafeA);

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

  // 6. Super-Admin Multi-Branch Portfolio Analytics & Full Hospitality Recovery Backup
  const portfolio = await api('GET', '/api/super-admin/portfolio-analytics', undefined, superCookie);
  assert.equal(portfolio.status, 200);
  assert.ok(portfolio.data.branches.length >= 2, 'Portfolio analytics must include both provisioned branches');

  const fullBackup = await api('GET', '/api/cafe-backup', undefined, cookieA);
  assert.equal(fullBackup.status, 200);
  assert.equal(fullBackup.data.diningZones.length, 1);
  assert.equal(fullBackup.data.diningTables.length, 1);
  assert.equal(fullBackup.data.aggregatorLinks.length, 1);

  // 7. 1-Tap Modifier Option Snooze Verification
  const modOptionId = randomUUID();
  const modGroupId = randomUUID();
  const itemWithMod = await api('POST', '/api/manager-menu', {
    item: {
      categoryId: catB.id,
      name: 'Pistachio Cortado',
      price: '24.00',
      discount: '0',
      unit: 'cup',
      isAvailable: true,
      hasMultiplePricing: false,
      prepTimeMins: 5,
      allergenTags: ['Dairy', 'Nuts'],
      aggregatorOverrides: { talabat: 'https://www.talabat.com/qatar/pearl-drive/pistachio' },
      modifierGroups: [
        {
          id: modGroupId,
          title: 'Milk Choice',
          selection: 'single',
          minSelections: 0,
          maxSelections: 1,
          options: [{ id: modOptionId, label: 'Oat Milk', price: '3.00', isAvailable: true }],
        },
      ],
    },
    variants: [],
  }, cookieB);
  assert.equal(itemWithMod.status, 200);

  const snoozedMod = await api(
    'POST',
    `/api/hospitality/items/${itemWithMod.data.id}/modifiers/${modOptionId}/snooze`,
    { isAvailable: false },
    cookieB,
  );
  assert.equal(snoozedMod.status, 200);
  assert.equal(snoozedMod.data.item.modifierGroups[0].options[0].isAvailable, false);

  // 8. Combinable Multi-Table Allocation + Dynamic Late-Night Operating Hours + Interactive Deposit Checkout
  assert.equal((await api('POST', '/api/restaurant', {
    name: 'Pearl Drive-Thru Roasters',
    slug: 'pearl-drive',
    orderingMode: 'full_online_checkout',
    paymentGateway: 'sadad',
    driveThruEnabled: true,
    reservationsEnabled: true,
    openTime: '14:00',
    closeTime: '01:00',
    reservationDepositAmount: '50.00',
    currency: 'QAR',
  }, cookieB)).status, 200);

  // Save encrypted per-branch Sadad credentials in isolated vault & verify secret is masked and absent from backup
  const savedVault = await api('PUT', '/api/hospitality/payment-config', {
    sadadMerchantId: 'SADAD-PEARL-9876',
    sadadSecret: 'pearl-live-signing-secret-key-2026',
  }, cookieB);
  assert.equal(savedVault.status, 200);
  assert.equal(savedVault.data.hasSadadSecret, true);
  assert.equal(savedVault.data.sadadMerchantMasked, '••••••••9876');
  assert.ok(!JSON.stringify(savedVault.data).includes('pearl-live-signing-secret-key-2026'));
  const backupB = await api('GET', '/api/cafe-backup', undefined, cookieB);
  assert.ok(!JSON.stringify(backupB.data).includes('pearl-live-signing-secret-key-2026'));

  const zoneB = (await api('POST', '/api/hospitality/zones', { name: 'Seafront Terrace', nameAr: 'تراس البحر' }, cookieB)).data.zone;
  await api('POST', '/api/hospitality/tables', {
    zoneId: zoneB.id,
    tableCode: 'P-01',
    minCovers: 2,
    maxCovers: 4,
    isCombinable: true,
  }, cookieB);
  await api('POST', '/api/hospitality/tables', {
    zoneId: zoneB.id,
    tableCode: 'P-02',
    minCovers: 2,
    maxCovers: 4,
    isCombinable: true,
  }, cookieB);

  // Verify late-night operating hours (14:00 -> 01:00) exclude morning 10:00 and include 00:00, with requiresCombination=true for party of 7
  const availCombo = await api('GET', `/api/public/reservations/${cafeB}/availability?date=2026-12-05&partySize=7&zoneId=${zoneB.id}`);
  assert.equal(availCombo.status, 200);
  assert.ok(!availCombo.data.slots.some((s: any) => s.time === '10:00'), '10:00 must be outside 14:00-01:00 operating window');
  const midnightSlot = availCombo.data.slots.find((s: any) => s.time === '00:00');
  assert.ok(midnightSlot, 'Late-night wrap-around 00:00 slot must be available');
  assert.equal(midnightSlot.requiresCombination, true);

  // Book party of 7 -> pairs P-01 + P-02 in pending_deposit state and requires Sadad deposit confirmation
  const comboBook = await api('POST', `/api/public/reservations/${cafeB}`, {
    guestName: 'Al-Mansoori Family',
    guestPhone: '+97455119999',
    partySize: 7,
    zoneId: zoneB.id,
    startIso: midnightSlot.startIso,
  });
  assert.equal(comboBook.status, 201);
  assert.equal(comboBook.data.combinedTables.length, 2);
  assert.equal(comboBook.data.reservation.status, 'pending_deposit');
  assert.equal(comboBook.data.checkout.provider, 'sadad');

  // Neither P-01 nor P-02 can be double-booked during the same window now!
  const overlapSingle = await api('POST', `/api/public/reservations/${cafeB}`, {
    guestName: 'Overlap Attempt',
    guestPhone: '+97455220000',
    partySize: 3,
    zoneId: zoneB.id,
    startIso: midnightSlot.startIso,
  });
  assert.equal(overlapSingle.status, 409, 'Combined table allocation must block overlapping single-table bookings on both paired tables');

  const depositConfirmed = await api('POST', `/api/public/reservations/${comboBook.data.reservation.id}/confirm-deposit`, {
    provider: comboBook.data.checkout.provider,
    paymentReference: comboBook.data.checkout.paymentReference,
    signatureToken: comboBook.data.checkout.signatureToken,
  });
  assert.equal(depositConfirmed.status, 200);
  assert.equal(depositConfirmed.data.reservation.status, 'confirmed');
  assert.equal(depositConfirmed.data.reservation.depositStatus, 'paid');

  // 9. Role Matrix Enforcement (prep_barista & host_cashier) + Counter POS Orders + Multi-Branch Tenant Owner Switching
  const staffPass = 'Staff-Role-' + randomBytes(6).toString('hex');
  const baristaCreate = await api('POST', '/api/hospitality/team', {
    email: 'barista@pearl.qa',
    password: staffPass,
    firstName: 'Omar',
    lastName: 'Barista',
    staffRole: 'prep_barista',
  }, cookieB);
  assert.equal(baristaCreate.status, 201);

  const cashierCreate = await api('POST', '/api/hospitality/team', {
    email: 'cashier@pearl.qa',
    password: staffPass,
    firstName: 'Huda',
    lastName: 'Cashier',
    staffRole: 'host_cashier',
  }, cookieB);
  assert.equal(cashierCreate.status, 201);

  const baristaCookie = (await api('POST', '/api/login', { email: 'barista@pearl.qa', password: staffPass })).cookie;
  const cashierCookie = (await api('POST', '/api/login', { email: 'cashier@pearl.qa', password: staffPass })).cookie;

  // Barista can snooze items & view order/pager queue, but CANNOT modify restaurant profile or payment vault (403)
  assert.equal((await api('GET', '/api/hospitality/pagers', undefined, baristaCookie)).status, 200);
  assert.equal((await api('POST', '/api/restaurant', { name: 'Unauthorized Rename' }, baristaCookie)).status, 403);
  assert.equal((await api('PUT', '/api/hospitality/payment-config', { sadadMerchantId: 'HACK' }, baristaCookie)).status, 403);

  // Cashier can ring up a Counter POS order & settle Pay-at-Venue, but CANNOT delete dining tables (403)
  const posOrder = await api('POST', '/api/hospitality/orders', {
    channel: 'counter_pickup',
    customerName: 'Counter Guest',
    paymentStatus: 'pay_at_venue',
    items: [{ menuItemId: itemB.id, quantity: 1 }],
  }, cashierCookie);
  assert.equal(posOrder.status, 201);
  assert.equal(posOrder.data.order.paymentStatus, 'pay_at_venue');
  assert.ok(posOrder.data.pager.ticketCode);

  const settledPos = await api('POST', `/api/hospitality/orders/${posOrder.data.order.id}/payment-status`, {
    paymentStatus: 'paid',
  }, cashierCookie);
  assert.equal(settledPos.status, 200);
  assert.equal(settledPos.data.order.paymentStatus, 'paid');
  assert.equal((await api('POST', '/api/hospitality/zones', { name: 'Forbidden Zone' }, cashierCookie)).status, 403);

  // Super Admin links Cafe A & Cafe B into a Multi-Branch Tenant Group owned by Cafe A's manager -> Tenant Owner switches branches & views Tenant Analytics
  const userA = (await api('GET', '/api/auth/user', undefined, cookieA)).data;
  const tenantGroup = await api('POST', '/api/super-admin/tenants', {
    name: 'Qatar Specialty Group',
    slug: 'qatar-specialty-group',
    ownerUserId: userA.id,
    restaurantIds: [cafeA, cafeB],
  }, superCookie);
  assert.equal(tenantGroup.status, 201);

  const tenantAnalytics = await api('GET', '/api/hospitality/tenant-analytics', undefined, cookieA);
  assert.equal(tenantAnalytics.status, 200);
  assert.equal(tenantAnalytics.data.branches.length, 2);

  const switchedToB = await api('POST', '/api/hospitality/switch-branch', { restaurantId: cafeB }, cookieA);
  assert.equal(switchedToB.status, 200);
  assert.equal(switchedToB.data.cafeContext.id, cafeB);
  assert.equal(switchedToB.data.staffRole, 'tenant_owner');

  // Shared Menu Library hospitality parity (allergenTags & prepTimeMins copied across branches)
  const pubLib = await api('POST', '/api/menu-library/publish', {
    restaurantId: cafeB,
    itemIds: [itemWithMod.data.id],
  }, cookieA);
  assert.equal(pubLib.status, 200);
  const libList = await api('GET', '/api/menu-library', undefined, cookieA);
  const libTemplate = libList.data.find((x: any) => x.name === 'Pistachio Cortado');
  assert.deepEqual(libTemplate.allergenTags, ['Dairy', 'Nuts']);
  assert.equal(libTemplate.prepTimeMins, 5);

  const impLib = await api('POST', '/api/menu-library/import', {
    restaurantId: cafeA,
    itemIds: [libTemplate.id],
    isAvailable: true,
  }, cookieA);
  assert.equal(impLib.status, 200);
  assert.equal(impLib.data.added, 1);

  console.log('PASS: All Dingzi PRD modules verified end-to-end (Menu Studio, 1-tap snooze, Auto Pager + 20s cooldown, late-night hours, combinable multi-table booking, interactive reservation deposits, encrypted gateway vault, POS orders/receipts, Barista/Cashier RBAC, Multi-Branch Tenant Owner switching/analytics, and Shared Menu Library hospitality parity).');
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 4000).unref(); });
  await fs.rm(testRoot, { recursive: true, force: true });
}
