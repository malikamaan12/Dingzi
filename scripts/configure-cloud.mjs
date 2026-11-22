import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { parse } from 'dotenv';
import { assertNotLegacyValue } from './legacy-guard.mjs';

const filename = '.env.cloud';
if (!fs.existsSync(filename)) {
  const template = fs.readFileSync('.env.cloud.example', 'utf8')
    .replace('SESSION_SECRET=\n', `SESSION_SECRET=${randomBytes(48).toString('hex')}\n`)
    .replace('PASSWORD_SERVICE_SECRET=\n', `PASSWORD_SERVICE_SECRET=${randomBytes(32).toString('hex')}\n`);
  fs.writeFileSync(filename, template, { mode: 0o600, flag: 'wx' });
  console.log('Created private .env.cloud. Fill the NEW Cloudflare & Supabase project fields locally; never paste credentials into chat.');
}

const accountId = process.argv[2];
const hyperdriveId = process.argv[3];
if (accountId || hyperdriveId) {
  if (!/^[a-f0-9]{32}$/.test(accountId || '') || !/^[a-f0-9]{32}$/.test(hyperdriveId || '')) {
    throw new Error('Usage: node scripts/configure-cloud.mjs <NEW_CLOUDFLARE_ACCOUNT_ID> <NEW_HYPERDRIVE_ID>');
  }
  assertNotLegacyValue(accountId, 'CLOUDFLARE_ACCOUNT_ID');
  assertNotLegacyValue(hyperdriveId, 'HYPERDRIVE_ID');
  for (const configFile of ['wrangler.jsonc', 'wrangler.staff.jsonc']) {
    let config = fs.readFileSync(configFile, 'utf8');
    if (config.includes('"account_id"') || config.includes('"hyperdrive"')) {
      throw new Error(`${configFile} already has account_id or hyperdrive configured. Review before changing.`);
    }
    config = config
      .replace('"main": "server/worker.ts",', `"account_id": "${accountId}",\n  "main": "server/worker.ts",`)
      .replace('"workers_dev": true,', `"workers_dev": true,\n  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "${hyperdriveId}" }],`);
    fs.writeFileSync(configFile, config);
  }
  console.log('Bound new Cloudflare account_id and Hyperdrive ID across both Workers. Keep Hyperdrive query caching disabled.');
}

const env = parse(fs.readFileSync(filename));
for (const [k, v] of Object.entries(env)) assertNotLegacyValue(v, k);
const required = ['CLOUDFLARE_ACCOUNT_ID','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','SUPABASE_PROJECT_REF','SESSION_SECRET','PASSWORD_SERVICE_SECRET'];
console.log('Configuration status:', required.map(key => `${key}: ${env[key] && !env[key].includes('YOUR_') ? 'set' : 'missing'}`).join(', '));
