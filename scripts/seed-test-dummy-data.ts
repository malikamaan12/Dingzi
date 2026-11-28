import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import {
  buildQstrawberryProfile,
  buildSaffronMajlisProfile,
  buildStaffPortfolio,
  buildUrbanLusailProfile,
  buildWestBayProfile,
  formatCredentialsSummary,
  type StaffMemberSeedSpec,
} from './seed-test-dummy-fixtures';

const isCloud = process.argv.includes('--cloud');
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

const existingUsersRes = await superApi.req('GET', '/api/super-admin/users');
assert.equal(existingUsersRes.status, 200);
const existingUsers: any[] = existingUsersRes.data;
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
const allTenants: any[] = (await superApi.req('GET', '/api/super-admin/tenants')).data.tenants;

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

console.log('3/7 Enriching bilingual profiles, dynamic VenueConfig rules & Global Menu Library...');

async function enterWorkspace(cafeId: string) {
  const r = await superApi.req('POST', '/api/super-admin/cafe-access', { restaurantId: cafeId });
  assert.equal(r.status, 200, `Failed to open workspace ${cafeId}: ${JSON.stringify(r.data)}`);
}

await enterWorkspace(urbanCafe.id);
const urbanMenuData = (await superApi.req('GET', '/api/manager-menu', undefined, urbanCafe.id)).data;
await superApi.req('POST', '/api/restaurant', buildUrbanLusailProfile(urbanMenuData.restaurant), urbanCafe.id);

const todayQatar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Qatar',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const urbanItems: any[] = urbanMenuData.items || [];
const urbanVariants: any[] = urbanMenuData.variants || [];
const margherita = urbanItems.find(i => /marg/i.test(i.name)) || urbanItems[0];
const pistachioLatte = urbanItems.find(i => /pistachio latte/i.test(i.name)) || urbanItems[1];
const spanishLatte = urbanItems.find(i => /^spanish latte$/i.test(i.name)) || urbanItems[2];

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

for (const item of urbanItems.filter(i => i.imageUrl).slice(0, 8)) {
  await superApi.req(
    'POST',
    '/api/menu-library/publish',
    { restaurantId: urbanCafe.id, itemIds: [item.id] },
    urbanCafe.id,
  );
}

await enterWorkspace(qCafe.id);
const qMenuData = (await superApi.req('GET', '/api/manager-menu', undefined, qCafe.id)).data;
await superApi.req('POST', '/api/restaurant', buildQstrawberryProfile(qMenuData.restaurant), qCafe.id);

