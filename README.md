# Multi-Tenant Hospitality & Virtual Pager Platform (Isolated Replicated Baseline)

This workspace (`a:\Software Projects\pager`) is an **isolated, clean-slate codebase replica** of the Cafe Menu Platform prepared as the starting foundation for the [Multi-Tenant Hospitality Operating Platform PRD](docs/PRD-Hospitality-Platform-v1.0.md).

## Strict Environment & Account Isolation

This repository is completely decoupled from the legacy Cafe Menu deployment, accounts, servers, and databases:

| Resource | Isolation Boundary |
| --- | --- |
| **Workspace Location** | `a:\Software Projects\pager` (independent Git repository) |
| **Local Server Port** | `http://localhost:5200` (smoke test `5201`, preview `5202` — never conflicts with legacy port `5100`) |
| **Local Database & Media** | `a:\Software Projects\pager\data\database` (PGlite) & `data\uploads` |
| **Local Super Admin** | `admin@pager.local` (generated fresh by `npm run setup` into private `SETUP-CREDENTIALS.txt`) |
| **Cloudflare Account & Workers** | Dedicated **new** Cloudflare account (`pager-menu` & `pager-staff` Workers in `wrangler.jsonc` / `wrangler.staff.jsonc`) |
| **Cloud Database & Storage** | Dedicated **new** Supabase PostgreSQL project + Hyperdrive (`pager-platform-db`) + private `pager-media` bucket |
| **Legacy Blocklist Guard** | `scripts/legacy-guard.mjs` hard-blocks any accidental connection, migration, backup, or deploy to legacy Cafe Menu IDs or domains |

> **Current state:** Pure replicated baseline code only — no new PRD features have been built on top yet, ready to accelerate upcoming Hospitality Platform development.

## Run Locally

Node.js 22.12 or newer is required.

```powershell
npm ci
npm run setup
npm run build
npm start
```

Or double-click `START-PAGER.cmd` (starts the server in the background on `http://localhost:5200` and opens `/login`).

## Verification Suite

All checks run against disposable in-memory/temporary databases and mocked cloud bindings without touching any external service:

```powershell
npm run check
npm test
npm run build
node scripts/verify-artifact-hardening.mjs
npm run cloud:build
npm run cloud:test
node scripts/verify-production-runtime.mjs
```

## Documentation Index

- **New Target Product Spec:** [docs/PRD-Hospitality-Platform-v1.0.md](docs/PRD-Hospitality-Platform-v1.0.md)
- **Cloud Provisioning & Deployment (New Account):** [DEPLOYMENT.md](DEPLOYMENT.md)
- **Role-Based Access Control:** [RBAC.md](RBAC.md)
- **Global Menu Library:** [GLOBAL-MENU-LIBRARY.md](GLOBAL-MENU-LIBRARY.md)
- **Reference Handover Docs (Read-Only Reference):** `docs/reference-handover/`
