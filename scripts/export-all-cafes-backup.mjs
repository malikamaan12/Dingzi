import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { config } from 'dotenv';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);
const bucket = process.env.STORAGE_BUCKET || 'pager-media';
assert.ok(
  process.env.DATABASE_URL && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  'Cloud backup credentials are required locally.',
);

const objectIdFromUrl = (url) => {
  const match = /^\/objects\/([a-f0-9-]{36})$/i.exec(url || '');
  return match?.[1] ?? null;
};

const extensionForMime = (mime) => ({
  'image/avif': 'avif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
}[mime] ?? 'bin');

const mapWithConcurrency = async (values, limit, mapper) => {
  const results = new Array(values.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
};

const sqlLiteral = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return String(value);
  if (value instanceof Date) return `'${value.toISOString().replace('T', ' ').replace('Z', '')}'::timestamp`;
  return `'${String(value).replaceAll("'", "''")}'`;
};

const sqlNumber = (value) => value === null || value === undefined ? 'NULL' : String(value);
const sqlArray = (values) => values === null || values === undefined
  ? 'NULL'
  : `ARRAY[${values.map(sqlLiteral).join(', ')}]::text[]`;
const sqlJson = (value) => value === null || value === undefined ? 'NULL' : `${sqlLiteral(JSON.stringify(value))}::jsonb`;
const sqlInsert = (table, columns, rows, formatter) => rows.length
  ? `\nINSERT INTO dingzi_backup.${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES\n${rows.map((row) => `  (${columns.map((column) => formatter(row, column)).join(', ')})`).join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`
  : '';

