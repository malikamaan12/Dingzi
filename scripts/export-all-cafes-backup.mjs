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
  ? `\nINSERT INTO cafe_menu_backup.${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES\n${rows.map((row) => `  (${columns.map((column) => formatter(row, column)).join(', ')})`).join(',\n')}\nON CONFLICT (id) DO NOTHING;\n`
  : '';

const databaseSchemaSql = `-- Café Menu portable recovery schema and data export.
-- This file intentionally excludes user accounts, passwords, sessions, audit logs,
-- payment records, and secrets. It creates an isolated schema so it can be inspected
-- without modifying the production application tables.
CREATE SCHEMA IF NOT EXISTS cafe_menu_backup;

CREATE TABLE IF NOT EXISTS cafe_menu_backup.restaurants (
  id varchar PRIMARY KEY, user_id varchar NOT NULL, name text NOT NULL, theme text NOT NULL,
  currency varchar NOT NULL, timezone text NOT NULL, logo_url text, cover_media_url text,
  cover_media_type varchar, cuisine_type text, address text, phone varchar, opening_hours text,
  qr_code_url text, status varchar NOT NULL, hidden boolean NOT NULL, upi_id text,
  upi_qr_code_url text, active_since timestamp, subscription_status varchar NOT NULL,
  subscription_plan varchar, monthly_fee numeric(10,2), last_payment_date timestamp,
  next_payment_due timestamp, suspension_reason text, created_at timestamp, updated_at timestamp
);
CREATE TABLE IF NOT EXISTS cafe_menu_backup.categories (
  id varchar PRIMARY KEY, restaurant_id varchar NOT NULL, title text NOT NULL,
  "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS cafe_menu_backup.menu_items (
  id varchar PRIMARY KEY, category_id varchar NOT NULL, name text NOT NULL, description text,
  price numeric(10,2) NOT NULL, discount numeric(5,2), unit text NOT NULL, image_url text,
  is_available boolean NOT NULL, special_date varchar, has_multiple_pricing boolean NOT NULL,
  tags text[] NOT NULL, "order" integer NOT NULL, created_at timestamp, updated_at timestamp,
  modifier_groups jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS cafe_menu_backup.menu_item_price_variants (
  id varchar PRIMARY KEY, menu_item_id varchar NOT NULL, label text NOT NULL,
  price numeric(10,2) NOT NULL, discount numeric(5,2), unit text NOT NULL,
  "order" integer NOT NULL, created_at timestamp
);
CREATE TABLE IF NOT EXISTS cafe_menu_backup.global_menu_items (
  id varchar PRIMARY KEY, source_item_id varchar, source_cafe text NOT NULL, currency varchar NOT NULL,
  category_title text NOT NULL, name text NOT NULL, description text, price numeric(10,2) NOT NULL,
  unit text NOT NULL, image_url text, source_image_url text, tags text[] NOT NULL,
  variants jsonb NOT NULL, modifier_groups jsonb NOT NULL, archived boolean NOT NULL,
  created_at timestamp, updated_at timestamp
);
CREATE TABLE IF NOT EXISTS cafe_menu_backup.media_objects (
  id varchar PRIMARY KEY, owner_id varchar NOT NULL, mime text NOT NULL, size integer NOT NULL,
  created_at timestamp, filename text NOT NULL, sha256 varchar(64) NOT NULL
);
`;

