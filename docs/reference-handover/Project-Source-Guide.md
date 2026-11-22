# Cafe Menu Platform - Project Source Guide

## Included source package

Cafe-Menu-Project-Source-2026-11-22.zip is a clean archive of the tracked Git project at the handover revision. It includes application code, Worker configuration, migrations, fixtures, tests, build scripts, brand and product assets, and versioned documentation.

It intentionally excludes:

- node_modules and generated build output
- local and cloud environment files
- passwords, API keys, service keys, and sessions
- private café backups and databases
- local credential notes and temporary review material

## Repository layout

| Path | Purpose |
| --- | --- |
| client/ | React guest menu and staff administration interface. |
| server/ | Server routes, business logic, authentication, and database access. |
| shared/ | Shared schemas and types. |
| migrations/ | PostgreSQL schema migrations. |
| supabase/ | Supabase/Cloud configuration support. |
| scripts/ | Setup, verification, deployment, backup, and operational automation. |
| fixtures/ | Versioned menu sources for repeatable import/test flows. |
| assets/ and brand-assets/ | Product and brand image assets. |
| wrangler.jsonc | Public-menu Worker configuration. |
| wrangler.staff.jsonc | Staff administration Worker configuration. |

## Local startup

1. Install Node.js 22 or newer.
2. Copy .env.example to .env and provide non-production local values.
3. Run npm ci.
4. Run npm run setup.
5. Run npm run build and npm start.

The local application runs at http://localhost:5100. Do not copy production credentials into the repository or into a source archive.

## Verification

Run these checks after source changes:

~~~powershell
npm run check
npm run build
npm test
node scripts/verify-source-control.mjs
~~~

For Cloudflare Worker validation, use the deployment guidance in Documentation/DEPLOYMENT.md and run the cloud build/test scripts. Keep Worker secrets in Cloudflare and Supabase configuration, never in GitHub source files.

## Data and recovery

Use the separate All-cafes-recovery-backup-2026-10-21.zip file in this handover folder for live café data and media recovery. Source code and operational data are intentionally separated.
