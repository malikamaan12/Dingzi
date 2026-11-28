import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

assertIsolatedCloudEnv(process.env);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required (pass --env-file=.env.cloud)');
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: 'migrations' });
  const cols = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'restaurants' AND column_name IN ('name_ar', 'venue_config'))
        OR (table_name = 'categories' AND column_name IN ('title_ar', 'menu_group'))
        OR (table_name = 'menu_items' AND column_name IN ('name_ar', 'description_ar'))
        OR (table_name = 'menu_item_price_variants' AND column_name = 'label_ar')
      )
    ORDER BY table_name, column_name
  `);
  if (cols.rows.length !== 7) {
    throw new Error(`Expected 7 dynamic config columns on Supabase, found ${cols.rows.length}`);
  }
  console.log(`PASS: Applied Drizzle migrations to Supabase Dingzi (${cols.rows.length}/7 new columns verified).`);
} finally {
  await client.end();
}
