import assert from 'node:assert/strict';
import fs from 'node:fs';
import { config } from 'dotenv';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);

const guestOrigin = process.env.PUBLIC_MENU_ORIGIN;
const staffOrigin = process.env.MANAGEMENT_ORIGIN;
assert.ok(guestOrigin && staffOrigin);

const creds = fs.readFileSync('CLOUD-ADMIN-CREDENTIALS.txt', 'utf8');
const urbanMatch = creds.match(/urban@dingzi\.app\s*\/\s*(\S+)/);
assert.ok(urbanMatch, 'Expected seeded urban@dingzi.app credentials in CLOUD-ADMIN-CREDENTIALS.txt');
const urbanPassword = urbanMatch[1];

console.log('1/5 Verifying public guest venues, menus, and edge-streamed WebP photos...');
const cafesRes = await fetch(`${guestOrigin}/api/cafes`);
assert.equal(cafesRes.status, 200);
const cafes = await cafesRes.json();
assert.ok(cafes.length >= 2, 'Expected Urban Café and Qstrawberry on public guest Worker');

const urbanSlugRes = await fetch(`${guestOrigin}/api/public/venue-by-slug/urban-cafe`);
assert.equal(urbanSlugRes.status, 200);
const urbanId = (await urbanSlugRes.json()).restaurant.id;

const menuRes = await fetch(`${guestOrigin}/api/menu/public/${urbanId}`);
assert.equal(menuRes.status, 200);
const menuData = await menuRes.json();
assert.equal(menuData.items.length, 70, 'Expected all 70 Urban Café menu items');
assert.ok(menuData.items[0].imageUrl?.startsWith('/objects/'), 'Expected private media object URL');

const photoRes = await fetch(`${guestOrigin}${menuData.items[0].imageUrl}`);
assert.equal(photoRes.status, 200);
assert.equal(photoRes.headers.get('content-type'), 'image/webp');
const photoBytes = Buffer.from(await photoRes.arrayBuffer());
assert.equal(photoBytes.toString('ascii', 0, 4), 'RIFF');

console.log('2/5 Verifying split-origin security boundary on dingzi-menu...');
for (const blockedPath of ['/login', '/admin', '/admin/pagers', '/super-admin', '/api/auth/user']) {
  const r = await fetch(`${guestOrigin}${blockedPath}`);
  assert.equal(r.status, 404, `Public guest origin must block ${blockedPath}`);
}

console.log('3/5 Authenticating on dingzi-staff & issuing live Virtual Pager...');
const loginRes = await fetch(`${staffOrigin}/api/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: staffOrigin },
  body: JSON.stringify({ email: 'urban@dingzi.app', password: urbanPassword }),
});
assert.equal(loginRes.status, 200);
const staffCookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
assert.ok(staffCookie.startsWith('__Host-cafe.sid='));

const issueRes = await fetch(`${staffOrigin}/api/hospitality/pagers/issue`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: staffOrigin,
    Cookie: staffCookie,
    'X-Cafe-Context': urbanId,
  },
  body: JSON.stringify({ mode: 'auto_number', customerName: 'Cloud WS Test', estimatedPrepMins: 5 }),
});
assert.equal(issueRes.status, 201);
const issuedTicket = (await issueRes.json()).ticket;

console.log('4/6 Verifying Cross-Worker WebSocket Hibernation (dingzi-menu guest WS <- dingzi-staff Ready buzz)...');
const wsUrl = `${guestOrigin.replace(/^https:/, 'wss:')}/api/ws/public/${urbanId}?scope=${encodeURIComponent(`pager:${issuedTicket.trackingToken}`)}`;
const wsReceived = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Timed out waiting for cross-Worker BranchRealtimeDO WebSocket event')), 12_000);
  const ws = new WebSocket(wsUrl);
  ws.onmessage = async event => {
    const msg = JSON.parse(String(event.data));
    if (msg.type === 'connected') {
      // Once guest socket is connected to dingzi-menu -> BranchRealtimeDO, buzz Ready from dingzi-staff!
      const buzzRes = await fetch(`${staffOrigin}/api/hospitality/pagers/${issuedTicket.id}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: staffOrigin,
          Cookie: staffCookie,
          'X-Cafe-Context': urbanId,
        },
        body: JSON.stringify({ action: 'ready' }),
      });
      if (buzzRes.status !== 200) {
        clearTimeout(timer);
        ws.close();
        reject(new Error(`Buzz transition failed with HTTP ${buzzRes.status}`));
      }
    } else if (msg.type === 'pager.buzzed') {
      clearTimeout(timer);
      ws.close();
      resolve(msg);
    }
  };
  ws.onerror = err => {
    clearTimeout(timer);
    reject(err);
  };
});
assert.equal(wsReceived.type, 'pager.buzzed');
assert.equal(wsReceived.data.ticket.status, 'ready');

// Clean up test ticket to collected state
await fetch(`${staffOrigin}/api/hospitality/pagers/${issuedTicket.id}/transition`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Origin: staffOrigin,
    Cookie: staffCookie,
    'X-Cafe-Context': urbanId,
  },
  body: JSON.stringify({ action: 'collected' }),
});

console.log('5/6 Verifying Multi-Branch Tenant Analytics on dingzi-staff...');
const tenantRes = await fetch(`${staffOrigin}/api/hospitality/tenant-analytics`, {
  headers: { Cookie: staffCookie },
});
assert.equal(tenantRes.status, 200);
const tenantData = await tenantRes.json();
assert.equal(tenantData.branches.length, 2, 'Tenant Owner must see both Urban Café and Qstrawberry');

console.log('6/6 Verifying QR & NFC Smart Tags + Reusable Coaster Lifecycle across dingzi-staff & dingzi-menu...');
const tagsRes = await fetch(`${staffOrigin}/api/hospitality/smart-tags`, {
  headers: { Cookie: staffCookie, 'X-Cafe-Context': urbanId },
});
assert.equal(tagsRes.status, 200);
const tagsData = await tagsRes.json();
const coaster1 = tagsData.tags.find(t => t.tagCode === 'COASTER-01');
assert.ok(coaster1, 'Expected COASTER-01 on Urban Café');

const tagHtmlRes = await fetch(`${guestOrigin}/tag/${coaster1.token}`);
assert.equal(tagHtmlRes.status, 200, 'Public guest Worker must serve /tag/:token');
assert.match(tagHtmlRes.headers.get('permissions-policy') || '', /camera=\(self\)/);

const coasterNfcIdle = await fetch(`${guestOrigin}/api/public/tag/${coaster1.token}?src=nfc`);
assert.equal(coasterNfcIdle.status, 200);
const coasterIdleJson = await coasterNfcIdle.json();
assert.equal(coasterIdleJson.coasterStatus, 'idle');

console.log('PASS: Live Cloudflare + Hyperdrive + Supabase Storage + QR/NFC Smart Coasters + Cross-Worker WebSockets verified end-to-end!');
