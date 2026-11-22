import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const staff = process.env.CAFE_STAFF_URL || process.env.MANAGEMENT_ORIGIN;
const guest = process.env.CAFE_MENU_URL || process.env.PUBLIC_MENU_ORIGIN;
assert.ok(staff && guest && !staff.includes('cafe-menu.workers.dev') && !guest.includes('cafe-menu.workers.dev'), 'Configure isolated CAFE_STAFF_URL and CAFE_MENU_URL.');
const source = JSON.parse(await fs.readFile('fixtures/qstrawberry-menu.json', 'utf8'));
const credentials = await fs.readFile('SETUP-CREDENTIALS.txt', 'utf8');
const email = credentials.match(/Email: (.+)/)?.[1]?.trim();
const password = credentials.match(/Password: (.+)/)?.[1]?.trim();
assert.ok(email && password, 'The private platform manager credential file is required.');
let cookie = '';

async function request(origin, route, method = 'GET', body, options = {}) {
  const response = await fetch(origin + route, {
    method,
    headers: { ...(options.headers || {}), ...(origin === staff && cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: body instanceof Buffer ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  });
  if (route === '/api/login' && response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  if (!response.ok) throw new Error(`${method} ${origin}${route}: HTTP ${response.status} ${await response.text()}`);
  return response.status === 204 ? undefined : response.json();
}

try {
  await request(staff, '/api/login', 'POST', { email, password }, { headers: { 'Content-Type': 'application/json' } });
  assert.ok(cookie.startsWith('__Host-cafe.sid='), 'Expected an authenticated staff session.');
  const cafes = await request(staff, '/api/super-admin/restaurants');
  const cafe = cafes.find(candidate => candidate.name.trim().toLowerCase() === source.cafeName.toLowerCase());
  assert.ok(cafe, 'Qstrawberry café must exist before refreshing its images.');
  assert.equal(cafe.currency, source.currency, 'Qstrawberry currency must match the versioned menu.');
  const items = await request(staff, `/api/super-admin/restaurants/${cafe.id}/menu-items`);
  const planned = source.categories.flatMap(category => category.items.map(([name, price, , , image]) => ({ name, price, image })));
  assert.equal(items.length, planned.length, 'Qstrawberry must contain exactly the versioned menu before refreshing images.');
  assert.deepEqual(new Set(items.map(item => item.name)), new Set(planned.map(item => item.name)), 'Refusing to update an unexpected menu.');
  await fs.mkdir('data', { recursive: true });
  const backupFile = path.join('data', `qstrawberry-image-backup-${Date.now()}.json`);
  await fs.writeFile(backupFile, JSON.stringify({ cafe: { id: cafe.id, name: cafe.name }, images: items.map(({ id, name, imageUrl }) => ({ id, name, imageUrl })) }, null, 2), { mode: 0o600 });
  const uploaded = new Map();
  for (const item of planned) {
    const { uploadURL } = await request(staff, `/api/super-admin/restaurants/${cafe.id}/upload`, 'POST', undefined, { headers: { 'Content-Type': 'application/json' } });
    const bytes = await fs.readFile(path.join('assets', 'qstrawberry-menu-photos', 'items', item.image));
    await request(staff, uploadURL, 'PUT', bytes, { headers: { 'Content-Type': 'image/webp' } });
    uploaded.set(item.name, uploadURL.split('?')[0]);
  }
  for (const item of items) {
    await request(staff, `/api/super-admin/menu-items/${item.id}`, 'PUT', { imageUrl: uploaded.get(item.name) }, { headers: { 'Content-Type': 'application/json' } });
  }
  const publicMenu = await request(guest, `/api/menu/public/${cafe.id}`);
  assert.equal(publicMenu.items.length, planned.length);
  const imageUrls = publicMenu.items.map(item => item.imageUrl);
  assert.equal(new Set(imageUrls).size, planned.length, 'Every customer-menu item must have a unique image.');
  assert.deepEqual(new Set(imageUrls), new Set(uploaded.values()), 'Public menu must use the uploaded individual images.');
  await Promise.all(imageUrls.map(async imageUrl => {
    const response = await fetch(guest + imageUrl, { signal: AbortSignal.timeout(30_000) });
    assert.ok(response.ok, `Image ${imageUrl} must load`);
    assert.ok(response.headers.get('content-type')?.startsWith('image/webp'), `Image ${imageUrl} must be WebP`);
  }));
  console.log(JSON.stringify({ passed: true, cafe: cafe.name, menuUrl: `${guest}/menu/${cafe.id}`, items: planned.length, uniqueLiveImages: new Set(imageUrls).size, backupFile }, null, 2));
} finally {
  if (cookie) await request(staff, '/api/logout', 'POST', {}, { headers: { 'Content-Type': 'application/json' } });
}
