import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { publicMenuRequestAllowed } from '../server/publicMenuBoundary';

// 1. Unit-check Public Worker Boundary allowlist for /tag/:uuid & /api/public/tag/*
const sampleUuid = '11111111-2222-3333-4444-555555555555';
assert.equal(
  publicMenuRequestAllowed(new Request(`https://dingzi-menu.amaanmalik12.workers.dev/tag/${sampleUuid}`)),
  true,
  'Public Worker must allow /tag/:uuid guest entry route',
);
assert.equal(
  publicMenuRequestAllowed(new Request(`https://dingzi-menu.amaanmalik12.workers.dev/api/public/tag/${sampleUuid}?src=nfc`)),
  true,
  'Public Worker must allow GET /api/public/tag/:uuid',
);
assert.equal(
  publicMenuRequestAllowed(
    new Request('https://dingzi-menu.amaanmalik12.workers.dev/api/public/tag/lookup', { method: 'POST' }),
  ),
  true,
  'Public Worker must allow POST /api/public/tag/lookup',
);
assert.equal(
  publicMenuRequestAllowed(new Request('https://dingzi-menu.amaanmalik12.workers.dev/admin/qr-code')),
  false,
  'Public Worker must still block /admin/qr-code',
);

const testRoot = path.resolve('data/qr-nfc-verification-' + randomUUID());
await fs.mkdir(testRoot, { recursive: true });
const port = 5207;
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
  return {
    status: res.status,
    headers: res.headers,
    data,
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
  },
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});

