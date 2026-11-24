import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { config } from 'dotenv';
import { unstable_readConfig } from 'wrangler';
import { assertIsolatedCloudEnv, assertNotLegacyValue } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);
fs.mkdirSync('data', { recursive: true });

const env = {
  ...process.env,
  WRANGLER_LOG_PATH: fs.realpathSync('data') + '/wrangler-provision.log',
  WRANGLER_SEND_METRICS: 'false',
};
const ref = env.SUPABASE_PROJECT_REF;
if (!/^[a-z]{20}$/.test(ref || '')) throw new Error('Missing Supabase project reference.');
const db = new URL(env.DATABASE_URL || '');
if (!db.hostname.endsWith('.pooler.supabase.com') || !decodeURIComponent(db.username).endsWith(`.${ref}`)) {
  throw new Error('Database configuration must use the Supabase IPv4 session pooler for this project.');
}

const account = env.CLOUDFLARE_ACCOUNT_ID || unstable_readConfig({ config: 'wrangler.jsonc' }).account_id;
assertNotLegacyValue(account, 'CLOUDFLARE_ACCOUNT_ID');
if (!/^[a-f0-9]{32}$/.test(account || '')) throw new Error('Missing verified Cloudflare account_id.');

const wrangler = 'node_modules/wrangler/bin/wrangler.js';
execFileSync(process.execPath, [wrangler, 'whoami'], { env, stdio: 'pipe' });
const auth = JSON.parse(
  execFileSync(process.execPath, [wrangler, 'auth', 'token', '--json'], { env, encoding: 'utf8', stdio: 'pipe' }),
);
if (!auth.token) throw new Error('Authenticate Wrangler first via npx wrangler login.');

const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/hyperdrive/configs`;
const headers = { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' };
async function call(url, options = {}) {
  const response = await fetch(url, { ...options, headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(
      `Cloudflare Hyperdrive request failed (${response.status}; codes ${(body.errors || []).map(e => e.code).join(',')}).`,
    );
  }
  return body.result;
}

const hyperdriveName = 'dingzi-platform-db';
const poolerHost = db.hostname;
const poolerUser = decodeURIComponent(db.username);

let resource = (await call(endpoint)).find(item => item.name === hyperdriveName);
if (!resource) {
  resource = await call(endpoint, {
    method: 'POST',
    body: JSON.stringify({
      name: hyperdriveName,
      caching: { disabled: true },
      origin_connection_limit: 5,
      origin: {
        host: poolerHost,
        port: Number(db.port || 5432),
        scheme: 'postgresql',
        database: db.pathname.replace(/^\//, '') || 'postgres',
        user: poolerUser,
        password: decodeURIComponent(db.password),
      },
    }),
  });
}

if (
  resource.origin.host !== poolerHost ||
  resource.origin.user !== poolerUser ||
  resource.caching.disabled !== true
) {
  throw new Error('Existing Hyperdrive differs from this project configuration; refusing to overwrite it.');
}

fs.writeFileSync(
  'data/cloud-resources.json',
  JSON.stringify(
    { account, supabaseProject: ref, hyperdrive: resource.id, hyperdriveName: resource.name, poolerHost },
    null,
    2,
  ),
);

const current = fs.readFileSync('wrangler.jsonc', 'utf8');
if (current.includes('"hyperdrive"')) {
  if (unstable_readConfig({ config: 'wrangler.jsonc' }).hyperdrive?.[0]?.id !== resource.id) {
    throw new Error('A different Hyperdrive binding is configured.');
  }
} else {
  execFileSync(process.execPath, ['scripts/configure-cloud.mjs', account, resource.id], { stdio: 'inherit' });
}

console.log(`Dingzi Hyperdrive (${resource.id}) configured against ${poolerHost} with query caching disabled.`);
