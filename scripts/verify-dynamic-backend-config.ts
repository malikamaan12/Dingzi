import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { publicMenuRequestAllowed } from '../server/publicMenuBoundary';

// 1. Public Worker Boundary must allow GET /api/public/platform-config and block /api/super-admin/platform-settings
assert.equal(
  publicMenuRequestAllowed(new Request('https://dingzi-menu.amaanmalik12.workers.dev/api/public/platform-config')),
  true,
  'Public customer Worker must allow GET /api/public/platform-config',
);
assert.equal(
  publicMenuRequestAllowed(
    new Request('https://dingzi-menu.amaanmalik12.workers.dev/api/super-admin/platform-settings', { method: 'PUT' }),
  ),
  false,
  'Public customer Worker must block PUT /api/super-admin/platform-settings',
);

const testRoot = path.resolve('data/dynamic-config-verification-' + randomUUID());
await fs.mkdir(testRoot, { recursive: true });
const port = 5209;
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
  assert.ok(up, 'Production server with migration 0015 did not start');

  // 2. Verify default platform config before edits
  const defaultPlat = await api('GET', '/api/public/platform-config');
  assert.equal(defaultPlat.status, 200);
  assert.equal(defaultPlat.data.config.defaultNewTenantMaxBranches, 1);
  assert.equal(defaultPlat.data.config.defaultCurrency, 'QAR');

  // Anonymous cannot mutate platform settings
  assert.equal((await api('PUT', '/api/super-admin/platform-settings', { loginHeadline: 'Hacked' })).status, 401);

  // Super-Admin signs in and updates Platform CMS & Provisioning Defaults
  const superLogin = await api('POST', '/api/login', { email: 'admin@pager.local', password: superPassword });
  assert.equal(superLogin.status, 200);
  const superCookie = superLogin.cookie;

  const updatedPlat = await api(
    'PUT',
    '/api/super-admin/platform-settings',
    {
      heroTitleLine1En: 'Order from your table.',
      heroTitleLine1Ar: 'اطلب من طاولتك مباشرة.',
      loginHeadline: 'dingzi Partner Portal',
      defaultNewTenantMaxBranches: 4,
      defaultCurrency: 'KWD',
      defaultTimezone: 'Asia/Kuwait',
      showStaffSignInLinkOnDirectory: false,
    },
    superCookie,
  );
  assert.equal(updatedPlat.status, 200);
  assert.equal(updatedPlat.data.config.defaultNewTenantMaxBranches, 4);
  assert.equal(updatedPlat.data.config.defaultCurrency, 'KWD');

  const publicPlatAfter = await api('GET', '/api/public/platform-config');
  assert.equal(publicPlatAfter.data.config.heroTitleLine1En, 'Order from your table.');
  assert.equal(publicPlatAfter.data.config.heroTitleLine1Ar, 'اطلب من طاولتك مباشرة.');
  assert.equal(publicPlatAfter.data.config.loginHeadline, 'dingzi Partner Portal');
  assert.equal(publicPlatAfter.data.config.showStaffSignInLinkOnDirectory, false);

  // 3. Provision a new Tenant without passing maxBranches/currency/timezone -> inherits Super-Admin defaults!
  const tenantPassword = 'DarCoffee#Admin2026';
  const createdTenant = await api(
    'POST',
    '/api/super-admin/restaurants',
    {
      email: 'owner@darcoffee.kw',
      password: tenantPassword,
      firstName: 'Noura',
      lastName: 'AlSabah',
      restaurantName: 'Dar Roastery',
    },
    superCookie,
  );
  assert.equal(createdTenant.status, 201);
  const cafeId = createdTenant.data.id as string;

  const ownerLogin = await api('POST', '/api/login', { email: 'owner@darcoffee.kw', password: tenantPassword });
  assert.equal(ownerLogin.status, 200);
  const ownerCookie = ownerLogin.cookie;
  const cafeHeaders = { 'X-Cafe-Context': cafeId };

  // Non-super-admin blocked from editing platform settings
  assert.equal((await api('PUT', '/api/super-admin/platform-settings', { loginHeadline: 'No' }, ownerCookie)).status, 403);

  const authMe = await api('GET', '/api/auth/user', undefined, ownerCookie);
  assert.equal(authMe.data.tenantContext.maxBranches, 4, 'New tenant must inherit defaultNewTenantMaxBranches=4');

  const initialCafe = await api('GET', '/api/restaurant', undefined, ownerCookie, cafeHeaders);
  assert.equal(initialCafe.data.currency, 'KWD', 'New branch must inherit defaultCurrency=KWD');
  assert.equal(initialCafe.data.timezone, 'Asia/Kuwait', 'New branch must inherit defaultTimezone=Asia/Kuwait');

  // 4. Configure full bilingual identity + dynamic VenueConfig from Tenant Admin backend
  const savedProfile = await api(
    'POST',
    '/api/restaurant',
    {
      name: 'Dar Roastery',
      nameAr: 'محمصة دار المختصة',
      slug: 'dar-roastery',
      cuisineType: 'Specialty Coffee & Bakery',
      cuisineTypeAr: 'قهوة مختصة ومخبوزات',
      address: 'Sharq, Kuwait City',
      addressAr: 'شرق، مدينة الكويت',
      openingHours: 'Daily · 7 AM – 11 PM',
      openingHoursAr: 'يومياً · 7 ص – 11 م',
      orderingMode: 'cart_pay_at_venue',
      reservationsEnabled: true,
      waitlistEnabled: true,
      driveThruEnabled: true,
      googleMapsReviewUrl: 'https://g.page/r/dar-roastery',
      venueConfig: {
        pagerTicketPrefix: 'DAR',
        waitlistTicketPrefix: 'TBL',
        posOrderPrefix: 'REG',
        defaultPrepMins: 14,
        rebuzzCooldownSecs: 30,
        waitlistHoldMins: 18,
        depositHoldMins: 20,
        maxPartySize: 6,
        reviewPromptMinStars: 5,
        taxPercent: 5,
        taxLabel: 'Municipality Tax',
        taxLabelAr: 'رسوم البلدية',
        serviceChargePercent: 10,
        currencySymbolAr: 'د.ك',
        defaultItemUnit: 'box',
        dietaryTagOptions: ['Wood-Fired', 'Organic'],
        allergenOptions: ['Pistachio', 'Sesame'],
        vehicleColors: ['Pearl White', 'Desert Sand'],
        vehicleTypes: ['Crossover', 'Limousine'],
        menuEyebrow: 'KUWAIT ROASTERY MENU',
        menuEyebrowAr: 'قائمة محمصة الكويت',
        footerTagline: 'Crafted slow in Sharq.',
        footerTaglineAr: 'محمصة بعناية في شرق.',
        wheelEnabled: false,
        wheelMaxItems: 5,
        customTranslations: { 'Wood-Fired': 'مخبوز على الحطب' },
      },
    },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(savedProfile.status, 200, JSON.stringify(savedProfile.data));
  assert.equal(savedProfile.data.nameAr, 'محمصة دار المختصة');
  assert.equal(savedProfile.data.venueConfig.pagerTicketPrefix, 'DAR');

  // Verify public restaurant & public menu bundle parity
  const pubRest = await api('GET', `/api/restaurant/public/${cafeId}`);
  const pubMenu = await api('GET', `/api/menu/public/${cafeId}`);
  assert.deepEqual(pubMenu.data.restaurant, pubRest.data);
  assert.equal(pubRest.data.nameAr, 'محمصة دار المختصة');
  assert.equal(pubRest.data.venueConfig.taxPercent, 5);

  const cafesList = await api('GET', '/api/cafes');
  const darInDirectory = cafesList.data.find((c: any) => c.id === cafeId);
  assert.equal(darInDirectory.nameAr, 'محمصة دار المختصة');
  assert.equal(darInDirectory.cuisineTypeAr, 'قهوة مختصة ومخبوزات');

  // 5. Create Category with titleAr + explicit menuGroup + Menu Item with nameAr, descriptionAr & variant labelAr
  const createdCat = await api(
    'POST',
    '/api/categories',
    {
      restaurantId: cafeId,
      title: 'House Creations',
      titleAr: 'ابتكارات الدار',
      menuGroup: 'sweets',
      isVisible: true,
    },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(createdCat.status, 200);
  assert.equal(createdCat.data.titleAr, 'ابتكارات الدار');
  assert.equal(createdCat.data.menuGroup, 'sweets');

  const createdItem = await api(
    'POST',
    '/api/manager-menu',
    {
      item: {
        categoryId: createdCat.data.id,
        name: 'Saffron Brioche Box',
        nameAr: 'بوكس بريوش بالزعفران',
        description: 'Warm saffron milk brioche',
        descriptionAr: 'بريوش دافئ بالحليب والزعفران',
        price: '20.00',
        discount: '0',
        unit: 'box',
        isAvailable: true,
        hasMultiplePricing: true,
        prepTimeMins: 14,
        tags: ['Wood-Fired'],
        allergenTags: ['Pistachio'],
      },
      variants: [
        { label: 'Regular Box', labelAr: 'بوكس عادي', price: '20.00', discount: '0', unit: 'box' },
        { label: 'Gathering Box', labelAr: 'بوكس جمعات', price: '35.00', discount: '0', unit: 'box' },
      ],
    },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(createdItem.status, 200, JSON.stringify(createdItem.data));
  assert.equal(createdItem.data.nameAr, 'بوكس بريوش بالزعفران');
  assert.equal(createdItem.data.variants[0].labelAr, 'بوكس عادي');

  const pubMenuWithItems = await api('GET', `/api/menu/public/${cafeId}`);
  assert.equal(pubMenuWithItems.data.categories[0].titleAr, 'ابتكارات الدار');
  assert.equal(pubMenuWithItems.data.categories[0].menuGroup, 'sweets');
  assert.equal(pubMenuWithItems.data.items[0].nameAr, 'بوكس بريوش بالزعفران');
  assert.equal(pubMenuWithItems.data.variants[0].labelAr, 'بوكس عادي');

  // 6. Guest Order uses custom vehicleType ('Crossover'), dynamic tax+service (5% + 10% = 15%), and DAR-001 prefix!
  const bayRes = await api(
    'POST',
    '/api/hospitality/bays',
    { code: 'BAY-1', label: 'Sharq Curbside 1', bayType: 'curbside' },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(bayRes.status, 201);

  const guestOrderRes = await api('POST', '/api/public/orders', {
    restaurantId: cafeId,
    channel: 'curbside',
    customerName: 'Fahad',
    bayId: bayRes.data.bay.id,
    vehicleColor: 'Pearl White',
    vehicleType: 'Crossover',
    licensePlate: 'KWT 9001',
    items: [
      {
        menuItemId: createdItem.data.id,
        variantId: createdItem.data.variants[0].id,
        quantity: 2, // 2 x 20.00 = 40.00 subtotal -> +2.00 tax (5%) + 4.00 service (10%) = 46.00 total
      },
    ],
  });
  assert.equal(guestOrderRes.status, 201, JSON.stringify(guestOrderRes.data));
  assert.equal(guestOrderRes.data.order.subtotal, '40.00');
  assert.equal(guestOrderRes.data.order.total, '46.00');
  assert.equal(guestOrderRes.data.order.currency, 'KWD');
  assert.equal(guestOrderRes.data.pager.ticketCode, 'DAR-001');
  assert.equal(guestOrderRes.data.pager.vehicleType, 'Crossover');

  // 7. Staff POS Order uses REG- order prefix, DAR-002 pager prefix, and 15% combined fees!
  const posOrderRes = await api(
    'POST',
    '/api/hospitality/orders',
    {
      channel: 'counter_pickup',
      customerName: 'Walk-in Guest',
      paymentStatus: 'paid',
      items: [{ menuItemId: createdItem.data.id, variantId: createdItem.data.variants[0].id, quantity: 1 }],
    },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(posOrderRes.status, 201, JSON.stringify(posOrderRes.data));
  assert.ok(posOrderRes.data.order.orderNumber.startsWith('REG-'), `Expected REG- prefix, got ${posOrderRes.data.order.orderNumber}`);
  assert.equal(posOrderRes.data.order.subtotal, '20.00');
  assert.equal(posOrderRes.data.order.total, '23.00');
  assert.equal(posOrderRes.data.pager.ticketCode, 'DAR-002');

  // 8. Waitlist enforces maxPartySize (6), issues TBL-001, and uses 18-minute hold timer!
  const overCapWl = await api('POST', `/api/public/waitlist/${cafeId}`, {
    guestName: 'Large Group',
    partySize: 8,
  });
  assert.equal(overCapWl.status, 400);

  const validWl = await api('POST', `/api/public/waitlist/${cafeId}`, {
    guestName: 'Mariam',
    partySize: 4,
  });
  assert.equal(validWl.status, 201);
  assert.equal(validWl.data.entry.ticketCode, 'TBL-001');

  const readyWl = await api(
    'POST',
    `/api/hospitality/waitlist/${validWl.data.entry.id}/action`,
    { action: 'ready' },
    ownerCookie,
    cafeHeaders,
  );
  assert.equal(readyWl.status, 200);
  const holdMinsActual = Math.round(
    (new Date(readyWl.data.entry.holdExpiresAt).getTime() - new Date(readyWl.data.entry.readyAt).getTime()) / 60_000,
  );
  assert.equal(holdMinsActual, 18, 'Waitlist hold duration must match configured waitlistHoldMins=18');

  // 9. Google Review Prompt respects reviewPromptMinStars=5 (4 stars does NOT prompt; 5 stars prompts!)
  const pagerToken = guestOrderRes.data.pager.trackingToken;
  const fourStar = await api('POST', `/api/public/pager/${pagerToken}/feedback`, { rating: 4 });
  assert.equal(fourStar.status, 200);
  assert.equal(fourStar.data.promptGoogleReview, false);

  const fiveStar = await api('POST', `/api/public/pager/${pagerToken}/feedback`, { rating: 5 });
  assert.equal(fiveStar.status, 200);
  assert.equal(fiveStar.data.promptGoogleReview, true);
  assert.equal(fiveStar.data.googleMapsReviewUrl, 'https://g.page/r/dar-roastery');

  console.log('ALL DYNAMIC BACKEND CONFIG & BILINGUAL CMS E2E CHECKS PASSED');
} finally {
  server.kill();
  await new Promise(r => setTimeout(r, 400));
  await fs.rm(testRoot, { recursive: true, force: true }).catch(() => {});
}
