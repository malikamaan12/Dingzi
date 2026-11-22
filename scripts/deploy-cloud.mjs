import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { assertIsolatedCloudEnv, assertIsolatedWranglerConfig } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
const env = process.env;
assertIsolatedCloudEnv(env);
const fields = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET','PASSWORD_SERVICE_SECRET'];
if (fields.some(key => !env[key] || env[key].includes('YOUR_'))) throw new Error('Fill private .env.cloud first.');
if (!/^[a-f0-9]{64}$/.test(env.PASSWORD_SERVICE_SECRET) || env.SESSION_SECRET.length < 48) throw new Error('Use the generated independent secrets.');
for (const filename of ['wrangler.staff.jsonc', 'wrangler.jsonc']) {
  const cfg = fs.readFileSync(filename, 'utf8');
  assertIsolatedWranglerConfig(cfg, filename);
  if (!cfg.includes('"hyperdrive"')) throw new Error(`Configure Hyperdrive in ${filename} before publishing.`);
}
// Run Wrangler directly through Node: secret values never enter argv.
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const secretsFile = '.cloud-secrets.json';
if (fs.existsSync(secretsFile)) throw new Error('A temporary Worker secrets file already exists; review it before retrying.');
fs.mkdirSync('data', { recursive: true });
const cliEnv = { ...env, WRANGLER_LOG_PATH: fs.realpathSync('data') + '/wrangler-deploy.log', WRANGLER_SEND_METRICS: 'false' };
for (const key of [...fields,'DATABASE_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_PROJECT_REF']) delete cliEnv[key];
async function run(args, input) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { stdio: ['pipe', 'inherit', 'inherit'], env: cliEnv });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Wrangler ${args[0]} failed`)));
    child.stdin.end(input || '');
  });
}
await run(['whoami']);
fs.writeFileSync(secretsFile, JSON.stringify(Object.fromEntries(fields.map(key => [key, env[key]]))), { flag: 'wx', mode: 0o600 });
try {
  await run(['deploy', '--config', 'wrangler.staff.jsonc', '--secrets-file', secretsFile]);
  await run(['deploy', '--config', 'wrangler.jsonc', '--secrets-file', secretsFile]);
} finally {
  fs.unlinkSync(secretsFile);
}
