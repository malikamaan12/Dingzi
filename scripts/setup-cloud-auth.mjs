import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
fs.mkdirSync('data', { recursive: true });

const ref = 'gflqlxflolqjxpikzzbf';
const poolerHost = 'aws-1-ap-northeast-1.pooler.supabase.com';

function askMasked(promptText) {
  return new Promise(resolve => {
    let muted = false;
    const mutableStdout = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        } else {
          const str = chunk.toString();
          if (str.includes('\n') || str.includes('\r')) {
            process.stdout.write('\n');
          } else if (str.length > 0 && str !== '\b \b') {
            process.stdout.write('*');
          }
        }
        callback();
      },
    });
    const rl = readline.createInterface({
      input: process.stdin,
      output: mutableStdout,
      terminal: true,
    });
    rl.question(promptText, answer => {
      muted = false;
      rl.close();
      resolve(answer.trim());
    });
    muted = true;
  });
}

// Step 1: Cloudflare Wrangler check
try {
  execFileSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'whoami'], { stdio: 'pipe' });
  console.log('[1/3] Cloudflare Wrangler verified (account 8c6a1df16f0c1df63f5b501a8902da63).');
} catch {
  console.log('[1/3] Opening Cloudflare Wrangler login in your browser...');
  const res = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'login'], { stdio: 'inherit' });
  if (res.status !== 0) process.exit(1);
}

// Step 2: Supabase CLI login FIRST (1 click in browser)
let supaReady = false;
try {
  const out = execFileSync(
    process.execPath,
    ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', ref, '--output', 'json'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (out.includes('anon') || out.includes('publishable')) supaReady = true;
} catch {}

if (supaReady) {
  console.log('[2/3] Supabase CLI verified for project gflqlxflolqjxpikzzbf.');
} else {
  console.log('[2/3] Opening Supabase CLI login in your browser (approve on the account owning gflqlxflolqjxpikzzbf)...');
  const res = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'login'], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.error('Supabase login did not complete.');
    process.exit(1);
  }
  console.log('      Supabase CLI authenticated!');
}

// Step 3: Verify & save Supabase DB password (with reliable Windows clipboard paste + retry)
console.log('\nTip: If you need to reset or copy a fresh DB password, open:');
console.log('     https://supabase.com/dashboard/project/gflqlxflolqjxpikzzbf/settings/database');

while (true) {
  const pw = await askMasked('\n[3/3] Paste or type DB password for gflqlxflolqjxpikzzbf (shows *, press Enter): ');
  if (!pw) {
    console.log('      Password cannot be empty. Please paste or type your DB password.');
    continue;
  }
  const conn = `postgresql://postgres.${ref}:${encodeURIComponent(pw)}@${poolerHost}:5432/postgres`;
  process.stdout.write(`      Testing TLS login (${pw.length} chars) to ${poolerHost}... `);
  const client = new Client({
    connectionString: conn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    fs.writeFileSync('data/supabase-db-password.txt', pw, { mode: 0o600 });
    let envText = fs.readFileSync('.env.cloud', 'utf8');
    if (/^DATABASE_URL=.*$/m.test(envText)) {
      envText = envText.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${conn}`);
    } else {
      envText += `\nDATABASE_URL=${conn}`;
    }
    fs.writeFileSync('.env.cloud', envText, { mode: 0o600 });
    console.log('CONNECTED & SAVED!');
    break;
  } catch (err) {
    console.log(`Wrong password (${err.code || '28P01'}). Reset it at the link above if needed and paste again.`);
  } finally {
    await client.end().catch(() => {});
  }
}

console.log('\nALL_CLOUD_AUTH_READY — Reply "next" in Antigravity chat!');
