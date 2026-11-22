// Hard boundary preventing accidental deployment, migration, or backup against
// the legacy Cafe Menu production accounts, databases, or Worker origins.
export const LEGACY_CLOUDFLARE_ACCOUNT_ID = '69e2ef22efdd52ebbc1aefc3d8aa8980';
export const LEGACY_HYPERDRIVE_ID = '2c0378c020ab47479092cbc19fa3c95e';
export const LEGACY_SUPABASE_PROJECT_REF = 'kfxdazzbnbbhzbkplpqf';
export const LEGACY_WORKER_DOMAIN = 'cafe-menu.workers.dev';

export function assertNotLegacyValue(value, label = 'Configuration value') {
  const text = String(value || '');
  if (
    text.includes(LEGACY_CLOUDFLARE_ACCOUNT_ID) ||
    text.includes(LEGACY_HYPERDRIVE_ID) ||
    text.includes(LEGACY_SUPABASE_PROJECT_REF) ||
    text.toLowerCase().includes(LEGACY_WORKER_DOMAIN)
  ) {
    throw new Error(
      `${label} points to the legacy Cafe Menu environment. Use a separate Cloudflare account, Supabase project, and domain for this application.`,
    );
  }
}

export function assertIsolatedCloudEnv(env = process.env) {
  for (const key of [
    'CLOUDFLARE_ACCOUNT_ID',
    'SUPABASE_PROJECT_REF',
    'SUPABASE_URL',
    'DATABASE_URL',
    'PUBLIC_MENU_ORIGIN',
    'MANAGEMENT_ORIGIN',
    'CAFE_MENU_URL',
    'CAFE_STAFF_URL',
  ]) {
    if (env[key]) assertNotLegacyValue(env[key], key);
  }
  if (!/^[a-z]{20}$/.test(env.SUPABASE_PROJECT_REF || '')) {
    throw new Error('Configure a new dedicated SUPABASE_PROJECT_REF in .env.cloud.');
  }
}

export function assertIsolatedWranglerConfig(configText, filename = 'wrangler.jsonc') {
  assertNotLegacyValue(configText, filename);
  if (!configText.includes('"preview_urls": false')) {
    throw new Error(`${filename} must keep preview_urls disabled.`);
  }
  const accountMatch = configText.match(/"account_id"\s*:\s*"([a-f0-9]{32})"/);
  if (!accountMatch) {
    throw new Error(
      `${filename} has no account_id configured yet. Run: node scripts/configure-cloud.mjs <NEW_CLOUDFLARE_ACCOUNT_ID> <NEW_HYPERDRIVE_ID>`,
    );
  }
}