const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const folder = path.resolve('data', 'downloads', `all-cafes-backup-${stamp}`);
const mediaFolder = path.join(folder, 'media');
await fs.mkdir(mediaFolder, { recursive: true });

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
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
  const globalMenuItems = (await client.query(`
    SELECT id, source_item_id, source_cafe, currency, category_title, name, description,
      price, unit, image_url, source_image_url, tags, variants, modifier_groups, archived,
      created_at, updated_at
    FROM global_menu_items
    ORDER BY created_at, id
  `)).rows;

  const mediaUrls = [
    ...restaurants.flatMap(({ logo_url, cover_media_url, upi_qr_code_url }) => [logo_url, cover_media_url, upi_qr_code_url]),
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

  const cafes = restaurants.map((restaurant) => ({
    restaurant,
    categories: categories.filter((category) => category.restaurant_id === restaurant.id),
    menuItems: items.filter((item) => categories.some((category) => category.id === item.category_id && category.restaurant_id === restaurant.id)),
  })).map((cafe) => ({
    ...cafe,
    priceVariants: variants.filter((variant) => cafe.menuItems.some((item) => item.id === variant.menu_item_id)),
  }));

  const snapshot = {
    format: 1,
    exportedAt: new Date().toISOString(),
    scope: 'All cafés and the shared menu library. User accounts, passwords, sessions, audit logs, payment records, and platform secrets are intentionally excluded.',
    cafes,
    sharedMenuLibrary: globalMenuItems,
    media,
  };
  const restaurantColumns = [
    'id', 'user_id', 'name', 'theme', 'currency', 'timezone', 'logo_url', 'cover_media_url',
    'cover_media_type', 'cuisine_type', 'address', 'phone', 'opening_hours', 'qr_code_url',
    'status', 'hidden', 'upi_id', 'upi_qr_code_url', 'active_since', 'subscription_status',
    'subscription_plan', 'monthly_fee', 'last_payment_date', 'next_payment_due',
    'suspension_reason', 'created_at', 'updated_at',
  ];
  const categoryColumns = ['id', 'restaurant_id', 'title', 'order', 'created_at'];
  const itemColumns = [
    'id', 'category_id', 'name', 'description', 'price', 'discount', 'unit', 'image_url',
    'is_available', 'special_date', 'has_multiple_pricing', 'tags', 'order', 'created_at',
    'updated_at', 'modifier_groups',
  ];
  const variantColumns = ['id', 'menu_item_id', 'label', 'price', 'discount', 'unit', 'order', 'created_at'];
  const libraryColumns = [
    'id', 'source_item_id', 'source_cafe', 'currency', 'category_title', 'name', 'description',
    'price', 'unit', 'image_url', 'source_image_url', 'tags', 'variants', 'modifier_groups',
    'archived', 'created_at', 'updated_at',
  ];
  const mediaColumns = ['id', 'owner_id', 'mime', 'size', 'created_at', 'filename', 'sha256'];
  const scalar = (row, column) => ['price', 'discount', 'monthly_fee', 'size'].includes(column)
    ? sqlNumber(row[column])
    : sqlLiteral(row[column]);
  const schemaAndData = [
    databaseSchemaSql,
    sqlInsert('restaurants', restaurantColumns, restaurants, scalar),
    sqlInsert('categories', categoryColumns, categories, scalar),
    sqlInsert('menu_items', itemColumns, items, (row, column) => {
      if (column === 'tags') return sqlArray(row[column]);
      if (column === 'modifier_groups') return sqlJson(row[column]);
      return scalar(row, column);
    }),
    sqlInsert('menu_item_price_variants', variantColumns, variants, scalar),
    sqlInsert('global_menu_items', libraryColumns, globalMenuItems, (row, column) => {
      if (column === 'tags') return sqlArray(row[column]);
      if (column === 'variants' || column === 'modifier_groups') return sqlJson(row[column]);
      return scalar(row, column);
    }),
    sqlInsert('media_objects', mediaColumns, media, scalar),
  ].join('\n');
  await fs.writeFile(path.join(folder, 'database.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(folder, 'schema-and-data.sql'), schemaAndData, { mode: 0o600 });
  await fs.writeFile(path.join(folder, 'README.txt'), [
    'All-cafes recovery export.',
    '',
    'Contains: each café profile, categories, menu items, price variants, modifier/topping configurations, the shared menu library, and referenced private media files.',
    'Excluded: user accounts, passwords, sessions, access logs, payment records, and platform secrets.',
    '',
    'schema-and-data.sql creates a separate cafe_menu_backup PostgreSQL schema containing the exported records. The media objects table maps each record to its matching file in media/.',
    'Restore order: restaurant, categories, menu items, price variants, shared menu library, then media objects/files. Assign each restored restaurant to an authorized manager account during recovery.',
    'Keep this archive private.',
    '',
  ].join('\n'), { mode: 0o600 });
  console.log(JSON.stringify({
    folder,
    exportedAt: snapshot.exportedAt,
    cafes: cafes.map(({ restaurant, categories: cafeCategories, menuItems, priceVariants }) => ({
      name: restaurant.name,
      categories: cafeCategories.length,
      items: menuItems.length,
      variants: priceVariants.length,
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
