import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { assertIsolatedCloudEnv } from './legacy-guard.mjs';

config({ path: '.env.cloud', quiet: true });
assertIsolatedCloudEnv(process.env);
const env = { ...process.env };
if (env.SUPABASE_ACCESS_TOKEN && !env.SUPABASE_ACCESS_TOKEN.startsWith('sbp_')) {
  delete env.SUPABASE_ACCESS_TOKEN;
}
if (!/^[a-z]{20}$/.test(env.SUPABASE_PROJECT_REF || '')) {
  throw new Error('Configure SUPABASE_PROJECT_REF in .env.cloud first.');
}
if (!/^[a-f0-9]{64}$/.test(env.PASSWORD_SERVICE_SECRET || '')) {
  throw new Error('Missing independent password-service secret.');
}

const secretsFile = '.env.cafe-function';
if (fs.existsSync(secretsFile)) {
  throw new Error('A temporary function secret file already exists; review it before retrying.');
}

async function run(args) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], {
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    child.on('error', reject);
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`Supabase ${args[0]} failed`))));
  });
}

fs.writeFileSync(secretsFile, `PASSWORD_SERVICE_SECRET=${env.PASSWORD_SERVICE_SECRET}\n`, { flag: 'wx', mode: 0o600 });
try {
  await run(['secrets', 'set', '--project-ref', env.SUPABASE_PROJECT_REF, '--env-file', secretsFile]);
  await run(['functions', 'deploy', 'cafe-passwords', '--project-ref', env.SUPABASE_PROJECT_REF, '--no-verify-jwt', '--use-api']);
} finally {
  fs.unlinkSync(secretsFile);
}
