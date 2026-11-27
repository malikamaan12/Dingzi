import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { publicMenuRequestAllowed } from '../server/publicMenuBoundary';

// 1. Public Worker Boundary must block /api/login/pin on customer menu origin
assert.equal(
  publicMenuRequestAllowed(new Request('https://dingzi-menu.amaanmalik12.workers.dev/api/login/pin', { method: 'POST' })),
  false,
  'Public customer Worker must block POST /api/login/pin',
);

const testRoot = path.resolve('data/rbac-verification-' + randomUUID());
await fs.mkdir(testRoot, { recursive: true });
const port = 5208;
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
  try {
    data = JSON.parse(text);
  } catch {}
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
const superPassword = creds.match(/Password: (.+)/)![1].trim();

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
        up = true;
        break;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  assert.ok(up, 'Production server with migration 0014 did not start');

  const superCookie = (await api('POST', '/api/login', { email: 'admin@pager.local', password: superPassword })).cookie;
  assert.ok(superCookie);

  const pw = 'TenantPass-2026!#';

  // 2. Super-Admin provisions Tenant Alpha (default maxBranches = 1) & Tenant Beta (default maxBranches = 1)
  const alphaCreate = await api(
    'POST',
    '/api/super-admin/restaurants',
    {
      email: 'owner@alpha.qa',
      password: pw,
      firstName: 'Tariq',
      lastName: 'Alpha',
      restaurantName: 'Alpha West Bay',
      tenantName: 'Alpha Hospitality Group',
    },
    superCookie,
  );
  assert.equal(alphaCreate.status, 201);
  assert.ok(alphaCreate.data.tenantId);
  const alphaBranch1Id = alphaCreate.data.id;
  const alphaTenantId = alphaCreate.data.tenantId;

  const betaCreate = await api(
    'POST',
    '/api/super-admin/restaurants',
    {
      email: 'owner@beta.qa',
      password: pw,
      firstName: 'Dana',
      lastName: 'Beta',
      restaurantName: 'Beta Corniche',
      tenantName: 'Beta Roasters',
    },
    superCookie,
  );
  assert.equal(betaCreate.status, 201);
  const betaTenantId = betaCreate.data.tenantId;

  const alphaOwnerCookie = (await api('POST', '/api/login', { email: 'owner@alpha.qa', password: pw })).cookie;
  const betaOwnerCookie = (await api('POST', '/api/login', { email: 'owner@beta.qa', password: pw })).cookie;

  const alphaMe = await api('GET', '/api/auth/user', undefined, alphaOwnerCookie);
  assert.equal(alphaMe.status, 200);
  assert.equal(alphaMe.data.staffRole, 'tenant_owner');
  assert.equal(alphaMe.data.tenantContext.maxBranches, 1);

  // Set slug + dining table + category/item + reusable NFC coaster on Alpha Branch 1
  await api('POST', '/api/restaurant', { name: 'Alpha West Bay', slug: 'alpha-west-bay' }, alphaOwnerCookie);
  const zoneRes = await api('POST', '/api/hospitality/zones', { name: 'Main Hall' }, alphaOwnerCookie);
  assert.equal(zoneRes.status, 201);
  const tableRes = await api(
    'POST',
    '/api/hospitality/tables',
    { zoneId: zoneRes.data.zone.id, tableCode: 'T-01', minCovers: 1, maxCovers: 4 },
    alphaOwnerCookie,
  );
  assert.equal(tableRes.status, 201);
  const catRes = await api('POST', '/api/categories', { title: 'Signature Coffee', restaurantId: alphaBranch1Id }, alphaOwnerCookie);
  assert.equal(catRes.status, 200);
  const itemRes = await api(
    'POST',
    '/api/manager-menu',
    { item: { categoryId: catRes.data.id, name: 'Spanish Latte', price: '22', unit: 'cup' }, variants: [] },
    alphaOwnerCookie,
  );
  assert.equal(itemRes.status, 200);
  const coasterRes = await api('POST', '/api/hospitality/smart-tags/bulk-coasters', { prefix: 'ALPHA', count: 2 }, alphaOwnerCookie);
  assert.equal(coasterRes.status, 201);
  const coasterId = coasterRes.data.tags[0].id;

  // 3. Quota enforcement: Alpha Owner blocked at 1/1 until Super-Admin raises maxBranches to 2
  const blockedBranch = await api('POST', '/api/hospitality/branches', { name: 'Alpha Lusail', slug: 'alpha-lusail' }, alphaOwnerCookie);
  assert.equal(blockedBranch.status, 403);

  const raisedQuota = await api('PATCH', `/api/super-admin/tenants/${alphaTenantId}`, { maxBranches: 2 }, superCookie);
  assert.equal(raisedQuota.status, 200);
  assert.equal(raisedQuota.data.tenant.maxBranches, 2);

  const alphaBranch2 = await api('POST', '/api/hospitality/branches', { name: 'Alpha Lusail', slug: 'alpha-lusail' }, alphaOwnerCookie);
  assert.equal(alphaBranch2.status, 201);
  const alphaBranch2Id = alphaBranch2.data.branch.id;
  assert.notEqual(alphaBranch2Id, alphaBranch1Id);

  // Switch Alpha Owner back to Branch 1 for setup
  await api('POST', '/api/hospitality/switch-branch', { restaurantId: alphaBranch1Id }, alphaOwnerCookie);

  // 4. Cross-Tenant Hijack Protection: Beta Owner CANNOT attach Alpha Owner or Alpha staff to Beta
  const hijackAttempt = await api(
    'POST',
    '/api/hospitality/team',
    {
      email: 'owner@alpha.qa',
      firstName: 'Tariq',
      lastName: 'Alpha',
      staffRole: 'host_cashier',
    },
    betaOwnerCookie,
  );
  assert.equal(hijackAttempt.status, 409, 'Cross-tenant user attachment must be rejected');

  // 5. Provision Pure Receptionist (canManageTables: true, canSettlePos: false) with 6-digit Station PIN across both Alpha branches
  const receptionCreate = await api(
    'POST',
    '/api/hospitality/team',
    {
      email: 'reception@alpha.qa',
      password: pw,
      firstName: 'Noor',
      lastName: 'Reception',
      staffRole: 'host_cashier',
      restaurantIds: [alphaBranch1Id, alphaBranch2Id],
      capabilities: {
        canManageTables: true,
        canSettlePos: false,
        canIssuePagers: true,
        canSnoozeMenu: false,
      },
      stationPin: '482910',
    },
    alphaOwnerCookie,
  );
  assert.equal(receptionCreate.status, 201);
  assert.equal(receptionCreate.data.assignment.hasPin, true);
  const receptionUserId = receptionCreate.data.user.id;

  // Duplicate PIN within same tenant must be rejected (409)
  const dupPin = await api(
    'POST',
    '/api/hospitality/team',
    {
      email: 'prep@alpha.qa',
      password: pw,
      firstName: 'Sami',
      lastName: 'Barista',
      staffRole: 'prep_barista',
      stationPin: '482910',
    },
    alphaOwnerCookie,
  );
  assert.equal(dupPin.status, 409, 'Duplicate 6-digit PIN inside same tenant must be rejected');

  const prepCreate = await api(
    'POST',
    '/api/hospitality/team',
    {
      email: 'prep@alpha.qa',
      password: pw,
      firstName: 'Sami',
      lastName: 'Barista',
      staffRole: 'prep_barista',
      stationPin: '739104',
    },
    alphaOwnerCookie,
  );
  assert.equal(prepCreate.status, 201);

  // 6. Station PIN Sign-In on Branch 1 AND Branch 2 (while wrong venue or wrong PIN fails 401)
  assert.equal((await api('POST', '/api/login/pin', { venueCode: 'alpha-west-bay', pin: '000000' })).status, 401);
  assert.equal((await api('POST', '/api/login/pin', { venueCode: 'Beta Corniche', pin: '482910' })).status, 401);

  const pinLoginB2 = await api('POST', '/api/login/pin', { venueCode: 'alpha-lusail', pin: '482910' });
  assert.equal(pinLoginB2.status, 200);
  assert.equal(pinLoginB2.data.branchId, alphaBranch2Id);

  const pinLoginB1 = await api('POST', '/api/login/pin', { venueCode: 'alpha-west-bay', pin: '482910' });
  assert.equal(pinLoginB1.status, 200);
  const receptionCookie = pinLoginB1.cookie;

  const recAuth = await api('GET', '/api/auth/user', undefined, receptionCookie);
  assert.equal(recAuth.status, 200);
  assert.equal(recAuth.data.staffRole, 'host_cashier');
  assert.equal(recAuth.data.cafeContext.id, alphaBranch1Id);
  assert.equal(recAuth.data.capabilities.canManageTables, true);
  assert.equal(recAuth.data.capabilities.canSettlePos, false);

  // Receptionist succeeds at Waitlist, Phone Reservation, Pager Issuance & NFC Coaster Binding
  const wlEntry = await api(
    'POST',
    '/api/hospitality/waitlist',
    { guestName: 'Walk-In Family', partySize: 4 },
    receptionCookie,
  );
  assert.equal(wlEntry.status, 201);
  assert.equal(
    (await api('POST', `/api/hospitality/waitlist/${wlEntry.data.entry.id}/action`, { action: 'ready' }, receptionCookie)).status,
    200,
  );

  const deskRes = await api(
    'POST',
    '/api/hospitality/reservations',
    {
      guestName: 'VIP Caller',
      partySize: 2,
      startAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    },
    receptionCookie,
  );
  assert.equal(deskRes.status, 201);

  const issuedPager = await api(
    'POST',
    '/api/hospitality/pagers/issue',
    { customerName: 'Coaster Guest', estimatedPrepMins: 8 },
    receptionCookie,
  );
  assert.equal(issuedPager.status, 201);

  const boundCoaster = await api(
    'POST',
    `/api/hospitality/smart-tags/${coasterId}/assign-ticket`,
    { ticketId: issuedPager.data.ticket.id },
    receptionCookie,
  );
  assert.equal(boundCoaster.status, 200);

  // Pure Receptionist (canSettlePos: false) MUST be blocked (403) from Counter POS, Menu Edits, Gateway Vault, and Team Admin
  assert.equal(
    (
      await api(
        'POST',
        '/api/hospitality/orders',
        { customerName: 'Walk-in', channel: 'counter_pickup', items: [{ menuItemId: itemRes.data.id, quantity: 1 }] },
        receptionCookie,
      )
    ).status,
    403,
  );
  assert.equal((await api('POST', '/api/restaurant', { name: 'Hack' }, receptionCookie)).status, 403);
  assert.equal((await api('GET', '/api/hospitality/team', undefined, receptionCookie)).status, 403);
  assert.equal((await api('GET', '/api/hospitality/audit-log', undefined, receptionCookie)).status, 403);

  // 7. Tenant Admin enables canSettlePos on Receptionist -> old session immediately invalidated, new session can ring POS orders!
  const enableCashier = await api(
    'PATCH',
    `/api/hospitality/team/${receptionUserId}`,
    {
      capabilities: { canManageTables: true, canSettlePos: true, canIssuePagers: true, canSnoozeMenu: false },
    },
    alphaOwnerCookie,
  );
  assert.equal(enableCashier.status, 200);
  assert.equal((await api('GET', '/api/auth/user', undefined, receptionCookie)).status, 401, 'Changed permissions must revoke old session');

  const receptionCookie2 = (await api('POST', '/api/login/pin', { venueCode: 'alpha-west-bay', pin: '482910' })).cookie;
  const posCreated = await api(
    'POST',
    '/api/hospitality/orders',
    { customerName: 'Counter Guest', channel: 'counter_pickup', paymentStatus: 'pay_at_venue', items: [{ menuItemId: itemRes.data.id, quantity: 1 }] },
    receptionCookie2,
  );
  assert.equal(posCreated.status, 201);

  // 8. Prep Barista clocks in via PIN 739104 -> transitions & recalls ticket, blocked from POS & Floor
  const prepCookie = (await api('POST', '/api/login/pin', { venueCode: 'alpha-west-bay', pin: '739104' })).cookie;
  assert.equal((await api('GET', '/api/hospitality/floor', undefined, prepCookie)).status, 403);
  assert.equal(
    (await api('POST', `/api/hospitality/pagers/${issuedPager.data.ticket.id}/transition`, { action: 'preparing' }, prepCookie)).status,
    200,
  );
  assert.equal(
    (await api('POST', `/api/hospitality/pagers/${issuedPager.data.ticket.id}/transition`, { action: 'recall' }, prepCookie)).status,
    200,
  );

  // 9. Tenant Admin freezes Receptionist -> active session revoked & PIN/email login blocked
  const frozenRes = await api('PATCH', `/api/hospitality/team/${receptionUserId}`, { accountStatus: 'frozen' }, alphaOwnerCookie);
  assert.equal(frozenRes.status, 200);
  assert.equal((await api('GET', '/api/auth/user', undefined, receptionCookie2)).status, 401);
  assert.equal((await api('POST', '/api/login/pin', { venueCode: 'alpha-west-bay', pin: '482910' })).status, 401);

  // 10. Scoped Tenant Security Audit Log contains Alpha events only (zero Beta leakage)
  const alphaAudit = await api('GET', '/api/hospitality/audit-log', undefined, alphaOwnerCookie);
  assert.equal(alphaAudit.status, 200);
  assert.ok(alphaAudit.data.logs.some((l: any) => l.action === 'POST /api/login/pin'));
  assert.ok(alphaAudit.data.logs.every((l: any) => l.actorEmail !== 'owner@beta.qa'));

  // 11. Super-Admin Tenant Suspension Kill-Switch invalidates Beta Owner sessions & blocks Beta login
  const suspendBeta = await api('PATCH', `/api/super-admin/tenants/${betaTenantId}`, { status: 'suspended' }, superCookie);
  assert.equal(suspendBeta.status, 200);
  assert.equal((await api('GET', '/api/restaurant', undefined, betaOwnerCookie)).status, 401);
  assert.equal((await api('POST', '/api/login', { email: 'owner@beta.qa', password: pw })).status, 403);

  console.log(
    'PASS: Multi-Tenant RBAC verified end-to-end (Tenant quotas, self-service branch creation, cross-tenant attachment block, Reception vs Cashier capability toggles, 6-digit Station PIN login across branches, walk-in waitlist/reservations/coaster binding, session invalidation on permission/freeze updates, scoped tenant audit log, and org suspension kill-switch).',
  );
} finally {
  server.kill('SIGTERM');
  await new Promise(resolve => {
    server.once('exit', resolve);
    setTimeout(resolve, 4000).unref();
  });
  await fs.rm(testRoot, { recursive: true, force: true });
}
