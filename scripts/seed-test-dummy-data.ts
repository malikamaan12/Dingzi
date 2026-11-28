import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  DEFAULT_AGGREGATORS,
  buildQstrawberryProfile,
  buildSaffronMajlisProfile,
  buildStaffPortfolio,
  buildUrbanLusailProfile,
  buildWestBayProfile,
  formatCredentialsSummary,
  type StaffMemberSeedSpec,
} from './seed-test-dummy-fixtures';

const isCloud = !process.argv.includes('--local');
const SHARED_TEST_PASSWORD = process.env.DINGZI_DEMO_PASSWORD || 'DingziTest#2026';

async function resolveSuperCredentials() {
  if (isCloud) {
    const text = await fs.readFile('CLOUD-ADMIN-CREDENTIALS.txt', 'utf8');
    const email = text.match(/Email:\s*(.+)/)?.[1]?.trim() || 'admin@dingzi.app';
    const password = text.match(/Password:\s*(.+)/)?.[1]?.trim();
    assert.ok(password, 'Missing Password in CLOUD-ADMIN-CREDENTIALS.txt');
    return {
      staffBase: 'https://dingzi-staff.amaanmalik12.workers.dev',
      guestBase: 'https://dingzi-menu.amaanmalik12.workers.dev',
      email,
      password,
    };
  }
  const text = await fs.readFile('SETUP-CREDENTIALS.txt', 'utf8');
  const email = text.match(/Email:\s*(.+)/)?.[1]?.trim() || 'admin@pager.local';
  const password = text.match(/Password:\s*(.+)/)?.[1]?.trim();
  assert.ok(password, 'Missing Password in SETUP-CREDENTIALS.txt');
  return {
    staffBase: 'http://127.0.0.1:5200',
    guestBase: 'http://127.0.0.1:5200',
    email,
    password,
  };
}

const target = await resolveSuperCredentials();

class ApiSession {
  cookie = '';
  constructor(private readonly origin: string) {}

