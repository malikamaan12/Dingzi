import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { config } from 'dotenv';
import { Client } from 'pg';
import bcrypt from 'bcrypt';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);

const staffOrigin = process.env.MANAGEMENT_ORIGIN;
const guestOrigin = process.env.PUBLIC_MENU_ORIGIN;
const bucket = process.env.STORAGE_BUCKET || 'pager-media';
const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(staffOrigin && guestOrigin && supabaseUrl && serviceKey && process.env.DATABASE_URL);

const urbanFixture = JSON.parse(await fs.readFile('fixtures/urban-menu.json', 'utf8'));
const urbanPhotoManifest = JSON.parse(await fs.readFile('assets/urban-menu-photos/manifest.json', 'utf8'));
const qstrawberryFixture = JSON.parse(await fs.readFile('fixtures/qstrawberry-menu.json', 'utf8'));

async function uploadWebpDirect(bytes, id) {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${id}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'Content-Type': 'image/webp',
      'x-upsert': 'true',
      'Cache-Control': '3600',
    },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`Storage upload failed (${res.status}) for ${id}`);
  }
}

async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (idx < items.length) {
        const current = idx++;
        results[current] = await fn(items[current], current);
      }
    }),
  );
  return results;
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
});
await client.connect();

try {
  const existingCafes = (await client.query('SELECT id, name, slug FROM restaurants ORDER BY created_at')).rows;
  if (existingCafes.length > 0) {
    console.log(`Cloud database already contains ${existingCafes.length} venue(s) (${existingCafes.map(c => c.name).join(', ')}); skipping initial seed.`);
    process.exit(0);
  }

  const demoPass = 'DingziDemo-' + randomBytes(9).toString('base64url');
  const hashedPass = await bcrypt.hash(demoPass, 12);

  console.log('1/4 Creating demo managers & Multi-Branch Brand Group on Supabase...');
  const urbanOwnerId = randomUUID();
  const qOwnerId = randomUUID();
  const tenantId = randomUUID();
  const urbanCafeId = randomUUID();
  const qCafeId = randomUUID();

  await client.query(
    `INSERT INTO users (id, email, password, first_name, last_name, role, account_status)
     VALUES ($1, 'urban@dingzi.app', $3, 'Urban', 'Manager', 'admin', 'active'),
            ($2, 'qstrawberry@dingzi.app', $3, 'Qstrawberry', 'Manager', 'admin', 'active')`,
    [urbanOwnerId, qOwnerId, hashedPass],
  );

  await client.query(
    `INSERT INTO tenants (id, name, slug, owner_user_id)
     VALUES ($1, 'Dingzi Qatar Hospitality Group', 'dingzi-qatar-group', $2)`,
    [tenantId, urbanOwnerId],
  );

  await client.query(
    `INSERT INTO staff_assignments (user_id, tenant_id, staff_role, is_active)
     VALUES ($1, $2, 'tenant_owner', true)`,
    [urbanOwnerId, tenantId],
  );

  await client.query(
    `INSERT INTO restaurants (
       id, user_id, tenant_id, name, slug, theme, brand_accent_hex, currency, timezone,
       cuisine_type, address, phone, opening_hours, open_time, close_time,
       ordering_mode, payment_gateway, reservations_enabled, waitlist_enabled,
       drive_thru_enabled, pager_mini_game_enabled, slot_interval_mins,
       default_turn_duration_mins, reservation_deposit_amount, google_maps_review_url
     ) VALUES
     (
       $1, $2, $3, 'Urban Café', 'urban-cafe', 'dingzi', '#6236FF', 'QAR', 'Asia/Qatar',
       'Artisan Pizza · Specialty Coffee · Refreshments', 'Lusail Marina Promenade, Doha', '+974 4400 1100',
       'Daily · 08:00 – 23:30', '08:00', '23:30',
       'cart_pay_at_venue', 'none', true, true,
       true, true, 30, 90, '0.00', 'https://maps.google.com/?q=Lusail+Marina+Doha'
     ),
     (
       $4, $5, $3, 'Qstrawberry', 'qstrawberry', 'terracotta', '#6236FF', 'QAR', 'Asia/Qatar',
       'Belgian Chocolate Strawberries & Specialty Coffee', 'Katara Cultural Village, Doha', '+974 4400 2200',
       'Daily · 14:00 – 01:00', '14:00', '01:00',
       'full_online_checkout', 'skipcash', true, true,
       true, true, 30, 75, '25.00', 'https://maps.google.com/?q=Katara+Cultural+Village+Doha'
     )`,
    [urbanCafeId, urbanOwnerId, tenantId, qCafeId, qOwnerId],
  );

  // Upload all 70 Urban Café WebP photos in parallel, then batch-insert media metadata
  console.log('2/4 Uploading 70 canonical Urban Café WebP photos to private pager-media bucket...');
  const urbanPhotoByKey = new Map();
  const urbanUploads = await mapWithConcurrency(urbanPhotoManifest.records, 10, async rec => {
    const filePath = path.resolve(rec.webp.replaceAll('\\', '/'));
    const bytes = await fs.readFile(filePath);
    const mediaId = randomUUID();
    await uploadWebpDirect(bytes, mediaId);
    const key = `${rec.category.toLowerCase()}::${rec.name.toLowerCase()}`;
    urbanPhotoByKey.set(key, `/objects/${mediaId}`);
    return { mediaId, size: bytes.length };
  });
  for (const { mediaId, size } of urbanUploads) {
    await client.query(
      'INSERT INTO media_objects (id, owner_id, mime, size) VALUES ($1, $2, $3, $4)',
      [mediaId, urbanOwnerId, 'image/webp', size],
    );
  }

  // Upload all 19 Qstrawberry WebP photos in parallel, then batch-insert media metadata
  console.log('3/4 Uploading 19 canonical Qstrawberry WebP photos to private pager-media bucket...');
  const qImageNames = [
    ...new Set(qstrawberryFixture.categories.flatMap(c => c.items.map(it => it[4]).filter(Boolean))),
  ];
  const qPhotoByFilename = new Map();
  const qUploads = await mapWithConcurrency(qImageNames, 8, async filename => {
    const filePath = path.join('assets', 'qstrawberry-menu-photos', 'items', filename);
    const bytes = await fs.readFile(filePath);
    const mediaId = randomUUID();
    await uploadWebpDirect(bytes, mediaId);
    qPhotoByFilename.set(filename, `/objects/${mediaId}`);
    return { mediaId, size: bytes.length };
  });
  for (const { mediaId, size } of qUploads) {
    await client.query(
      'INSERT INTO media_objects (id, owner_id, mime, size) VALUES ($1, $2, $3, $4)',
      [mediaId, qOwnerId, 'image/webp', size],
    );
  }

  console.log('4/4 Inserting categories, menu items, variants, dining zones, combinable tables, curbside bays & aggregators...');
  const espressoModifiers = [
    {
      id: randomUUID(),
      title: 'Milk Selection',
      titleAr: 'اختيار الحليب',
      selection: 'single',
      minSelections: 0,
      maxSelections: 1,
      options: [
        { id: randomUUID(), label: 'Full Cream Milk', labelAr: 'حليب كامل الدسم', price: '0', isAvailable: true },
        { id: randomUUID(), label: 'Oat Milk', labelAr: 'حليب الشوفان', price: '3.00', isAvailable: true },
        { id: randomUUID(), label: 'Coconut Milk', labelAr: 'حليب جوز الهند', price: '3.00', isAvailable: true },
      ],
    },
  ];

  let firstCoffeeCover = null;
  for (const [catOrder, cat] of urbanFixture.categories.entries()) {
    const catId = randomUUID();
    await client.query(
      'INSERT INTO categories (id, restaurant_id, title, is_visible, "order") VALUES ($1, $2, $3, true, $4)',
      [catId, urbanCafeId, cat.title, catOrder],
    );
    const isCoffeeCat = /coffee|espresso|latte|cold|hot/i.test(cat.title);
    for (const [itemOrder, [name, price, variants]] of cat.items.entries()) {
      const itemId = randomUUID();
      const imageUrl = urbanPhotoByKey.get(`${cat.title.toLowerCase()}::${String(name).toLowerCase()}`) || null;
      if (!firstCoffeeCover && imageUrl) firstCoffeeCover = imageUrl;
      await client.query(
        `INSERT INTO menu_items (
           id, category_id, name, price, discount, unit, image_url, is_available,
           has_multiple_pricing, modifier_groups, allergen_tags, prep_time_mins, "order"
         ) VALUES ($1, $2, $3, $4, '0', $5, $6, true, $7, $8::jsonb, $9::text[], $10, $11)`,
        [
          itemId,
          catId,
          name,
          String(price),
          catOrder >= 8 ? 'cup' : 'serving',
          imageUrl,
          Boolean(variants),
          JSON.stringify(isCoffeeCat ? espressoModifiers : []),
          catOrder === 0 ? ['Gluten', 'Dairy'] : isCoffeeCat ? ['Dairy'] : [],
          catOrder >= 8 ? 5 : 12,
          itemOrder,
        ],
      );
      if (variants) {
        for (const [vIdx, v] of variants.entries()) {
          await client.query(
            `INSERT INTO menu_item_price_variants (menu_item_id, label, price, discount, unit, "order")
             VALUES ($1, $2, $3, '0', 'cup', $4)`,
            [itemId, v.label, String(v.price), vIdx],
          );
        }
      }
    }
  }

  let firstQCover = null;
  for (const [catOrder, cat] of qstrawberryFixture.categories.entries()) {
    const catId = randomUUID();
    await client.query(
      'INSERT INTO categories (id, restaurant_id, title, is_visible, "order") VALUES ($1, $2, $3, true, $4)',
      [catId, qCafeId, cat.title, catOrder],
    );
    for (const [itemOrder, [name, price, description, tags, imageName]] of cat.items.entries()) {
      const imageUrl = qPhotoByFilename.get(imageName) || null;
      if (!firstQCover && imageUrl) firstQCover = imageUrl;
      await client.query(
        `INSERT INTO menu_items (
           category_id, name, description, tags, price, discount, unit, image_url,
           is_available, has_multiple_pricing, allergen_tags, prep_time_mins, "order"
         ) VALUES ($1, $2, $3, $4::text[], $5, '0', 'serving', $6, true, false, ARRAY['Dairy']::text[], 6, $7)`,
        [catId, name, description || null, tags || [], String(price), imageUrl, itemOrder],
      );
    }
  }

  if (firstCoffeeCover) {
    await client.query("UPDATE restaurants SET cover_media_url = $1, cover_media_type = 'image' WHERE id = $2", [
      firstCoffeeCover,
      urbanCafeId,
    ]);
  }
  if (firstQCover) {
    await client.query("UPDATE restaurants SET cover_media_url = $1, cover_media_type = 'image' WHERE id = $2", [
      firstQCover,
      qCafeId,
    ]);
  }

  // Zones, Combinable Tables, Curbside Bays & Aggregators
  const uIndoor = randomUUID();
  const uTerrace = randomUUID();
  const qLounge = randomUUID();
  await client.query(
    `INSERT INTO dining_zones (id, restaurant_id, name, name_ar, "order") VALUES
     ($1, $4, 'Indoor Lounge', 'الصالة الداخلية', 0),
     ($2, $4, 'Marina Terrace', 'تراس المارينا', 1),
     ($3, $5, 'Katara Courtyard', 'ساحة كتارا', 0)`,
    [uIndoor, uTerrace, qLounge, urbanCafeId, qCafeId],
  );

  await client.query(
    `INSERT INTO dining_tables (restaurant_id, zone_id, table_code, min_covers, max_covers, is_combinable) VALUES
     ($1, $2, 'T-01', 1, 2, false),
     ($1, $2, 'T-02', 2, 4, true),
     ($1, $2, 'T-03', 2, 4, true),
     ($1, $3, 'TR-01', 2, 6, true),
     ($1, $3, 'TR-02', 2, 6, true),
     ($4, $5, 'K-01', 2, 4, true),
     ($4, $5, 'K-02', 2, 4, true)`,
    [urbanCafeId, uIndoor, uTerrace, qCafeId, qLounge],
  );

  const uBay1 = randomUUID();
  await client.query(
    `INSERT INTO service_bays (id, restaurant_id, code, label, bay_type, "order") VALUES
     ($1, $2, 'BAY-01', 'Marina Gate Curbside 1', 'curbside', 0),
     (gen_random_uuid(), $2, 'BAY-02', 'Marina Gate Curbside 2', 'curbside', 1),
     (gen_random_uuid(), $2, 'LANE-1', 'Express Coffee Window', 'drive_thru', 2),
     (gen_random_uuid(), $3, 'BAY-01', 'Katara Curbside Spot 1', 'curbside', 0),
     (gen_random_uuid(), $3, 'BAY-02', 'Katara Curbside Spot 2', 'curbside', 1)`,
    [uBay1, urbanCafeId, qCafeId],
  );

  await client.query(
    `INSERT INTO aggregator_links (restaurant_id, platform, display_name, url, badge_en, badge_ar, "order") VALUES
     ($1, 'talabat', 'Talabat Qatar', 'https://www.talabat.com/qatar', 'Fastest in Lusail', 'الأسرع في لوسيل', 0),
     ($1, 'snoonu', 'Snoonu', 'https://snoonu.com', 'Qatari Local Favorite', 'توصيل سريع في قطر', 1),
     ($1, 'keeta', 'Keeta Qatar', 'https://www.keeta-global.com/QA/en/wst', 'Free Delivery Promo', 'عرض توصيل مجاني', 2),
     ($2, 'snoonu', 'Snoonu Desserts', 'https://snoonu.com', 'Chilled Express Box', 'توصيل مبرد سريع', 0),
     ($2, 'talabat', 'Talabat Qatar', 'https://www.talabat.com/qatar', 'Katara Kitchen', 'مطبخ كتارا', 1)`,
    [urbanCafeId, qCafeId],
  );

  const today = new Date().toISOString().slice(0, 10);
  await client.query(
    `INSERT INTO pager_tickets (restaurant_id, bay_id, ticket_code, ticket_date, daily_seq, source, status, customer_name, vehicle_color, vehicle_type, license_plate, eta_status, arrived_at, estimated_prep_mins)
     VALUES ($1, $2, 'A-001', $3, 1, 'curbside', 'preparing', 'Jassim', 'White', 'SUV', 'QAT 70412', 'arrived', now(), 7)`,
    [urbanCafeId, uBay1, today],
  );

  await fs.appendFile(
    'CLOUD-ADMIN-CREDENTIALS.txt',
    [
      '',
      'Demo Multi-Branch & Venue Accounts',
      `Urban Café (Tenant Owner + Mode B Pay-at-Venue): urban@dingzi.app / ${demoPass}`,
      `Qstrawberry (Mode C SkipCash Online + Late-Night): qstrawberry@dingzi.app / ${demoPass}`,
      `Live Guest Links: ${guestOrigin}/v/urban-cafe  |  ${guestOrigin}/v/qstrawberry`,
    ].join('\n') + '\n',
  );

  console.log('CLOUD_DEMO_PORTFOLIO_SEEDED:', {
    urbanMenu: `${guestOrigin}/v/urban-cafe`,
    qstrawberryMenu: `${guestOrigin}/v/qstrawberry`,
    photosUploaded: 89,
  });
} finally {
  await client.end();
}
