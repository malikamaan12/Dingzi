# Isolated Cloud Deployment & Provisioning Guide

## Strict Separation Rule

This project **must** be deployed to its own **separate Cloudflare account**, **separate GitHub repository**, and **separate Supabase PostgreSQL project**. `scripts/legacy-guard.mjs` actively rejects any legacy Cafe Menu Cloudflare account ID, Hyperdrive ID, Supabase project ref, or `*.cafe-menu.workers.dev` origin.

## Target Cloud Topology (New Accounts Only)

- **Public Guest Worker (`wrangler.jsonc`):** `pager-menu` (`APPLICATION_SURFACE = "public"`)
- **Staff & Admin Worker (`wrangler.staff.jsonc`):** `pager-staff` (`APPLICATION_SURFACE = "management"`)
- **Database:** New dedicated Supabase PostgreSQL project + Cloudflare Hyperdrive (`pager-platform-db`, query caching **disabled**)
- **Media Storage:** Private Supabase Storage bucket `pager-media` (provisioned via `deployment/supabase-security.sql`)

## Step-by-Step Setup on New Accounts

1. **Generate private `.env.cloud` and independent secrets:**
   ```powershell
   npm run cloud:configure
   ```
2. **Fill `.env.cloud` locally** (never commit or paste secrets into chat):
   - `CLOUDFLARE_ACCOUNT_ID` — 32-hex ID of the **new** Cloudflare account
   - `SUPABASE_PROJECT_REF` — 20-char ref of the **new** Supabase project
   - `SUPABASE_URL` — `https://<NEW_PROJECT_REF>.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` — service role key of the **new** Supabase project
   - `DATABASE_URL` — session pooler TLS connection string (`node scripts/configure-supabase-database.mjs <pooler-host>`)
   - `PUBLIC_MENU_ORIGIN` / `MANAGEMENT_ORIGIN` — new Worker or custom domain URLs
3. **Provision Hyperdrive & bind Wrangler configs:**
   ```powershell
   npx wrangler login   # Authenticate into the NEW Cloudflare account
   npx wrangler whoami  # Confirm the NEW account is selected
   node scripts/provision-hyperdrive.mjs
   ```
4. **Deploy private password function & schema to the new Supabase project:**
   ```powershell
   node scripts/deploy-supabase-function.mjs
   ```
5. **Run pre-deployment verification & publish Workers:**
   ```powershell
   npm run ci:build
   npm run cloud:deploy
   ```