  async req(
    method: string,
    route: string,
    body?: unknown,
    cafeContextId?: string,
  ): Promise<{ status: number; data: any }> {
    const res = await fetch(this.origin + route, {
      method,
      headers: {
        Origin: this.origin,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(cafeContextId ? { 'X-Cafe-Context': cafeContextId } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie.split(';')[0] || this.cookie;
    }
    const raw = await res.text();
    let data: any = raw;
    try {
      data = JSON.parse(raw);
    } catch {}
    return { status: res.status, data };
  }
}

const superApi = new ApiSession(target.staffBase);
const guestApi = new ApiSession(target.guestBase);

console.log(`1/7 Signing in as Super-Admin on ${target.staffBase}...`);
const loginRes = await superApi.req('POST', '/api/login', {
  email: target.email,
  password: target.password,
});
assert.equal(loginRes.status, 200, `Super-admin login failed: ${JSON.stringify(loginRes.data)}`);

const existingUsers: any[] = (await superApi.req('GET', '/api/super-admin/users')).data;
const testSuperAdminEmail = 'superadmin@dingzi.test';
const existingTestSuper = existingUsers.find(u => u.email.toLowerCase() === testSuperAdminEmail);
if (!existingTestSuper) {
  const createdSuper = await superApi.req('POST', '/api/super-admin/users', {
    email: testSuperAdminEmail,
    password: SHARED_TEST_PASSWORD,
    firstName: 'Amaan',
    lastName: 'Platform Admin',
    role: 'super_admin',
  });
  assert.equal(createdSuper.status, 201, JSON.stringify(createdSuper.data));
} else {
  await superApi.req('PUT', `/api/super-admin/users/${existingTestSuper.id}`, {
    password: SHARED_TEST_PASSWORD,
  });
}

let allCafes: any[] = (await superApi.req('GET', '/api/super-admin/restaurants')).data;
let allTenants: any[] = (await superApi.req('GET', '/api/super-admin/tenants')).data.tenants;

const urbanCafe = allCafes.find(c => c.slug === 'urban-cafe' || c.name === 'Urban Café');
const qCafe = allCafes.find(c => c.slug === 'qstrawberry' || c.name === 'Qstrawberry');
assert.ok(urbanCafe && qCafe, 'Expected Urban Café and Qstrawberry base venues to exist');

console.log('2/7 Configuring Tenant Organizations & Branch Quotas...');
let urbanTenant = allTenants.find(
  t => t.slug === 'dingzi-qatar-group' || t.branches?.some((b: any) => b.id === urbanCafe.id),
);
if (!urbanTenant) {
  const createdT1 = await superApi.req('POST', '/api/super-admin/tenants', {
    name: 'Dingzi Qatar Hospitality Group',
    slug: 'dingzi-qatar-group',
    ownerUserId: urbanCafe.userId,
    maxBranches: 5,
    restaurantIds: [urbanCafe.id],
  });
  assert.equal(createdT1.status, 201, JSON.stringify(createdT1.data));
  urbanTenant = createdT1.data.tenant;
} else {
  await superApi.req('PATCH', `/api/super-admin/tenants/${urbanTenant.id}`, {
    name: 'Dingzi Qatar Hospitality Group',
    slug: 'dingzi-qatar-group',
    maxBranches: 5,
    status: 'active',
  });
  await superApi.req('PUT', `/api/super-admin/restaurants/${urbanCafe.id}/tenant`, {
    tenantId: urbanTenant.id,
  });
}

let qTenant = allTenants.find(t => t.slug === 'qstrawberry-group');
if (!qTenant) {
  const createdT2 = await superApi.req('POST', '/api/super-admin/tenants', {
    name: 'Qstrawberry Artisanal Group',
    slug: 'qstrawberry-group',
    ownerUserId: qCafe.userId,
    maxBranches: 3,
    restaurantIds: [qCafe.id],
  });
  assert.equal(createdT2.status, 201, JSON.stringify(createdT2.data));
  qTenant = createdT2.data.tenant;
} else {
  await superApi.req('PATCH', `/api/super-admin/tenants/${qTenant.id}`, {
    name: 'Qstrawberry Artisanal Group',
    slug: 'qstrawberry-group',
    maxBranches: 3,
    status: 'active',
  });
  await superApi.req('PUT', `/api/super-admin/restaurants/${qCafe.id}/tenant`, {
    tenantId: qTenant.id,
  });
}

let majlisCafe = allCafes.find(c => c.slug === 'saffron-majlis' || c.name.includes('Saffron Majlis'));
if (!majlisCafe) {
  const createdMajlis = await superApi.req('POST', '/api/super-admin/restaurants', {
    email: 'owner@saffronmajlis.test',
    password: SHARED_TEST_PASSWORD,
    firstName: 'Nasser',
    lastName: 'Al-Thani',
    restaurantName: 'Saffron Majlis · Msheireb',
    tenantName: 'Majlis Roastery Group',
    maxBranches: 2,
  });
  assert.equal(createdMajlis.status, 201, JSON.stringify(createdMajlis.data));
  allCafes = (await superApi.req('GET', '/api/super-admin/restaurants')).data;
  majlisCafe = allCafes.find(c => c.id === createdMajlis.data.id);
}
allTenants = (await superApi.req('GET', '/api/super-admin/tenants')).data.tenants;
const majlisTenant = allTenants.find(t => t.id === majlisCafe.tenantId);
if (majlisTenant && !majlisTenant.slug) {
  await superApi.req('PATCH', `/api/super-admin/tenants/${majlisTenant.id}`, {
    slug: 'majlis-roastery-group',
    maxBranches: 2,
  });
}

console.log('3/7 Enriching bilingual profiles, logos, VenueConfig rules & Global Menu Library...');

async function enterWorkspace(cafeId: string) {
  const r = await superApi.req('POST', '/api/super-admin/cafe-access', { restaurantId: cafeId });
  assert.equal(r.status, 200, `Failed to open workspace ${cafeId}: ${JSON.stringify(r.data)}`);
}

await enterWorkspace(urbanCafe.id);
const urbanMenuData = (await superApi.req('GET', '/api/manager-menu', undefined, urbanCafe.id)).data;
const urbanItems: any[] = urbanMenuData.items || [];
const urbanVariants: any[] = urbanMenuData.variants || [];
await superApi.req(
  'POST',
  '/api/restaurant',
  buildUrbanLusailProfile(urbanMenuData.restaurant, urbanItems.find(i => i.imageUrl)?.imageUrl),
  urbanCafe.id,
);

const todayQatar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Qatar',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const margherita = urbanItems.find(i => /marg/i.test(i.name)) || urbanItems[0];
const pistachioLatte = urbanItems.find(i => /pistachio latte/i.test(i.name)) || urbanItems[1];
const spanishLatte = urbanItems.find(i => /^spanish latte$/i.test(i.name)) || urbanItems[2];
const soldOutSample = urbanItems.find(i => i.id !== margherita?.id && i.id !== spanishLatte?.id && !i.isAvailable)
  || urbanItems[urbanItems.length - 1];

if (soldOutSample && soldOutSample.isAvailable) {
  await superApi.req('PUT', `/api/menu-items/${soldOutSample.id}`, { isAvailable: false }, urbanCafe.id);
}

if (margherita && margherita.specialDate !== todayQatar) {
  await superApi.req(
    'POST',
    '/api/manager-menu',
    {
      id: margherita.id,
      item: {
        categoryId: margherita.categoryId,
        name: margherita.name,
        nameAr: margherita.nameAr || 'مارغريتا على الحطب',
        description: 'San Marzano tomato sauce, fresh fior di latte mozzarella & sweet basil.',
        descriptionAr: 'صلصة طماطم سان مارزانو، موزاريلا طازجة وريحان.',
        price: margherita.price,
        discount: '10',
        unit: margherita.unit,
        imageUrl: margherita.imageUrl,
        isAvailable: true,
        specialDate: todayQatar,
        hasMultiplePricing: false,
        prepTimeMins: 12,
        tags: ['Bestseller', 'Wood-Fired', 'Vegetarian'],
        allergenTags: ['Gluten', 'Dairy'],
        modifierGroups: [
          {
            id: randomUUID(),
            title: 'Crust & Extra Toppings',
            titleAr: 'العجينة والإضافات',
            selection: 'multiple',
            minSelections: 0,
            maxSelections: 2,
            options: [
              { id: randomUUID(), label: 'Extra Burrata', labelAr: 'بوراتا إضافية', price: '6.00', isAvailable: true },
              { id: randomUUID(), label: 'Chili Honey Drizzle', labelAr: 'عسل حار', price: '3.00', isAvailable: true },
            ],
          },
        ],
        order: margherita.order,
      },
      variants: [],
    },
    urbanCafe.id,
  );
}

if (pistachioLatte && pistachioLatte.specialDate !== todayQatar) {
  const itemVars = urbanVariants.filter(v => v.menuItemId === pistachioLatte.id);
  await superApi.req(
    'POST',
    '/api/manager-menu',
    {
      id: pistachioLatte.id,
      item: {
        categoryId: pistachioLatte.categoryId,
        name: pistachioLatte.name,
        nameAr: pistachioLatte.nameAr || 'لاتيه فستق مختص',
        description: 'Double ristretto over roasted Sicilian pistachio cream and silky milk.',
        descriptionAr: 'دبل ريستريتو مع كريمة الفستق المحمّص وحليب مخملي.',
        price: pistachioLatte.price,
        discount: '0',
        unit: pistachioLatte.unit,
        imageUrl: pistachioLatte.imageUrl,
        isAvailable: true,
        specialDate: todayQatar,
        hasMultiplePricing: pistachioLatte.hasMultiplePricing,
        prepTimeMins: 5,
        tags: ['Bestseller', 'Chef Pick'],
        allergenTags: ['Dairy', 'Pistachio'],
        modifierGroups: pistachioLatte.modifierGroups || [],
        order: pistachioLatte.order,
      },
      variants: itemVars.map(v => ({
        label: v.label,
        labelAr: v.labelAr || null,
        price: v.price,
        discount: v.discount || '0',
        unit: v.unit,
      })),
    },
    urbanCafe.id,
  );
}

for (const item of urbanItems.filter(i => i.imageUrl && i.isAvailable).slice(0, 10)) {
  await superApi.req(
    'POST',
    '/api/menu-library/publish',
    { restaurantId: urbanCafe.id, itemIds: [item.id] },
    urbanCafe.id,
  );
}

await enterWorkspace(qCafe.id);
const qMenuData = (await superApi.req('GET', '/api/manager-menu', undefined, qCafe.id)).data;
const qItems: any[] = qMenuData.items || [];
await superApi.req(
  'POST',
  '/api/restaurant',
  buildQstrawberryProfile(qMenuData.restaurant, qItems.find(i => i.imageUrl)?.imageUrl),
  qCafe.id,
);

for (const item of qItems.filter((i: any) => i.imageUrl).slice(0, 4)) {
  await superApi.req(
    'POST',
    '/api/menu-library/publish',
    { restaurantId: qCafe.id, itemIds: [item.id] },
    qCafe.id,
  );
}
const fullLibrary: any[] = (await superApi.req('GET', '/api/menu-library', undefined, qCafe.id)).data || [];

console.log('4/7 Provisioning 2nd Branch (Urban Café · West Bay) & Mode-A Venue (Saffron Majlis)...');
await enterWorkspace(urbanCafe.id);
allCafes = (await superApi.req('GET', '/api/super-admin/restaurants')).data;
let westBayCafe = allCafes.find((b: any) => b.slug === 'urban-west-bay');
if (!westBayCafe) {
  const createdWb = await superApi.req(
    'POST',
    '/api/hospitality/branches',
    {
      name: 'Urban Café · West Bay',
      slug: 'urban-west-bay',
      cuisineType: 'Executive Espresso Bar & Wood-Fired Flatbreads',
      address: 'West Bay Diplomatic Tower, Doha',
      orderingMode: 'cart_pay_at_venue',
    },
    urbanCafe.id,
  );
  assert.equal(createdWb.status, 201, JSON.stringify(createdWb.data));
  westBayCafe = createdWb.data.branch;
}

await enterWorkspace(westBayCafe.id);
const wbMenuBefore = (await superApi.req('GET', '/api/manager-menu', undefined, westBayCafe.id)).data;
if ((wbMenuBefore.items || []).length < 12 && fullLibrary.length > 0) {
  for (const libItem of fullLibrary.slice(0, 12)) {
    await superApi.req(
      'POST',
      '/api/menu-library/import',
      {
        restaurantId: westBayCafe.id,
        itemIds: [libItem.id],
        isAvailable: true,
        acceptCurrencyDifference: true,
      },
      westBayCafe.id,
    );
  }
}
const wbMenuAfter = (await superApi.req('GET', '/api/manager-menu', undefined, westBayCafe.id)).data;
await superApi.req(
  'POST',
  '/api/restaurant',
  buildWestBayProfile(wbMenuAfter.items?.[0]?.imageUrl || null),
  westBayCafe.id,
);

await enterWorkspace(majlisCafe.id);
const majlisMenuBefore = (await superApi.req('GET', '/api/manager-menu', undefined, majlisCafe.id)).data;
if ((majlisMenuBefore.items || []).length < 10 && fullLibrary.length > 0) {
  for (const libItem of fullLibrary.slice(2, 12)) {
    await superApi.req(
      'POST',
      '/api/menu-library/import',
      {
        restaurantId: majlisCafe.id,
        itemIds: [libItem.id],
        isAvailable: true,
        acceptCurrencyDifference: true,
      },
      majlisCafe.id,
    );
  }
}
const majlisMenuAfter = (await superApi.req('GET', '/api/manager-menu', undefined, majlisCafe.id)).data;
await superApi.req(
  'POST',
  '/api/restaurant',
  buildSaffronMajlisProfile(majlisMenuAfter.items?.[0]?.imageUrl || null),
  majlisCafe.id,
);

console.log('5/7 Seeding Multi-Tenant RBAC Staff Accounts & 6-Digit Station PINs...');

async function upsertStaffMember(cafeId: string, spec: StaffMemberSeedSpec) {
  await enterWorkspace(cafeId);
  const roster = (await superApi.req('GET', '/api/hospitality/team', undefined, cafeId)).data;
  const existingMember = (roster.members || []).find(
    (m: any) => m.email.toLowerCase() === spec.email.toLowerCase(),
  );
  if (!existingMember) {
    if (spec.preservePassword) {
      const foundUser = existingUsers.find(u => u.email.toLowerCase() === spec.email.toLowerCase());
      if (!foundUser) return;
    }
    let created = { status: 500, data: null as any };
    for (let attempt = 0; attempt < 3; attempt++) {
      created = await superApi.req(
        'POST',
        '/api/hospitality/team',
        {
          email: spec.email,
          ...(spec.preservePassword ? {} : { password: SHARED_TEST_PASSWORD }),
          firstName: spec.firstName,
          lastName: spec.lastName,
          staffRole: spec.staffRole,
          applyTenantWide: spec.scope === 'all_branches',
          ...(spec.scope === 'selected_branches' ? { restaurantIds: spec.branchIds || [cafeId] } : {}),
          capabilities: spec.capabilities || {},
          stationPin: spec.pin,
        },
        cafeId,
      );
      if (created.status < 500) break;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
    assert.ok(
      created.status === 201 || created.status === 200,
      `Failed creating ${spec.email}: ${JSON.stringify(created.data)}`,
    );
  } else if (!existingMember.hasPin || existingMember.highestRole !== spec.staffRole) {
    let updated = { status: 500, data: null as any };
    for (let attempt = 0; attempt < 3; attempt++) {
      updated = await superApi.req(
        'PATCH',
        `/api/hospitality/team/${existingMember.userId}`,
        {
          firstName: spec.firstName,
          lastName: spec.lastName,
          ...(spec.preservePassword ? {} : { newPassword: SHARED_TEST_PASSWORD }),
          staffRole: spec.staffRole,
          applyTenantWide: spec.scope === 'all_branches',
          ...(spec.scope === 'selected_branches' ? { restaurantIds: spec.branchIds || [cafeId] } : {}),
          capabilities: spec.capabilities || {},
          stationPin: spec.pin,
        },
        cafeId,
      );
      if (updated.status < 500) break;
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
    }
    assert.equal(updated.status, 200, `Failed updating ${spec.email}: ${JSON.stringify(updated.data)}`);
  }
}

const staffSpecs = buildStaffPortfolio(urbanCafe.id);
for (const s of staffSpecs.urban) await upsertStaffMember(urbanCafe.id, s);
for (const s of staffSpecs.qstrawberry) await upsertStaffMember(qCafe.id, s);
for (const s of staffSpecs.majlis) await upsertStaffMember(majlisCafe.id, s);

console.log('6/7 Seeding Floor Zones, Tables, Bays, Aggregators, Smart Tags & Scan Telemetry...');

async function ensureVenueInfrastructure(cafeId: string, prefix: string, includeBays: boolean, sampleItemIds: string[]) {
  await enterWorkspace(cafeId);
  let floor = (await superApi.req('GET', '/api/hospitality/floor', undefined, cafeId)).data;
  if ((floor.zones || []).length === 0) {
    const z1 = (
      await superApi.req(
        'POST',
        '/api/hospitality/zones',
        { name: 'Indoor Salon', nameAr: 'الصالة الداخلية', order: 0 },
        cafeId,
      )
    ).data.zone;
    const z2 = (
      await superApi.req(
        'POST',
        '/api/hospitality/zones',
        { name: 'Courtyard Terrace', nameAr: 'التراس الخارجي', order: 1 },
        cafeId,
      )
    ).data.zone;
    for (const [code, minC, maxC, comb, zId] of [
      [`${prefix}-01`, 1, 2, false, z1.id],
      [`${prefix}-02`, 2, 4, true, z1.id],
      [`${prefix}-03`, 2, 6, true, z2.id],
      [`${prefix}-04`, 4, 8, true, z2.id],
    ] as const) {
      await superApi.req(
        'POST',
        '/api/hospitality/tables',
        { zoneId: zId, tableCode: code, minCovers: minC, maxCovers: maxC, isCombinable: comb },
        cafeId,
      );
    }
    floor = (await superApi.req('GET', '/api/hospitality/floor', undefined, cafeId)).data;
  }

  let baysData = (await superApi.req('GET', '/api/hospitality/bays', undefined, cafeId)).data;
  if (includeBays && (baysData.bays || []).length === 0) {
    await superApi.req(
      'POST',
      '/api/hospitality/bays',
      { code: 'BAY-01', label: 'Curbside Pickup Spot 1', bayType: 'curbside', order: 0 },
      cafeId,
    );
    await superApi.req(
      'POST',
      '/api/hospitality/bays',
      { code: 'BAY-02', label: 'Curbside Pickup Spot 2', bayType: 'curbside', order: 1 },
      cafeId,
    );
    baysData = (await superApi.req('GET', '/api/hospitality/bays', undefined, cafeId)).data;
  }
  const bays = baysData.bays || [];

  let aggList: any[] =
    (await superApi.req('GET', '/api/hospitality/aggregators', undefined, cafeId)).data.aggregators || [];
  if (aggList.length === 0) {
    for (const agg of DEFAULT_AGGREGATORS) {
      const createdAgg = await superApi.req('POST', '/api/hospitality/aggregators', agg, cafeId);
      if (createdAgg.data?.aggregator) aggList.push(createdAgg.data.aggregator);
    }
  }
  const anBefore = (await superApi.req('GET', '/api/hospitality/analytics', undefined, cafeId)).data;
  if ((anBefore?.summary?.aggregatorClicksTotal || 0) === 0 && aggList.length > 0) {
    for (let k = 0; k < aggList.length * 2; k++) {
      const agg = aggList[k % aggList.length];
      await guestApi.req('POST', '/api/public/aggregator-click', {
        restaurantId: cafeId,
        aggregatorId: agg.id || null,
        platform: agg.platform,
        menuItemId: sampleItemIds[k % sampleItemIds.length] || null,
        locale: k % 2 === 0 ? 'en' : 'ar',
      });
    }
  }

  const existingTags: any[] =
    (await superApi.req('GET', '/api/hospitality/smart-tags', undefined, cafeId)).data.tags || [];
  const ensureTag = async (spec: any) => {
    const found = existingTags.find(t => t.tagCode.toUpperCase() === spec.tagCode.toUpperCase());
    if (found) return found;
    const created = await superApi.req('POST', '/api/hospitality/smart-tags', spec, cafeId);
    assert.equal(created.status, 201, `Smart tag ${spec.tagCode} failed: ${JSON.stringify(created.data)}`);
    return created.data.tag;
  };

  const menuTag = await ensureTag({
    tagCode: 'MENU-MAIN',
    label: 'Entrance Welcome Stand (QR + NFC)',
    hardwareKind: 'dual_qr_nfc',
    targetType: 'venue_menu',
  });
  const firstTable = floor.tables?.[1] || floor.tables?.[0];
  const tableTag = firstTable
    ? await ensureTag({
        tagCode: 'TBL-T02',
        label: `Dine-In Table ${firstTable.tableCode} Disc`,
        hardwareKind: 'dual_qr_nfc',
        targetType: 'dining_table',
        tableId: firstTable.id,
      })
    : null;
  const bayTag =
    includeBays && bays[0]
      ? await ensureTag({
          tagCode: 'BAY-M01',
          label: 'Curbside Bay 1 Bollard',
          hardwareKind: 'dual_qr_nfc',
          targetType: 'curbside_bay',
          bayId: bays[0].id,
        })
      : null;
  const wlTag = await ensureTag({
    tagCode: 'HOST-WL',
    label: 'Host Stand Walk-In Waitlist Poster',
    hardwareKind: 'dual_qr_nfc',
    targetType: 'waitlist_join',
  });
  const coaster1 = await ensureTag({
    tagCode: 'COASTER-01',
    label: 'Counter Reusable Coaster #01',
    hardwareKind: 'coaster_puck',
    targetType: 'reusable_pager',
  });
  await ensureTag({
    tagCode: 'COASTER-02',
    label: 'Counter Reusable Coaster #02',
    hardwareKind: 'coaster_puck',
    targetType: 'reusable_pager',
  });
  await ensureTag({
    tagCode: 'COASTER-03',
    label: 'Counter Reusable Coaster #03',
    hardwareKind: 'coaster_puck',
    targetType: 'reusable_pager',
  });

  // Record realistic QR & NFC scan telemetry if zero scans exist
  const totalScansNow = [menuTag, tableTag, bayTag, wlTag, coaster1]
    .filter(Boolean)
    .reduce((s, t) => s + (t.qrScans || 0) + (t.nfcTaps || 0), 0);
  if (totalScansNow === 0) {
    for (const tag of [menuTag, tableTag, bayTag, wlTag, coaster1].filter(Boolean)) {
      await guestApi.req('GET', `/api/public/tag/${tag.token}?src=qr`);
      await guestApi.req('GET', `/api/public/tag/${tag.token}?src=qr`);
      await guestApi.req('GET', `/api/public/tag/${tag.token}?src=nfc`);
    }
  }

  return { floor, bays, coaster1 };
}

const urbanAvailItems = urbanItems.filter(i => i.isAvailable);
const qAvailItems = qItems.filter((i: any) => i.isAvailable);
const wbAvailItems = (wbMenuAfter.items || []).filter((i: any) => i.isAvailable);
const mjAvailItems = (majlisMenuAfter.items || []).filter((i: any) => i.isAvailable);

const urbanInfra = await ensureVenueInfrastructure(urbanCafe.id, 'T', true, urbanAvailItems.map(i => i.id));
const qInfra = await ensureVenueInfrastructure(qCafe.id, 'K', true, qAvailItems.map((i: any) => i.id));
const wbInfra = await ensureVenueInfrastructure(westBayCafe.id, 'WB', true, wbAvailItems.map((i: any) => i.id));
const majlisInfra = await ensureVenueInfrastructure(majlisCafe.id, 'M', false, mjAvailItems.map((i: any) => i.id));

console.log('7/7 Seeding Live Orders, Completed Reviews, Pagers, Reservations & Waitlists Across All 4 Venues...');

async function seedVenueLiveActivity(params: {
  cafeId: string;
  items: any[];
  infra: { floor: any; bays: any[]; coaster1: any };
  minOrders: number;
  platePrefix: string;
}) {
  const { cafeId, items, infra, minOrders, platePrefix } = params;
  await enterWorkspace(cafeId);
  const existingOrdersData = (await superApi.req('GET', '/api/hospitality/orders', undefined, cafeId)).data;
  const existingOrders: any[] = existingOrdersData.orders || [];
  let readyToken = '';
  let preparingToken = '';

  if (existingOrders.length < minOrders && items.length >= 2) {
    const itemA = items[0];
    const itemB = items[1];
    const itemC = items[2] || items[0];
    const tableCode = infra.floor.tables?.[1]?.tableCode || infra.floor.tables?.[0]?.tableCode || 'T-01';

    // 1) Three completed, paid POS orders with SLA completion & 5-star / 4-star guest reviews
    const completedSpecs = [
      {
        name: 'Sheikha Al-Thani',
        channel: 'dine_in',
        rating: 5,
        comment: 'Super fast espresso & wood-fired service — loved the live virtual pager!',
        lines: [{ menuItemId: itemA.id, quantity: 2 }, { menuItemId: itemB.id, quantity: 1 }],
      },
      {
        name: 'Mohammed Al-Sulaiti',
        channel: 'counter_pickup',
        rating: 5,
        comment: 'Zero waiting at the counter, Volt Lime ready chime worked right in Safari.',
        lines: [{ menuItemId: itemB.id, quantity: 2 }, { menuItemId: itemC.id, quantity: 1 }],
      },
      {
        name: 'Elena Rossi',
        channel: 'curbside',
        rating: 4,
        comment: 'Brought warm straight to our car in Bay 1.',
        lines: [{ menuItemId: itemA.id, quantity: 1 }, { menuItemId: itemC.id, quantity: 2 }],
      },
    ];

    for (const cSpec of completedSpecs) {
      const created = await superApi.req(
        'POST',
        '/api/hospitality/orders',
        {
          channel: cSpec.channel,
          customerName: cSpec.name,
          tableCode: cSpec.channel === 'dine_in' ? tableCode : undefined,
          paymentStatus: 'paid',
          items: cSpec.lines,
        },
        cafeId,
      );
      if (created.status === 201 && created.data.pager?.id) {
        const pid = created.data.pager.id;
        const pToken = created.data.pager.trackingToken;
        await superApi.req('POST', `/api/hospitality/pagers/${pid}/transition`, { action: 'preparing' }, cafeId);
        await superApi.req('POST', `/api/hospitality/pagers/${pid}/transition`, { action: 'ready' }, cafeId);
        await superApi.req('POST', `/api/hospitality/pagers/${pid}/transition`, { action: 'collected' }, cafeId);
        await guestApi.req('POST', `/api/public/pager/${pToken}/feedback`, {
          rating: cSpec.rating,
          comment: cSpec.comment,
        });
      }
    }

    // 2) Active READY order (Volt Lime #C8FF42 ready state!)
    const ordReady = await superApi.req(
      'POST',
      '/api/hospitality/orders',
      {
        channel: 'counter_pickup',
        customerName: 'Khalid Al-Kuwari',
        customerPhone: '+974 5518 9001',
        paymentStatus: 'paid',
        items: [{ menuItemId: itemB.id, quantity: 2 }],
      },
      cafeId,
    );
    if (ordReady.status === 201 && ordReady.data.pager?.id) {
      readyToken = ordReady.data.pager.trackingToken;
      await superApi.req(
        'POST',
        `/api/hospitality/pagers/${ordReady.data.pager.id}/transition`,
        { action: 'ready' },
        cafeId,
      );
    }

    // 3) Active PREPARING order with 1/2 items checked off + Curbside Bay Arrival (if bays exist)
    const ordPrep = await superApi.req(
      'POST',
      '/api/hospitality/orders',
      {
        channel: infra.bays[0] ? 'curbside' : 'dine_in',
        customerName: 'Hamad Al-Dosari',
        customerPhone: '+974 5510 3302',
        paymentStatus: 'paid',
        notes: 'Extra napkins please',
        items: [
          { menuItemId: itemA.id, quantity: 1 },
          { menuItemId: itemC.id, quantity: 2 },
        ],
      },
      cafeId,
    );
    if (ordPrep.status === 201 && ordPrep.data.pager?.id) {
      preparingToken = ordPrep.data.pager.trackingToken;
      await superApi.req(
        'POST',
        `/api/hospitality/pagers/${ordPrep.data.pager.id}/line-items/0/toggle`,
        { prepared: true },
        cafeId,
      );
      if (infra.bays[0]) {
        await guestApi.req('POST', '/api/public/curbside/checkin', {
          trackingToken: preparingToken,
          bayId: infra.bays[0].id,
          etaStatus: 'arrived',
          vehicleColor: 'White',
          vehicleType: 'SUV',
          licensePlate: `${platePrefix} 88420`,
        });
      }
    }

    // 4) Active WAITING Dine-In Pay-at-Venue order (ready for Cashier POS settlement + Prep checkoff)
    await superApi.req(
      'POST',
      '/api/hospitality/orders',
      {
        channel: 'dine_in',
        customerName: 'Fatima Al-Mansoori',
        customerPhone: '+974 5510 2201',
        tableCode,
        paymentStatus: 'pay_at_venue',
        notes: 'Serve coffee together with food',
        items: [
          { menuItemId: itemA.id, quantity: 1 },
          { menuItemId: itemB.id, quantity: 2 },
        ],
      },
      cafeId,
    );
  }

  // Bind COASTER-01 to an active ticket if currently idle
  const refreshedTags =
    (await superApi.req('GET', '/api/hospitality/smart-tags', undefined, cafeId)).data.tags || [];
  const liveCoaster1 = refreshedTags.find((t: any) => t.id === infra.coaster1.id);
  if (liveCoaster1 && !liveCoaster1.activeTicketId) {
    await superApi.req(
      'POST',
      '/api/hospitality/pagers/issue',
      {
        mode: 'auto_number',
        customerName: 'Layla (NFC Coaster #01)',
        channel: 'counter_pickup',
        smartTagId: infra.coaster1.id,
      },
      cafeId,
    );
  }

  // Ensure Walk-In Waitlist (1 waiting + 1 ready)
  const freshFloor = (await superApi.req('GET', '/api/hospitality/floor', undefined, cafeId)).data;
  const activeWl = (freshFloor.waitlist || []).filter((w: any) => ['waiting', 'ready'].includes(w.status));
  let waitlistToken = activeWl.find((w: any) => w.status === 'ready')?.trackingToken || activeWl[0]?.trackingToken || '';
  if (activeWl.length < 2) {
    const wl1 = await guestApi.req('POST', `/api/public/waitlist/${cafeId}`, {
      guestName: 'Mariam & Family',
      guestPhone: '+974 5590 1122',
      partySize: 4,
      notes: 'Terrace table preferred',
    });
    if (wl1.status === 201) waitlistToken = wl1.data.entry.trackingToken;

    const wl2 = await guestApi.req('POST', `/api/public/waitlist/${cafeId}`, {
      guestName: 'Faisal Al-Marri',
      guestPhone: '+974 5590 4455',
      partySize: 2,
    });
    if (wl2.status === 201) {
      await superApi.req('POST', `/api/hospitality/waitlist/${wl2.data.entry.id}/action`, { action: 'ready' }, cafeId);
      waitlistToken = wl2.data.entry.trackingToken;
    }
  }

  // Ensure Upcoming Table Reservations (2 confirmed)
  const activeRes = (freshFloor.reservations || []).filter((r: any) => ['confirmed', 'seated'].includes(r.status));
  let bookingToken = activeRes[0]?.trackingToken || '';
  if (activeRes.length < 2) {
    const slot1 = new Date(Date.now() + 2 * 3_600_000).toISOString();
    const slot2 = new Date(Date.now() + 4 * 3_600_000).toISOString();
    const r1 = await superApi.req(
      'POST',
      '/api/hospitality/reservations',
      {
        guestName: 'Dr. Rashed Al-Naimi',
        guestPhone: '+974 5522 7788',
        partySize: 4,
        startAt: slot1,
        notes: 'Window table',
      },
      cafeId,
    );
    if (r1.status === 201) bookingToken = r1.data.reservation.trackingToken;
    await superApi.req(
      'POST',
      '/api/hospitality/reservations',
      {
        guestName: 'Aisha Executive Dinner',
        guestPhone: '+974 5522 9900',
        partySize: 4,
        startAt: slot2,
      },
      cafeId,
    );
  }

  if (!readyToken || !preparingToken) {
    const latestPagers = (await superApi.req('GET', '/api/hospitality/pagers', undefined, cafeId)).data.tickets || [];
    readyToken = readyToken || latestPagers.find((t: any) => t.status === 'ready')?.trackingToken || '';
    preparingToken = preparingToken || latestPagers.find((t: any) => t.status === 'preparing')?.trackingToken || '';
  }

  return { readyToken, preparingToken, waitlistToken, bookingToken };
}

const urbanLive = await seedVenueLiveActivity({
  cafeId: urbanCafe.id,
  items: urbanAvailItems,
  infra: urbanInfra,
  minOrders: 8,
  platePrefix: 'QAT',
});
await seedVenueLiveActivity({
  cafeId: westBayCafe.id,
  items: wbAvailItems,
  infra: wbInfra,
  minOrders: 5,
  platePrefix: 'WB',
});
await seedVenueLiveActivity({
  cafeId: qCafe.id,
  items: qAvailItems,
  infra: qInfra,
  minOrders: 5,
  platePrefix: 'KTR',
});
await seedVenueLiveActivity({
  cafeId: majlisCafe.id,
  items: mjAvailItems,
  infra: majlisInfra,
  minOrders: 5,
  platePrefix: 'MSH',
});

await superApi.req('DELETE', '/api/super-admin/cafe-access');

const pinCheck = new ApiSession(target.staffBase);
const pinRes = await pinCheck.req('POST', '/api/login/pin', {
  venueCode: 'urban-cafe',
  pin: '111222',
});
assert.equal(pinRes.status, 200, `PIN login check failed: ${JSON.stringify(pinRes.data)}`);

const summaryLines = formatCredentialsSummary({
  isCloud,
  staffBase: target.staffBase,
  guestBase: target.guestBase,
  sharedPassword: SHARED_TEST_PASSWORD,
  superAdminEmail: testSuperAdminEmail,
  sampleReadyPagerToken: urbanLive.readyToken,
  samplePreparingPagerToken: urbanLive.preparingToken,
  sampleWaitlistToken: urbanLive.waitlistToken,
  sampleBookingToken: urbanLive.bookingToken,
  coasterToken: urbanInfra.coaster1.token,
});

const outFile = isCloud ? 'TEST-CLOUD-CREDENTIALS.txt' : 'TEST-LOCAL-CREDENTIALS.txt';
await fs.writeFile(outFile, summaryLines.join('\n') + '\n', { mode: 0o600 });
console.log(
  `PASS: Seeded full multi-tenant dummy data on ${isCloud ? 'LIVE CLOUD' : 'LOCALHOST:5200'} -> saved ${outFile}`,
);
console.log(summaryLines.join('\n'));