for (const item of (qMenuData.items || []).filter((i: any) => i.imageUrl).slice(0, 3)) {
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
if ((wbMenuBefore.items || []).length === 0 && fullLibrary.length > 0) {
  for (const libItem of fullLibrary.slice(0, 8)) {
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
if ((majlisMenuBefore.items || []).length === 0 && fullLibrary.length > 0) {
  for (const libItem of fullLibrary.slice(3, 10)) {
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
    const created = await superApi.req(
      'POST',
      '/api/hospitality/team',
      {
        email: spec.email,
        password: SHARED_TEST_PASSWORD,
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
    assert.ok(
      created.status === 201 || created.status === 200,
      `Failed creating ${spec.email}: ${JSON.stringify(created.data)}`,
    );
  } else {
    const updated = await superApi.req(
      'PATCH',
      `/api/hospitality/team/${existingMember.userId}`,
      {
        firstName: spec.firstName,
        lastName: spec.lastName,
        newPassword: SHARED_TEST_PASSWORD,
        staffRole: spec.staffRole,
        applyTenantWide: spec.scope === 'all_branches',
        ...(spec.scope === 'selected_branches' ? { restaurantIds: spec.branchIds || [cafeId] } : {}),
        capabilities: spec.capabilities || {},
        stationPin: spec.pin,
      },
      cafeId,
    );
    assert.equal(updated.status, 200, `Failed updating ${spec.email}: ${JSON.stringify(updated.data)}`);
  }
}

const staffSpecs = buildStaffPortfolio(urbanCafe.id);
for (const s of staffSpecs.urban) await upsertStaffMember(urbanCafe.id, s);
for (const s of staffSpecs.qstrawberry) await upsertStaffMember(qCafe.id, s);
for (const s of staffSpecs.majlis) await upsertStaffMember(majlisCafe.id, s);

console.log('6/7 Seeding Floor Zones, Tables, Bays, QR/NFC Smart Tags & Reusable Coasters...');

async function ensureFloorAndBays(cafeId: string, prefix: string, includeBays = true) {
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
    await superApi.req(
      'POST',
      '/api/hospitality/tables',
      { zoneId: z1.id, tableCode: `${prefix}-01`, minCovers: 1, maxCovers: 2, isCombinable: false },
      cafeId,
    );
    await superApi.req(
      'POST',
      '/api/hospitality/tables',
      { zoneId: z1.id, tableCode: `${prefix}-02`, minCovers: 2, maxCovers: 4, isCombinable: true },
      cafeId,
    );
    await superApi.req(
      'POST',
      '/api/hospitality/tables',
      { zoneId: z2.id, tableCode: `${prefix}-03`, minCovers: 2, maxCovers: 6, isCombinable: true },
      cafeId,
    );
    floor = (await superApi.req('GET', '/api/hospitality/floor', undefined, cafeId)).data;
  } else if ((floor.tables || []).length === 0 && floor.zones[0]) {
    await superApi.req(
      'POST',
      '/api/hospitality/tables',
      { zoneId: floor.zones[0].id, tableCode: `${prefix}-01`, minCovers: 2, maxCovers: 4, isCombinable: true },
      cafeId,
    );
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
  return { floor, bays: baysData.bays || [] };
}

const urbanInfra = await ensureFloorAndBays(urbanCafe.id, 'T', true);
await ensureFloorAndBays(qCafe.id, 'K', true);
await ensureFloorAndBays(westBayCafe.id, 'WB', true);
await ensureFloorAndBays(majlisCafe.id, 'M', false);

async function ensureSmartTag(
  cafeId: string,
  existingTags: any[],
  spec: {
    tagCode: string;
    label: string;
    hardwareKind: 'qr_only' | 'nfc_tag' | 'dual_qr_nfc' | 'coaster_puck';
    targetType: 'venue_menu' | 'dining_table' | 'curbside_bay' | 'waitlist_join' | 'reservations' | 'reusable_pager';
    tableId?: string | null;
    bayId?: string | null;
  },
) {
  const found = existingTags.find(t => t.tagCode.toUpperCase() === spec.tagCode.toUpperCase());
  if (found) return found;
  const created = await superApi.req('POST', '/api/hospitality/smart-tags', spec, cafeId);
  assert.equal(created.status, 201, `Smart tag ${spec.tagCode} failed: ${JSON.stringify(created.data)}`);
  return created.data.tag;
}

await enterWorkspace(urbanCafe.id);
const urbanTagsExisting =
  (await superApi.req('GET', '/api/hospitality/smart-tags', undefined, urbanCafe.id)).data.tags || [];
await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
  tagCode: 'MENU-MAIN',
  label: 'Entrance Welcome Stand (QR + NFC)',
  hardwareKind: 'dual_qr_nfc',
  targetType: 'venue_menu',
});
if (urbanInfra.floor.tables?.[1] || urbanInfra.floor.tables?.[0]) {
  const tbl = urbanInfra.floor.tables[1] || urbanInfra.floor.tables[0];
  await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
    tagCode: 'TBL-T02',
    label: `Dine-In Table ${tbl.tableCode} Acrylic Disc`,
    hardwareKind: 'dual_qr_nfc',
    targetType: 'dining_table',
    tableId: tbl.id,
  });
}
if (urbanInfra.bays?.[0]) {
  await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
    tagCode: 'BAY-M01',
    label: 'Marina Curbside Bay 1 Bollard',
    hardwareKind: 'dual_qr_nfc',
    targetType: 'curbside_bay',
    bayId: urbanInfra.bays[0].id,
  });
}
await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
  tagCode: 'HOST-WL',
  label: 'Host Stand Walk-In Waitlist Poster',
  hardwareKind: 'dual_qr_nfc',
  targetType: 'waitlist_join',
});
const coaster1 = await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
  tagCode: 'COASTER-01',
  label: 'Counter Reusable Coaster #01',
  hardwareKind: 'coaster_puck',
  targetType: 'reusable_pager',
});
await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
  tagCode: 'COASTER-02',
  label: 'Counter Reusable Coaster #02',
  hardwareKind: 'coaster_puck',
  targetType: 'reusable_pager',
});
await ensureSmartTag(urbanCafe.id, urbanTagsExisting, {
  tagCode: 'COASTER-03',
  label: 'Counter Reusable Coaster #03',
  hardwareKind: 'coaster_puck',
  targetType: 'reusable_pager',
});

