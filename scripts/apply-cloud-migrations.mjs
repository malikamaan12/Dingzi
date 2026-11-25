import { config } from 'dotenv';
import { Client, types } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);
process.env.TZ = 'UTC';
types.setTypeParser(1114, value => new Date(value + 'Z'));

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in .env.cloud');
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
await client.connect();

try {
  console.log('1/3 Applying Drizzle migrations (0000..0011) to isolated Dingzi Supabase Postgres...');
  await migrate(drizzle(client), { migrationsFolder: 'migrations' });

  console.log('2/3 Enforcing Row-Level Security & server policy on smart_tags...');
  await client.query(`
    ALTER TABLE public.smart_tags ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public.smart_tags FROM anon, authenticated;
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dingzi_app') THEN
        GRANT ALL ON TABLE public.smart_tags TO dingzi_app;
        DROP POLICY IF EXISTS dingzi_server_access ON public.smart_tags;
        CREATE POLICY dingzi_server_access ON public.smart_tags FOR ALL TO dingzi_app USING (true) WITH CHECK (true);
      END IF;
    END $$;
  `);

  console.log('3/3 Provisioning reusable NFC/QR coasters (COASTER-01..COASTER-05) on Urban Café & Qstrawberry...');
  const { rows: cafes } = await client.query(
    `SELECT id, name, slug FROM restaurants WHERE slug IN ('urban-cafe', 'qstrawberry') ORDER BY name`,
  );
  for (const cafe of cafes) {
    for (let i = 1; i <= 5; i++) {
      const code = `COASTER-${String(i).padStart(2, '0')}`;
      const label = `Reusable Pager Coaster #${String(i).padStart(2, '0')}`;
      await client.query(
        `INSERT INTO smart_tags (restaurant_id, tag_code, label, hardware_kind, target_type)
         VALUES ($1::varchar, $2::varchar, $3::text, 'coaster_puck', 'reusable_pager')
         ON CONFLICT ("restaurant_id", upper("tag_code")) DO NOTHING`,
        [cafe.id, code, label],
      );
    }
  }

  const { rows: counts } = await client.query(
    `SELECT count(*)::int AS total_tags FROM smart_tags`,
  );
  console.log(`PASS: Supabase migrations & RLS applied. Total smart_tags in portfolio: ${counts[0].total_tags}`);
} finally {
  await client.end();
}
