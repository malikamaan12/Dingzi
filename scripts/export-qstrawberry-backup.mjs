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
assert.ok(process.env.DATABASE_URL && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Cloud backup credentials are required locally.');
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const folder = path.resolve('data', 'downloads', `qstrawberry-menu-backup-${stamp}`);
const mediaFolder = path.join(folder, 'media');
await fs.mkdir(mediaFolder, { recursive: true });
const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const cafeResult = await client.query("SELECT * FROM restaurants WHERE lower(btrim(name)) = 'qstrawberry' LIMIT 1");
  const cafe = cafeResult.rows[0];
  assert.ok(cafe, 'Qstrawberry café was not found.');
  const categories = (await client.query('SELECT * FROM categories WHERE restaurant_id = $1 ORDER BY "order", id', [cafe.id])).rows;
  const items = (await client.query('SELECT m.* FROM menu_items m INNER JOIN categories c ON c.id = m.category_id WHERE c.restaurant_id = $1 ORDER BY m."order", m.id', [cafe.id])).rows;
  const ids = items.map(item => item.id);
  const variants = ids.length ? (await client.query('SELECT * FROM menu_item_price_variants WHERE menu_item_id = ANY($1) ORDER BY "order", id', [ids])).rows : [];
  const mediaIds = [...new Set(items.map(item => item.image_url).filter(url => /^\/objects\/[a-f0-9-]{36}$/.test(url || '')).map(url => url.slice('/objects/'.length)))];
  const mediaRows = mediaIds.length ? (await client.query('SELECT id, owner_id, mime, size, created_at FROM media_objects WHERE id = ANY($1) ORDER BY id', [mediaIds])).rows : [];
  assert.equal(mediaRows.length, mediaIds.length, 'Every Qstrawberry item image must have saved media metadata.');
  await client.query('COMMIT');
  const media = [];
  for (const row of mediaRows) {
    const response = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/authenticated/${bucket}/${row.id}`, {
      headers: { Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, apikey: process.env.SUPABASE_SERVICE_ROLE_KEY }, signal: AbortSignal.timeout(30_000),
    });
    assert.ok(response.ok, `Could not download photo ${row.id}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, Number(row.size), `Photo ${row.id} has an unexpected size.`);
    const filename = `${row.id}.${row.mime === 'image/webp' ? 'webp' : row.mime === 'image/png' ? 'png' : row.mime === 'image/jpeg' ? 'jpg' : 'bin'}`;
    await fs.writeFile(path.join(mediaFolder, filename), bytes, { mode: 0o600 });
    media.push({ ...row, filename: `media/${filename}`, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  const snapshot = { format: 1, exportedAt: new Date().toISOString(), scope: 'Qstrawberry café only', restaurant: cafe, categories, menuItems: items, priceVariants: variants, media };
  await fs.writeFile(path.join(folder, 'database.json'), JSON.stringify(snapshot, null, 2), { mode: 0o600 });
  await fs.writeFile(path.join(folder, 'README.txt'), 'Qstrawberry café recovery export. Contains the restaurant profile, categories, menu items, price variants and each item photo. It intentionally excludes user accounts, passwords, sessions, other cafés, global library templates and platform secrets. Keep this archive private. Restore relational records in this order: restaurant, categories, menu items, price variants, media objects/files.\n', { mode: 0o600 });
  console.log(JSON.stringify({ folder, exportedAt: snapshot.exportedAt, categories: categories.length, items: items.length, variants: variants.length, photos: media.length }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  await client.end();
}