console.log('7/7 Seeding Live Orders, Virtual Pagers, Reservations & Walk-In Waitlist Passes...');

await enterWorkspace(urbanCafe.id);
const urbanPagersNow = (await superApi.req('GET', '/api/hospitality/pagers', undefined, urbanCafe.id)).data;
const activeUrbanTickets = (urbanPagersNow.tickets || []).filter((t: any) =>
  ['waiting', 'preparing', 'ready'].includes(t.status),
);

let sampleReadyPagerToken = activeUrbanTickets.find((t: any) => t.status === 'ready')?.trackingToken || '';
let samplePreparingPagerToken = activeUrbanTickets.find((t: any) => t.status === 'preparing')?.trackingToken || '';

if (activeUrbanTickets.length < 3 && margherita && spanishLatte) {
  const ordWait = await guestApi.req('POST', '/api/public/orders', {
    restaurantId: urbanCafe.id,
    channel: 'dine_in',
    customerName: 'Fatima Al-Mansoori',
    customerPhone: '+974 5510 2201',
    tableCode: 'T-02',
    notes: 'Extra crispy crust please',
    items: [
      { menuItemId: margherita.id, quantity: 1 },
      { menuItemId: spanishLatte.id, quantity: 2 },
    ],
  });
  assert.equal(ordWait.status, 201, JSON.stringify(ordWait.data));

  const ordPrep = await guestApi.req('POST', '/api/public/orders', {
    restaurantId: urbanCafe.id,
    channel: 'curbside',
    customerName: 'Hamad Al-Dosari',
    customerPhone: '+974 5510 3302',
    bayId: urbanInfra.bays[0]?.id || null,
    vehicleColor: 'White',
    vehicleType: 'SUV',
    licensePlate: 'QAT 88420',
    items: [
      { menuItemId: margherita.id, quantity: 1 },
      { menuItemId: spanishLatte.id, quantity: 1 },
    ],
  });
  assert.equal(ordPrep.status, 201, JSON.stringify(ordPrep.data));
  if (ordPrep.data.pager?.id) {
    samplePreparingPagerToken = ordPrep.data.pager.trackingToken;
    await superApi.req(
      'POST',
      `/api/hospitality/pagers/${ordPrep.data.pager.id}/line-items/0/toggle`,
      { prepared: true },
      urbanCafe.id,
    );
  }

  const ordReady = await guestApi.req('POST', '/api/public/orders', {
    restaurantId: urbanCafe.id,
    channel: 'counter_pickup',
    customerName: 'Khalid Al-Sulaiti',
    items: [{ menuItemId: spanishLatte.id, quantity: 2 }],
  });
  assert.equal(ordReady.status, 201, JSON.stringify(ordReady.data));
  if (ordReady.data.pager?.id) {
    sampleReadyPagerToken = ordReady.data.pager.trackingToken;
    await superApi.req(
      'POST',
      `/api/hospitality/pagers/${ordReady.data.pager.id}/transition`,
      { action: 'ready' },
      urbanCafe.id,
    );
  }
}

const refreshedTags =
  (await superApi.req('GET', '/api/hospitality/smart-tags', undefined, urbanCafe.id)).data.tags || [];
const liveCoaster1 = refreshedTags.find((t: any) => t.id === coaster1.id);
if (liveCoaster1 && !liveCoaster1.activeTicketId) {
  await superApi.req(
    'POST',
    '/api/hospitality/pagers/issue',
    {
      mode: 'auto_number',
      customerName: 'Layla (Coaster #01)',
      channel: 'counter_pickup',
      smartTagId: coaster1.id,
    },
    urbanCafe.id,
  );
}

