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
  assert.ok(cafe, 'Qstrawberry café must exist before menu import.');
  assert.equal(cafe.currency, source.currency, 'Qstrawberry currency must be SAR.');
  const current = await request(staff, `/api/super-admin/restaurants/${cafe.id}/menu-items`);
  const wanted = source.categories.flatMap(category => category.items.map(([name]) => name));
  const existingNames = new Set(current.map(item => item.name));
  const unexpected = current.filter(item => !wanted.includes(item.name));
  assert.equal(unexpected.length, 0, 'Refusing to modify a Qstrawberry menu containing unrecognised items.');
  if (current.length && current.length !== wanted.length) throw new Error('Qstrawberry already has a partial requested menu; resolve it in the dashboard before rerunning.');

  const uploaded = new Map();
  if (!current.length) {
    const categories = await request(staff, `/api/super-admin/restaurants/${cafe.id}/categories`);
    const categoriesByTitle = new Map(categories.map(category => [category.title, category]));
    for (const [order, category] of source.categories.entries()) {
      if (!categoriesByTitle.has(category.title)) {
        categoriesByTitle.set(category.title, await request(staff, `/api/super-admin/restaurants/${cafe.id}/categories`, 'POST', { title: category.title, order }, { headers: { 'Content-Type': 'application/json' } }));
      }
    }
    for (const category of source.categories) for (const [, , , , imageName] of category.items) {
      if (uploaded.has(imageName)) continue;
      const { uploadURL } = await request(staff, `/api/super-admin/restaurants/${cafe.id}/upload`, 'POST', undefined, { headers: { 'Content-Type': 'application/json' } });
      const bytes = await fs.readFile(path.join('assets', 'qstrawberry-menu-photos', 'items', imageName));
      await request(staff, uploadURL, 'PUT', bytes, { headers: { 'Content-Type': 'image/webp' } });
      uploaded.set(imageName, uploadURL.split('?')[0]);
    }
    for (const [categoryOrder, category] of source.categories.entries()) {
      const categoryId = categoriesByTitle.get(category.title).id;
      for (const [order, [name, price, description, tags, imageName]] of category.items.entries()) {
        await request(staff, `/api/super-admin/restaurants/${cafe.id}/menu-items`, 'POST', {
          categoryId, name, price: String(price), description, tags, imageUrl: uploaded.get(imageName), isAvailable: true,
          discount: '0', unit: 'serving', hasMultiplePricing: false, modifierGroups: [], specialDate: null, order: categoryOrder * 100 + order,
        }, { headers: { 'Content-Type': 'application/json' } });
      }
    }
  }
  const publicMenu = await request(guest, `/api/menu/public/${cafe.id}`);
  assert.equal(publicMenu.restaurant.name, source.cafeName);
  assert.equal(publicMenu.restaurant.currency, source.currency);
  assert.equal(publicMenu.items.length, wanted.length);
  assert.deepEqual(new Set(publicMenu.items.map(item => item.name)), new Set(wanted));
  for (const [, category] of source.categories.entries()) for (const [name, price] of category.items) {
    assert.equal(Number(publicMenu.items.find(item => item.name === name)?.price), price, `${name} must retain its requested price`);
  }
  assert.ok(publicMenu.items.every(item => item.isAvailable && item.imageUrl), 'Every imported item must be visible and have a photo.');
  assert.equal(new Set(publicMenu.items.map(item => item.imageUrl)).size, wanted.length, 'Every customer-menu item must have a unique image.');
  console.log(JSON.stringify({ passed: true, cafeId: cafe.id, cafe: cafe.name, menuUrl: `${guest}/menu/${cafe.id}`, categories: publicMenu.categories.length, items: publicMenu.items.length, images: uploaded.size }, null, 2));
} finally {
  if (cookie) await request(staff, '/api/logout', 'POST', {}, { headers: { 'Content-Type': 'application/json' } });
}