try {
  let up = false;
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + '/api/cafes');
      if (r.status === 200) {
        assert.match(
          r.headers.get('permissions-policy') || '',
          /camera=\(self\)/,
          'Permissions-Policy must allow same-origin camera QR scanning',
        );
        up = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(up, 'Production server with 0011 migration did not start');

  const adminLogin = await api('POST', '/api/login', { email: 'admin@pager.local', password: adminPassword });
  assert.equal(adminLogin.status, 200);
  const superCookie = adminLogin.cookie;

  const mgrPassword = 'Manager-Pass-' + randomBytes(6).toString('hex');
  const t1 = await api('POST', '/api/super-admin/restaurants', {
    email: 'qr@msheireb.qa',
    password: mgrPassword,
    firstName: 'Hamad',
    lastName: 'Al-Marri',
    restaurantName: 'Msheireb Roastery',
  }, superCookie);
  assert.equal(t1.status, 201);
  const cafeA = t1.data.id;

  const t2 = await api('POST', '/api/super-admin/restaurants', {
    email: 'other@katara.qa',
    password: mgrPassword,
    firstName: 'Dana',
    lastName: 'Al-Sulaiti',
    restaurantName: 'Katara Lounge',
  }, superCookie);
  assert.equal(t2.status, 201);

  const cookieA = (await api('POST', '/api/login', { email: 'qr@msheireb.qa', password: mgrPassword })).cookie;
  const cookieB = (await api('POST', '/api/login', { email: 'other@katara.qa', password: mgrPassword })).cookie;

  assert.equal((await api('POST', '/api/restaurant', {
    name: 'Msheireb Roastery',
    slug: 'msheireb-roastery',
    orderingMode: 'cart_pay_at_venue',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: true,
    currency: 'QAR',
  }, cookieA)).status, 200);

  // Create floor zone, table T-01, and curbside bay BAY-01
  const zoneRes = await api('POST', '/api/hospitality/zones', { name: 'Courtyard', order: 0 }, cookieA);
  assert.equal(zoneRes.status, 201);
  const tableRes = await api('POST', '/api/hospitality/tables', {
    zoneId: zoneRes.data.zone.id,
    tableCode: 'T-01',
    minCovers: 1,
    maxCovers: 4,
  }, cookieA);
  assert.equal(tableRes.status, 201);
  const bayRes = await api('POST', '/api/hospitality/bays', {
    code: 'BAY-01',
    label: 'Front Bay 1',
    bayType: 'curbside',
  }, cookieA);
  assert.equal(bayRes.status, 201);

  // 2. Bulk-provision 5 reusable NFC/QR coasters + 1 dynamic table sticker
  const bulkRes = await api('POST', '/api/hospitality/smart-tags/bulk-coasters', {
    prefix: 'COASTER',
    count: 5,
  }, cookieA);
  assert.equal(bulkRes.status, 201);
  assert.equal(bulkRes.data.tags.length, 5);
  const coaster1 = bulkRes.data.tags[0];
  assert.equal(coaster1.tagCode, 'COASTER-01');
  assert.equal(coaster1.targetType, 'reusable_pager');

  const tableTagRes = await api('POST', '/api/hospitality/smart-tags', {
    tagCode: 'NFC-T01',
    label: 'Courtyard Table 1 NFC Plaque',
    hardwareKind: 'dual_qr_nfc',
    targetType: 'dining_table',
    tableId: tableRes.data.table.id,
  }, cookieA);
  assert.equal(tableTagRes.status, 201);
  const tableTag = tableTagRes.data.tag;

  // 3. Verify QR scan vs NFC tap vs background poll telemetry + dynamic cloud retargeting
  const qrResolve = await api('GET', `/api/public/tag/${tableTag.token}?src=qr`);
  assert.equal(qrResolve.status, 200);
  assert.equal(qrResolve.data.destination, `/menu/${cafeA}?table=T-01`);
  assert.equal(qrResolve.data.tag.qrScans, 1);
  assert.equal(qrResolve.data.tag.nfcTaps, 0);

  const nfcResolve = await api('GET', `/api/public/tag/${tableTag.token}?src=nfc`);
  assert.equal(nfcResolve.status, 200);
  assert.equal(nfcResolve.data.tag.qrScans, 1);
  assert.equal(nfcResolve.data.tag.nfcTaps, 1);

  const pollResolve = await api('GET', `/api/public/tag/${tableTag.token}?src=poll`);
  assert.equal(pollResolve.status, 200);
  assert.equal(pollResolve.data.tag.qrScans, 1);
  assert.equal(pollResolve.data.tag.nfcTaps, 1);

  // Retarget physical sticker NFC-T01 from Table -> Curbside Bay -> Waitlist without changing token!
  const retargetBay = await api('PUT', `/api/hospitality/smart-tags/${tableTag.id}`, {
    targetType: 'curbside_bay',
    bayId: bayRes.data.bay.id,
  }, cookieA);
  assert.equal(retargetBay.status, 200);
  assert.equal(retargetBay.data.tag.token, tableTag.token);
  const bayResolved = await api('GET', `/api/public/tag/${tableTag.token}?src=nfc`);
  assert.equal(bayResolved.data.destination, `/menu/${cafeA}?bay=${bayRes.data.bay.id}`);

  // 4. Verify Reusable NFC/QR Coaster Lifecycle (Idle -> Issue Bound -> Active Pager -> Collected Auto-Release -> Rebind)
  const idleCheck = await api('GET', `/api/public/tag/${coaster1.token}?src=nfc`);
  assert.equal(idleCheck.status, 200);
  assert.equal(idleCheck.data.coasterStatus, 'idle');
  assert.equal(idleCheck.data.destination, null);

  const idleLookup = await api('POST', '/api/public/pager/lookup', {
    restaurantId: cafeA,
    ticketCode: 'coaster-01',
  });
  assert.equal(idleLookup.status, 200);
  assert.equal(idleLookup.data.status, 'idle');
  assert.equal(idleLookup.data.coasterToken, coaster1.token);

  // Issue Auto Pager bound directly to COASTER-01
  const issue1 = await api('POST', '/api/hospitality/pagers/issue', {
    mode: 'auto_number',
    customerName: 'Guest One',
    estimatedPrepMins: 6,
    smartTagId: coaster1.id,
  }, cookieA);
  assert.equal(issue1.status, 201);
  assert.equal(issue1.data.coaster.id, coaster1.id);
  const ticket1 = issue1.data.ticket;

  // Tapping COASTER-01 now routes directly to Guest One's virtual pager!
  const boundCheck = await api('GET', `/api/public/tag/${coaster1.token}?src=nfc`);
  assert.equal(boundCheck.status, 200);
  assert.equal(boundCheck.data.coasterStatus, 'assigned');
  assert.equal(boundCheck.data.destination, `/pager/${ticket1.trackingToken}`);

  const activeLookup = await api('POST', '/api/public/pager/lookup', {
    restaurantId: cafeA,
    ticketCode: 'COASTER-01',
  });
  assert.equal(activeLookup.status, 200);
  assert.equal(activeLookup.data.trackingToken, ticket1.trackingToken);

  // Marking ticket1 Collected automatically frees COASTER-01 for the next customer!
  const collect1 = await api('POST', `/api/hospitality/pagers/${ticket1.id}/transition`, {
    action: 'collected',
  }, cookieA);
  assert.equal(collect1.status, 200);

  const releasedCheck = await api('GET', `/api/public/tag/${coaster1.token}?src=poll`);
  assert.equal(releasedCheck.status, 200);
  assert.equal(releasedCheck.data.coasterStatus, 'idle');
  assert.equal(releasedCheck.data.destination, null);

  // Issue ticket2 and bind via /assign-ticket
  const issue2 = await api('POST', '/api/hospitality/pagers/issue', {
    mode: 'pos_invoice',
    invoiceNumber: 'INV-9001',
    customerName: 'Guest Two',
  }, cookieA);
  assert.equal(issue2.status, 201);
  const ticket2 = issue2.data.ticket;

  const manualBind = await api('POST', `/api/hospitality/smart-tags/${coaster1.id}/assign-ticket`, {
    ticketId: ticket2.id,
  }, cookieA);
  assert.equal(manualBind.status, 200);

  const boundCheck2 = await api('GET', `/api/public/tag/${coaster1.token}?src=nfc`);
  assert.equal(boundCheck2.data.destination, `/pager/${ticket2.trackingToken}`);

  // 5. Verify Token Rotation invalidates old token immediately
  const rotateRes = await api('PUT', `/api/hospitality/smart-tags/${tableTag.id}`, {
    rotateToken: true,
  }, cookieA);
  assert.equal(rotateRes.status, 200);
  const newToken = rotateRes.data.tag.token;
  assert.notEqual(newToken, tableTag.token);
  assert.equal((await api('GET', `/api/public/tag/${tableTag.token}`)).status, 404);
  assert.equal((await api('GET', `/api/public/tag/${newToken}`)).status, 200);

  // 6. Verify Cross-Tenant Isolation (Cafe B cannot mutate or delete Cafe A smart tags)
  assert.equal(
    (await api('PUT', `/api/hospitality/smart-tags/${coaster1.id}`, { label: 'Hijack' }, cookieB)).status,
    404,
  );
  assert.equal(
    (await api('POST', `/api/hospitality/smart-tags/${coaster1.id}/assign-ticket`, { ticketId: null }, cookieB)).status,
    404,
  );
  assert.equal(
    (await api('DELETE', `/api/hospitality/smart-tags/${coaster1.id}`, undefined, cookieB)).status,
    404,
  );

  console.log('PASS: QR & NFC Smart Tags, Reusable Coaster Lifecycle, Token Rotation & Cross-Tenant Isolation verified!');
} finally {
  server.kill();
  await new Promise(r => setTimeout(r, 300));
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
}