let sampleWaitlistToken = '';
let sampleBookingToken = '';
const activeUrbanWl = (urbanInfra.floor.waitlist || []).filter((w: any) => ['waiting', 'ready'].includes(w.status));
if (activeUrbanWl.length < 2) {
  const wl1 = await guestApi.req('POST', `/api/public/waitlist/${urbanCafe.id}`, {
    guestName: 'Mariam & Family',
    guestPhone: '+974 5590 1122',
    partySize: 4,
    notes: 'Marina Terrace preferred',
  });
  if (wl1.status === 201) sampleWaitlistToken = wl1.data.entry.trackingToken;

  const wl2 = await guestApi.req('POST', `/api/public/waitlist/${urbanCafe.id}`, {
    guestName: 'Faisal Al-Marri',
    guestPhone: '+974 5590 4455',
    partySize: 2,
  });
  if (wl2.status === 201) {
    await superApi.req(
      'POST',
      `/api/hospitality/waitlist/${wl2.data.entry.id}/action`,
      { action: 'ready' },
      urbanCafe.id,
    );
    sampleWaitlistToken = wl2.data.entry.trackingToken;
  }
} else {
  sampleWaitlistToken = activeUrbanWl[0].trackingToken;
}

const activeUrbanRes = (urbanInfra.floor.reservations || []).filter((r: any) =>
  ['confirmed', 'seated'].includes(r.status),
);
if (activeUrbanRes.length < 2) {
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
      notes: 'Anniversary window table',
    },
    urbanCafe.id,
  );
  if (r1.status === 201) sampleBookingToken = r1.data.reservation.trackingToken;
  await superApi.req(
    'POST',
    '/api/hospitality/reservations',
    {
      guestName: 'Aisha Executive Dinner',
      guestPhone: '+974 5522 9900',
      partySize: 6,
      startAt: slot2,
    },
    urbanCafe.id,
  );
} else {
  sampleBookingToken = activeUrbanRes[0].trackingToken;
}

await enterWorkspace(westBayCafe.id);
const wbPagers = (await superApi.req('GET', '/api/hospitality/pagers', undefined, westBayCafe.id)).data;
if ((wbPagers.tickets || []).length === 0 && wbMenuAfter.items?.[0]) {
  await superApi.req(
    'POST',
    '/api/hospitality/orders',
    {
      channel: 'counter_pickup',
      customerName: 'Zaid (West Bay Tower)',
      paymentStatus: 'paid',
      items: [{ menuItemId: wbMenuAfter.items[0].id, quantity: 2 }],
    },
    westBayCafe.id,
  );
}

await enterWorkspace(qCafe.id);
const qPagers = (await superApi.req('GET', '/api/hospitality/pagers', undefined, qCafe.id)).data;
const qFirstItem = qMenuData.items?.[0];
if ((qPagers.tickets || []).length === 0 && qFirstItem) {
  const qOrd = await guestApi.req('POST', '/api/public/orders', {
    restaurantId: qCafe.id,
    channel: 'counter_pickup',
    customerName: 'Noora Al-Hajri',
    customerPhone: '+974 5544 1234',
    items: [{ menuItemId: qFirstItem.id, quantity: 2 }],
  });
  if (qOrd.status === 201 && qOrd.data.checkout?.signatureToken) {
    await guestApi.req('POST', `/api/public/payments/${qOrd.data.order.id}/confirm-sandbox`, {
      provider: qOrd.data.checkout.provider,
      paymentReference: qOrd.data.checkout.paymentReference,
      signatureToken: qOrd.data.checkout.signatureToken,
    });
  }
}

await enterWorkspace(majlisCafe.id);
const mjPagers = (await superApi.req('GET', '/api/hospitality/pagers', undefined, majlisCafe.id)).data;
if ((mjPagers.tickets || []).length === 0) {
  await superApi.req(
    'POST',
    '/api/hospitality/pagers/issue',
    { mode: 'auto_number', customerName: 'Sheikh Jassim', channel: 'dine_in' },
    majlisCafe.id,
  );
  await guestApi.req('POST', `/api/public/waitlist/${majlisCafe.id}`, {
    guestName: 'Abdullah & Guests',
    partySize: 5,
  });
}

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
  sampleReadyPagerToken,
  samplePreparingPagerToken,
  sampleWaitlistToken,
  sampleBookingToken,
  coasterToken: coaster1.token,
});

const outFile = isCloud ? 'TEST-CLOUD-CREDENTIALS.txt' : 'TEST-LOCAL-CREDENTIALS.txt';
await fs.writeFile(outFile, summaryLines.join('\n') + '\n', { mode: 0o600 });
console.log(
  `PASS: Seeded full multi-tenant dummy data on ${isCloud ? 'LIVE CLOUD' : 'LOCALHOST:5200'} -> saved ${outFile}`,
);
console.log(summaryLines.join('\n'));