const databaseSchemaSql = `-- Dingzi Hospitality Platform portable recovery schema and data export.
-- Intentionally excludes user accounts, passwords, sessions, audit logs, payment vault secrets,
-- VAPID keys, push subscriptions, and billing records per PRD §6.4.
CREATE SCHEMA IF NOT EXISTS dingzi_backup;

CREATE TABLE IF NOT EXISTS dingzi_backup.tenants (
  id varchar PRIMARY KEY, name text NOT NULL, slug varchar(120), created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.restaurants (
  id varchar PRIMARY KEY, user_id varchar NOT NULL, tenant_id varchar, name text NOT NULL,
  slug varchar(120), theme text NOT NULL, brand_accent_hex varchar(7),
  currency varchar NOT NULL, timezone text NOT NULL, logo_url text, cover_media_url text,
  cover_media_type varchar, cuisine_type text, address text, phone varchar, opening_hours text,
  open_time varchar(5), close_time varchar(5), ordering_mode varchar(40), payment_gateway varchar(40),
  google_maps_review_url text, reservations_enabled boolean, waitlist_enabled boolean,
  drive_thru_enabled boolean, pager_mini_game_enabled boolean, slot_interval_mins integer,
  default_turn_duration_mins integer, reservation_deposit_amount numeric(10,2),
  status varchar NOT NULL, hidden boolean NOT NULL, created_at timestamp, updated_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.categories (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, title text NOT NULL,
  is_visible boolean NOT NULL, available_from varchar(5), available_until varchar(5),
  "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.menu_items (
  id varchar PRIMARY KEY, category_id varchar NOT NULL, name text NOT NULL, description text,
  price numeric(10,2) NOT NULL, discount numeric(5,2), unit text NOT NULL, image_url text,
  is_available boolean NOT NULL, special_date varchar, has_multiple_pricing boolean NOT NULL,
  tags text[] NOT NULL, allergen_tags text[] NOT NULL, prep_time_mins integer NOT NULL,
  aggregator_overrides jsonb NOT NULL, "order" integer NOT NULL,
  created_at timestamp, updated_at timestamp, modifier_groups jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS dingzi_backup.menu_item_price_variants (
  id varchar PRIMARY KEY, menu_item_id varchar NOT NULL, label text NOT NULL,
  price numeric(10,2) NOT NULL, discount numeric(5,2), unit text NOT NULL,
  "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.dining_zones (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, name text NOT NULL,
  name_ar text, "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.dining_tables (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, zone_id varchar NOT NULL,
  table_code varchar(40) NOT NULL, min_covers integer NOT NULL, max_covers integer NOT NULL,
  is_combinable boolean NOT NULL, is_active boolean NOT NULL, qr_token varchar NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.service_bays (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, code varchar(40) NOT NULL,
  label text NOT NULL, bay_type varchar(20) NOT NULL, qr_token varchar NOT NULL,
  is_active boolean NOT NULL, "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.aggregator_links (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, platform varchar(40) NOT NULL,
  display_name text NOT NULL, url text NOT NULL, badge_en varchar(80), badge_ar varchar(80),
  is_active boolean NOT NULL, "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.smart_tags (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, token varchar NOT NULL,
  tag_code varchar(40) NOT NULL, label text NOT NULL, hardware_kind varchar(24) NOT NULL,
  target_type varchar(32) NOT NULL, table_id varchar, bay_id varchar,
  is_active boolean NOT NULL, qr_scans integer NOT NULL, nfc_taps integer NOT NULL,
  last_scanned_at timestamp, created_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.global_menu_items (
  id varchar PRIMARY KEY, source_item_id varchar, source_cafe text NOT NULL, currency varchar NOT NULL,
  category_title text NOT NULL, name text NOT NULL, description text, price numeric(10,2) NOT NULL,
  unit text NOT NULL, image_url text, source_image_url text, tags text[] NOT NULL,
  allergen_tags text[] NOT NULL, prep_time_mins integer NOT NULL,
  variants jsonb NOT NULL, modifier_groups jsonb NOT NULL, archived boolean NOT NULL,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE IF NOT EXISTS dingzi_backup.media_objects (
  id varchar PRIMARY KEY, owner_id varchar NOT NULL, mime text NOT NULL, size integer NOT NULL,
  created_at timestamp, filename text NOT NULL, sha256 varchar(64) NOT NULL
);
`;

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const folder = path.resolve('data', 'downloads', `dingzi-portfolio-backup-${stamp}`);
const mediaFolder = path.join(folder, 'media');
await fs.mkdir(mediaFolder, { recursive: true });

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tenants = (await client.query('SELECT id, name, slug, created_at FROM tenants ORDER BY created_at, id')).rows;
  const restaurants = (await client.query('SELECT * FROM restaurants ORDER BY created_at, id')).rows;
  assert.ok(restaurants.length, 'No cafés were found.');
  const restaurantIds = restaurants.map(({ id }) => id);
  const categories = (await client.query('SELECT * FROM categories WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, "order", id', [restaurantIds])).rows;
  const items = (await client.query(`
    SELECT m.* FROM menu_items m
    INNER JOIN categories c ON c.id = m.category_id
    WHERE c.restaurant_id = ANY($1)
    ORDER BY c.restaurant_id, m."order", m.id
  `, [restaurantIds])).rows;
  const itemIds = items.map(({ id }) => id);
  const variants = itemIds.length
    ? (await client.query('SELECT * FROM menu_item_price_variants WHERE menu_item_id = ANY($1) ORDER BY menu_item_id, "order", id', [itemIds])).rows
    : [];
  const diningZones = (await client.query('SELECT * FROM dining_zones WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, "order", id', [restaurantIds])).rows;
  const diningTables = (await client.query('SELECT * FROM dining_tables WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, table_code, id', [restaurantIds])).rows;
  const serviceBays = (await client.query('SELECT * FROM service_bays WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, "order", id', [restaurantIds])).rows;
  const aggregatorLinks = (await client.query('SELECT * FROM aggregator_links WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, "order", id', [restaurantIds])).rows;
  const smartTags = (await client.query('SELECT id, restaurant_id, token, tag_code, label, hardware_kind, target_type, table_id, bay_id, is_active, qr_scans, nfc_taps, last_scanned_at, created_at FROM smart_tags WHERE restaurant_id = ANY($1) ORDER BY restaurant_id, tag_code, id', [restaurantIds])).rows;
  const globalMenuItems = (await client.query(`
    SELECT id, source_item_id, source_cafe, currency, category_title, name, description,
      price, unit, image_url, source_image_url, tags, allergen_tags, prep_time_mins,
      variants, modifier_groups, archived, created_at, updated_at
    FROM global_menu_items
    ORDER BY created_at, id
  `)).rows;

  const mediaUrls = [
    ...restaurants.flatMap(({ logo_url, cover_media_url }) => [logo_url, cover_media_url]),
    ...items.map(({ image_url }) => image_url),
    ...globalMenuItems.flatMap(({ image_url, source_image_url }) => [image_url, source_image_url]),
  ];
  const mediaIds = [...new Set(mediaUrls.map(objectIdFromUrl).filter(Boolean))];
  const mediaRows = mediaIds.length
    ? (await client.query('SELECT id, owner_id, mime, size, created_at FROM media_objects WHERE id = ANY($1) ORDER BY id', [mediaIds])).rows
    : [];
  assert.equal(mediaRows.length, mediaIds.length, 'Every private object referenced by a café must have saved media metadata.');
  await client.query('COMMIT');

  const media = await mapWithConcurrency(mediaRows, 8, async (row) => {
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${row.id}`, {
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `Could not download media ${row.id}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, Number(row.size), `Media ${row.id} has an unexpected size.`);
    const filename = `${row.id}.${extensionForMime(row.mime)}`;
    await fs.writeFile(path.join(mediaFolder, filename), bytes, { mode: 0o600 });
    return { ...row, filename: `media/${filename}`, sha256: createHash('sha256').update(bytes).digest('hex') };
  });

  const cafes = restaurants.map((restaurant) => {
    const branchCats = categories.filter((c) => c.restaurant_id === restaurant.id);
    const branchCatIds = new Set(branchCats.map((c) => c.id));
    const branchItems = items.filter((item) => branchCatIds.has(item.category_id));
    const branchItemIds = new Set(branchItems.map((i) => i.id));
    return {
      restaurant,
      categories: branchCats,
      menuItems: branchItems,
      priceVariants: variants.filter((v) => branchItemIds.has(v.menu_item_id)),
      diningZones: diningZones.filter((z) => z.restaurant_id === restaurant.id),
      diningTables: diningTables.filter((t) => t.restaurant_id === restaurant.id),
      serviceBays: serviceBays.filter((b) => b.restaurant_id === restaurant.id),
      aggregatorLinks: aggregatorLinks.filter((a) => a.restaurant_id === restaurant.id),
      smartTags: smartTags.filter((s) => s.restaurant_id === restaurant.id),
    };
  });

  const snapshot = {
    format: 2,
    platform: 'Dingzi Hospitality Platform',
    exportedAt: new Date().toISOString(),
    scope: 'All tenants, branches, menus, floor tables, curbside bays, aggregator storefronts, shared menu library, and private media. Secrets, accounts, sessions, and payment keys are excluded.',
    tenants,
    cafes,
    sharedMenuLibrary: globalMenuItems,
    media,
  };

  const tenantColumns = ['id', 'name', 'slug', 'created_at'];
  const restaurantColumns = [
    'id', 'user_id', 'tenant_id', 'name', 'slug', 'theme', 'brand_accent_hex',
    'currency', 'timezone', 'logo_url', 'cover_media_url', 'cover_media_type',
    'cuisine_type', 'address', 'phone', 'opening_hours', 'open_time', 'close_time',
    'ordering_mode', 'payment_gateway', 'google_maps_review_url', 'reservations_enabled',
    'waitlist_enabled', 'drive_thru_enabled', 'pager_mini_game_enabled', 'slot_interval_mins',
    'default_turn_duration_mins', 'reservation_deposit_amount', 'status', 'hidden',
    'created_at', 'updated_at',
  ];
  const categoryColumns = ['id', 'restaurant_id', 'title', 'is_visible', 'available_from', 'available_until', 'order', 'created_at'];
  const itemColumns = [
    'id', 'category_id', 'name', 'description', 'price', 'discount', 'unit', 'image_url',
    'is_available', 'special_date', 'has_multiple_pricing', 'tags', 'allergen_tags', 'prep_time_mins',
    'aggregator_overrides', 'order', 'created_at', 'updated_at', 'modifier_groups',
  ];
  const variantColumns = ['id', 'menu_item_id', 'label', 'price', 'discount', 'unit', 'order', 'created_at'];
  const zoneColumns = ['id', 'restaurant_id', 'name', 'name_ar', 'order', 'created_at'];
  const tableColumns = ['id', 'restaurant_id', 'zone_id', 'table_code', 'min_covers', 'max_covers', 'is_combinable', 'is_active', 'qr_token', 'created_at'];
  const bayColumns = ['id', 'restaurant_id', 'code', 'label', 'bay_type', 'qr_token', 'is_active', 'order', 'created_at'];
  const aggColumns = ['id', 'restaurant_id', 'platform', 'display_name', 'url', 'badge_en', 'badge_ar', 'is_active', 'order', 'created_at'];
  const smartTagColumns = ['id', 'restaurant_id', 'token', 'tag_code', 'label', 'hardware_kind', 'target_type', 'table_id', 'bay_id', 'is_active', 'qr_scans', 'nfc_taps', 'last_scanned_at', 'created_at'];
  const libraryColumns = [
    'id', 'source_item_id', 'source_cafe', 'currency', 'category_title', 'name', 'description',
    'price', 'unit', 'image_url', 'source_image_url', 'tags', 'allergen_tags', 'prep_time_mins',
    'variants', 'modifier_groups', 'archived', 'created_at', 'updated_at',
  ];
  const mediaColumns = ['id', 'owner_id', 'mime', 'size', 'created_at', 'filename', 'sha256'];

  const numericCols = new Set([
    'price', 'discount', 'size', 'slot_interval_mins', 'default_turn_duration_mins',
    'reservation_deposit_amount', 'prep_time_mins', 'min_covers', 'max_covers', 'order',
    'qr_scans', 'nfc_taps',
  ]);
  const scalar = (row, column) => numericCols.has(column) ? sqlNumber(row[column]) : sqlLiteral(row[column]);

  const schemaAndData = [
    databaseSchemaSql,
    sqlInsert('tenants', tenantColumns, tenants, scalar),
    sqlInsert('restaurants', restaurantColumns, restaurants, scalar),
    sqlInsert('categories', categoryColumns, categories, scalar),
    sqlInsert('menu_items', itemColumns, items, (row, column) => {
      if (column === 'tags' || column === 'allergen_tags') return sqlArray(row[column]);
      if (column === 'modifier_groups' || column === 'aggregator_overrides') return sqlJson(row[column]);
      return scalar(row, column);
    }),
    sqlInsert('menu_item_price_variants', variantColumns, variants, scalar),
    sqlInsert('dining_zones', zoneColumns, diningZones, scalar),
    sqlInsert('dining_tables', tableColumns, diningTables, scalar),
    sqlInsert('service_bays', bayColumns, serviceBays, scalar),
    sqlInsert('aggregator_links', aggColumns, aggregatorLinks, scalar),
    sqlInsert('smart_tags', smartTagColumns, smartTags, scalar),
    sqlInsert('global_menu_items', libraryColumns, globalMenuItems, (row, column) => {
      if (column === 'tags' || column === 'allergen_tags') return sqlArray(row[column]);
      if (column === 'variants' || column === 'modifier_groups') return sqlJson(row[column]);
      return scalar(row, column);
    }),
    sqlInsert('media_objects', mediaColumns, media, scalar),
  ].join('\n');

  await fs.writeFile(path.join(folder, 'database.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(folder, 'schema-and-data.sql'), schemaAndData, { mode: 0o600 });
  await fs.writeFile(path.join(folder, 'README.txt'), [
    'Dingzi Hospitality Platform — Isolated Portfolio Recovery Export.',
    '',
    'Contains: tenants, branches, categories, menu items, variants, modifiers, dining zones & permanent QR tables, curbside bays, aggregator links, shared menu library, and private media files.',
    'Excluded: user accounts, passwords, sessions, access logs, encrypted payment gateway secrets, VAPID keys, and push subscriptions.',
    '',
    'schema-and-data.sql creates an isolated dingzi_backup PostgreSQL schema.',
    'Keep this archive private.',
    '',
  ].join('\n'), { mode: 0o600 });

  console.log(JSON.stringify({
    folder,
    exportedAt: snapshot.exportedAt,
    tenants: tenants.length,
    cafes: cafes.map(({ restaurant, categories: c, menuItems: m, diningTables: t, serviceBays: b }) => ({
      name: restaurant.name,
      categories: c.length,
      items: m.length,
      tables: t.length,
      bays: b.length,
    })),
    sharedLibraryItems: globalMenuItems.length,
    media: media.length,
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
