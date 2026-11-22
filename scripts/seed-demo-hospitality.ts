import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { initializeDatabase, db, pool } from '../server/db';
import { storage } from '../server/storage';
import {
  aggregatorLinks,
  categories,
  diningTables,
  diningZones,
  menuItemPriceVariants,
  menuItems,
  pagerTickets,
  restaurants,
  serviceBays,
} from '../shared/schema';

await initializeDatabase();

const existingCafes = await storage.getAllRestaurants();
if (existingCafes.length > 0) {
  console.log(`Local database already has ${existingCafes.length} café(s); skipping demo seed.`);
  await pool.close();
  process.exit(0);
}

const urbanSource = JSON.parse(fs.readFileSync('fixtures/urban-menu.json', 'utf8'));
const qstrawberrySource = JSON.parse(fs.readFileSync('fixtures/qstrawberry-menu.json', 'utf8'));

const managerPass = 'Demo-' + randomBytes(9).toString('base64url');

// 1. Urban Café — Mode B (cart_pay_at_venue) + Tables + Waitlist + Curbside + Aggregators
const urbanOwner = await storage.createUser({
  email: 'urban@pager.local',
  password: managerPass,
  firstName: 'Urban',
  lastName: 'Manager',
  role: 'admin',
});
const [urban] = await db
  .insert(restaurants)
  .values({
    userId: urbanOwner.id,
    name: 'Urban Café',
    slug: 'urban-cafe',
    theme: 'e3',
    brandAccentHex: '#92400E',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Artisan Pizza · Specialty Coffee · Desserts',
    address: 'Lusail Marina Promenade, Doha',
    openingHours: 'Daily · 07:00 AM – 12:00 AM',
    orderingMode: 'cart_pay_at_venue',
    reservationsEnabled: true,
    waitlistEnabled: true,
    driveThruEnabled: true,
    pagerMiniGameEnabled: true,
    googleMapsReviewUrl: 'https://maps.google.com/?q=Lusail+Marina+Doha',
  })
  .returning();

for (const [catOrder, cat] of urbanSource.categories.entries()) {
  const [createdCat] = await db
    .insert(categories)
    .values({ restaurantId: urban.id, title: cat.title, order: catOrder })
    .returning();
  for (const [itemOrder, [name, price, variants]] of cat.items.entries()) {
    const [createdItem] = await db
      .insert(menuItems)
      .values({
        categoryId: createdCat.id,
        name,
        price: String(price),
        discount: '0',
        unit: catOrder >= 8 ? 'cup' : 'serving',
        isAvailable: true,
        hasMultiplePricing: Boolean(variants),
        prepTimeMins: catOrder >= 8 ? 6 : 12,
        order: itemOrder,
      })
      .returning();
    if (variants) {
      await db.insert(menuItemPriceVariants).values(
        variants.map((v: any, idx: number) => ({
          menuItemId: createdItem.id,
          label: v.label,
          price: String(v.price),
          discount: '0',
          unit: 'cup',
          order: idx,
        })),
      );
    }
  }
}

const [indoorZone, terraceZone] = await db
  .insert(diningZones)
  .values([
    { restaurantId: urban.id, name: 'Indoor Lounge', nameAr: 'الصالة الداخلية', order: 0 },
    { restaurantId: urban.id, name: 'Marina Terrace', nameAr: 'تراس المارينا', order: 1 },
  ])
  .returning();

await db.insert(diningTables).values([
  { restaurantId: urban.id, zoneId: indoorZone.id, tableCode: 'T-01', minCovers: 1, maxCovers: 2 },
  { restaurantId: urban.id, zoneId: indoorZone.id, tableCode: 'T-02', minCovers: 2, maxCovers: 4 },
  { restaurantId: urban.id, zoneId: indoorZone.id, tableCode: 'T-03', minCovers: 4, maxCovers: 8, isCombinable: true },
  { restaurantId: urban.id, zoneId: terraceZone.id, tableCode: 'TR-01', minCovers: 2, maxCovers: 4 },
  { restaurantId: urban.id, zoneId: terraceZone.id, tableCode: 'TR-02', minCovers: 2, maxCovers: 6 },
]);

const [bay1, bay2] = await db
  .insert(serviceBays)
  .values([
    { restaurantId: urban.id, code: 'BAY-01', label: 'Curbside Bay 1 · Marina Gate', bayType: 'curbside', order: 0 },
    { restaurantId: urban.id, code: 'BAY-02', label: 'Curbside Bay 2 · Marina Gate', bayType: 'curbside', order: 1 },
    { restaurantId: urban.id, code: 'LANE-1', label: 'Express Coffee Window', bayType: 'drive_thru', order: 2 },
  ])
  .returning();

