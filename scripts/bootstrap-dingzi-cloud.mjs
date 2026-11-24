import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { config, parse } from 'dotenv';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import bcrypt from 'bcrypt';
import { assertIsolatedCloudEnv, assertNotLegacyValue } from './legacy-guard.mjs';

const POOLER_HOST = process.env.SUPABASE_POOLER_HOST || 'aws-1-ap-northeast-1.pooler.supabase.com';
const envFile = '.env.cloud';
let envText = fs.readFileSync(envFile, 'utf8');
let parsed = parse(envText);

const ref = parsed.SUPABASE_PROJECT_REF;
assertNotLegacyValue(ref, 'SUPABASE_PROJECT_REF');
if (!/^[a-z]{20}$/.test(ref || '')) throw new Error('SUPABASE_PROJECT_REF is missing in .env.cloud.');

function upsertEnvField(key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(envText)) envText = envText.replace(re, `${key}=${value}`);
  else envText += `\n${key}=${value}`;
  fs.writeFileSync(envFile, envText, { mode: 0o600 });
  parsed = parse(envText);
}

fs.mkdirSync('data', { recursive: true });

// 1. Provision dedicated 256-bit random Postgres login role `dingzi_app` via authenticated Supabase Management API if DATABASE_URL is missing
if (!parsed.DATABASE_URL) {
  console.log('0/5 Provisioning dedicated dingzi_app database role on Supabase...');
  const appPass = 'Dz_' + randomBytes(24).toString('base64url');
  const sqlFile = 'data/.init-role.sql';
  const roleSql = [
    'DO $body$',
    'BEGIN',
    "  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dingzi_app') THEN",
    `    CREATE ROLE dingzi_app WITH LOGIN CREATEDB PASSWORD '${appPass}';`,
    '  ELSE',
    `    ALTER ROLE dingzi_app WITH LOGIN CREATEDB PASSWORD '${appPass}';`,
    '  END IF;',
    'END',
    '$body$;',
    'GRANT ALL ON SCHEMA public TO dingzi_app;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO dingzi_app;',
    'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO dingzi_app;',
  ].join('\n');
  fs.writeFileSync(sqlFile, roleSql, { mode: 0o600 });
  try {
    execFileSync(
      process.execPath,
      ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--project-ref', ref, '--file', sqlFile],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } finally {
    fs.unlinkSync(sqlFile);
  }
  const conn = `postgresql://dingzi_app.${ref}:${encodeURIComponent(appPass)}@${POOLER_HOST}:5432/postgres`;
  upsertEnvField('DATABASE_URL', conn);
  console.log('    Dedicated dingzi_app role created and saved privately to .env.cloud.');
}

// 2. Fetch SUPABASE_SERVICE_ROLE_KEY via authenticated Supabase CLI if not already set
if (!parsed.SUPABASE_SERVICE_ROLE_KEY) {
  const rawKeys = execFileSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const keys = JSON.parse(rawKeys);
  const serviceKey =
    keys.find(k => k.name === 'service_role')?.api_key ||
    keys.find(k => typeof k.api_key === 'string' && k.api_key.startsWith('eyJ') && k.name !== 'anon')?.api_key ||
    keys.find(k => k.type === 'secret' || String(k.api_key || '').startsWith('sb_secret_'))?.api_key;
  if (!serviceKey) throw new Error('Could not resolve service_role API key from Supabase CLI.');
  upsertEnvField('SUPABASE_SERVICE_ROLE_KEY', serviceKey);
}

config({ path: envFile, override: true, quiet: true });
assertIsolatedCloudEnv(process.env);

// 3. Connect to Supabase Postgres over IPv4 Session Pooler, run all Drizzle migrations (0000..0009), apply RLS + pager-media bucket, and ensure super_admin exists
console.log('1/5 Connecting to Supabase Postgres pooler & applying migrations 0000..0009 + RLS...');
execFileSync(
  process.execPath,
  [
    'node_modules/supabase/dist/supabase.js',
    'db',
    'query',
    '--linked',
    '--project-ref',
    ref,
    'GRANT CREATE ON DATABASE postgres TO dingzi_app; CREATE SCHEMA IF NOT EXISTS drizzle; GRANT ALL ON SCHEMA public TO dingzi_app; GRANT ALL ON SCHEMA drizzle TO dingzi_app;',
  ],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});
await client.connect();
try {
  await migrate(drizzle(client), { migrationsFolder: 'migrations' });
  execFileSync(
    process.execPath,
    [
      'node_modules/supabase/dist/supabase.js',
      'db',
      'query',
      '--linked',
      '--project-ref',
      ref,
      'GRANT dingzi_app TO postgres;',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );
  execFileSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--project-ref', ref, '--file', 'deployment/supabase-security.sql'],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const admins = await client.query("SELECT email FROM users WHERE role = 'super_admin' LIMIT 1");
  if (admins.rows.length === 0) {
    const email = 'admin@dingzi.app';
    const plainPassword = 'Dingzi-' + randomBytes(12).toString('base64url');
    const hashed = await bcrypt.hash(plainPassword, 12);
    await client.query(
      "INSERT INTO users (email, password, first_name, last_name, role, account_status) VALUES ($1, $2, 'Dingzi', 'Admin', 'super_admin', 'active')",
      [email, hashed],
    );
    fs.writeFileSync(
      'CLOUD-ADMIN-CREDENTIALS.txt',
      [
        'Dingzi Cloud Platform Super Admin',
        `Management URL: ${process.env.MANAGEMENT_ORIGIN}/login`,
        `Public Menu URL: ${process.env.PUBLIC_MENU_ORIGIN}`,
        `Email: ${email}`,
        `Password: ${plainPassword}`,
        '',
        'Keep this file private (excluded by .gitignore). Change password after first sign-in.',
      ].join('\n') + '\n',
      { mode: 0o600 },
    );
    console.log('    Provisioned initial Super Admin -> saved privately to CLOUD-ADMIN-CREDENTIALS.txt');
  } else {
    console.log(`    Existing Super Admin preserved (${admins.rows[0].email})`);
  }
} finally {
  await client.end();
}

// 4. Deploy cafe-passwords Edge Function to Supabase
console.log('2/5 Deploying cafe-passwords Edge Function to Supabase...');
execFileSync(process.execPath, ['scripts/deploy-supabase-function.mjs'], { stdio: 'inherit' });

// 5. Provision Cloudflare Hyperdrive & bind wrangler.jsonc / wrangler.staff.jsonc
console.log('3/5 Provisioning Cloudflare Hyperdrive & binding Worker configs...');
execFileSync(process.execPath, ['scripts/provision-hyperdrive.mjs'], { stdio: 'inherit' });

// 6. Build frontend SPA with split cloud origins
console.log('4/5 Building production SPA bundle for dingzi-menu & dingzi-staff...');
execFileSync('npx.cmd', ['vite', 'build'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    VITE_PUBLIC_MENU_ORIGIN: process.env.PUBLIC_MENU_ORIGIN,
    VITE_MANAGEMENT_ORIGIN: process.env.MANAGEMENT_ORIGIN,
  },
});

// 7. Deploy both Cloudflare Workers (dingzi-staff & dingzi-menu) with encrypted secrets
console.log('5/5 Deploying dingzi-staff & dingzi-menu Workers to Cloudflare...');
execFileSync(process.execPath, ['scripts/deploy-cloud.mjs'], { stdio: 'inherit' });

console.log('CLOUD_DEPLOYMENT_COMPLETE');