await db.insert(aggregatorLinks).values([
  {
    restaurantId: urban.id,
    platform: 'talabat',
    displayName: 'Talabat Qatar',
    url: 'https://www.talabat.com/qatar',
    badgeEn: 'Fastest in Lusail',
    badgeAr: 'الأسرع في لوسيل',
    order: 0,
  },
  {
    restaurantId: urban.id,
    platform: 'snoonu',
    displayName: 'Snoonu',
    url: 'https://snoonu.com',
    badgeEn: 'Qatari Local Favorite',
    badgeAr: 'توصيل سريع في قطر',
    order: 1,
  },
  {
    restaurantId: urban.id,
    platform: 'keeta',
    displayName: 'Keeta Qatar',
    url: 'https://www.keeta-global.com/QA/en/wst',
    badgeEn: 'Free Delivery Promo',
    badgeAr: 'عرض توصيل مجاني',
    order: 2,
  },
]);

const today = new Date().toISOString().slice(0, 10);
await db.insert(pagerTickets).values([
  {
    restaurantId: urban.id,
    ticketCode: 'A-001',
    ticketDate: today,
    dailySeq: 1,
    source: 'auto_number',
    status: 'preparing',
    customerName: 'Jassim',
    estimatedPrepMins: 7,
    preparingAt: new Date(),
  },
  {
    restaurantId: urban.id,
    bayId: bay1.id,
    ticketCode: 'A-002',
    ticketDate: today,
    dailySeq: 2,
    source: 'curbside',
    status: 'waiting',
    customerName: 'Mariam',
    vehicleColor: 'White',
    vehicleType: 'SUV',
    licensePlate: 'QAT 70412',
    etaStatus: 'arrived',
    arrivedAt: new Date(),
    estimatedPrepMins: 9,
  },
]);

// 2. Qstrawberry — Mode C (full_online_checkout via SkipCash)
const qOwner = await storage.createUser({
  email: 'qstrawberry@pager.local',
  password: managerPass,
  firstName: 'Qstrawberry',
  lastName: 'Manager',
  role: 'admin',
});
const [qCafe] = await db
  .insert(restaurants)
  .values({
    userId: qOwner.id,
    name: 'Qstrawberry',
    slug: 'qstrawberry',
    theme: 'terracotta',
    currency: 'QAR',
    timezone: 'Asia/Qatar',
    cuisineType: 'Belgian Chocolate Strawberries & Specialty Coffee',
    address: 'Katara Cultural Village, Doha',
    openingHours: 'Daily · 02:00 PM – 01:00 AM',
    orderingMode: 'full_online_checkout',
    paymentGateway: 'skipcash',
    reservationsEnabled: false,
    waitlistEnabled: true,
    driveThruEnabled: true,
    pagerMiniGameEnabled: true,
  })
  .returning();

for (const [catOrder, cat] of qstrawberrySource.categories.entries()) {
  const [createdCat] = await db
    .insert(categories)
    .values({ restaurantId: qCafe.id, title: cat.title, order: catOrder })
    .returning();
  for (const [itemOrder, [name, price, description, tags]] of cat.items.entries()) {
    await db.insert(menuItems).values({
      categoryId: createdCat.id,
      name,
      description: description || null,
      tags: tags || [],
      price: String(price),
      discount: '0',
      unit: 'serving',
      isAvailable: true,
      hasMultiplePricing: false,
      prepTimeMins: 5,
      order: itemOrder,
    });
  }
}

await db.insert(serviceBays).values([
  { restaurantId: qCafe.id, code: 'BAY-01', label: 'Katara Curbside Spot 1', bayType: 'curbside', order: 0 },
  { restaurantId: qCafe.id, code: 'BAY-02', label: 'Katara Curbside Spot 2', bayType: 'curbside', order: 1 },
]);

fs.appendFileSync(
  'SETUP-CREDENTIALS.txt',
  `\nDemo Branch Managers\nUrban Café (Mode B · Pay at Venue): urban@pager.local / ${managerPass}\nQstrawberry (Mode C · SkipCash Online): qstrawberry@pager.local / ${managerPass}\n`,
);

console.log('Seeded isolated demo portfolio: Urban Café (/v/urban-cafe) + Qstrawberry (/v/qstrawberry) with tables, bays, pagers & aggregators.');
await pool.close();
