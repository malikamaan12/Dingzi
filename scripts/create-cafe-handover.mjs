import fs from 'node:fs/promises';
import path from 'node:path';

const snapshotPath = path.resolve('data', 'downloads', 'all-cafes-backup-20261021T185622Z', 'database.json');
const archivePath = path.resolve('data', 'downloads', 'All-cafes-recovery-backup-2026-10-21.zip');
const folder = path.resolve('data', 'downloads', 'Cafe-Handover-2026-11-22');
const snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8'));

const formatDate = (date) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Asia/Riyadh' }).format(new Date(date));
const money = (value, currency) => `${Number(value).toFixed(2)} ${currency}`;
const escapeCell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const publicBase = process.env.PUBLIC_MENU_ORIGIN || 'https://pager-menu.example.workers.dev';
const staffBase = process.env.MANAGEMENT_ORIGIN || 'https://pager-staff.example.workers.dev';
const publicUrl = (id) => `${publicBase}/menu/${id}`;
const modifierSummary = (item) => {
  const groups = Array.isArray(item.modifier_groups) ? item.modifier_groups : [];
  return groups.length ? groups.map((group) => group.name || group.label || 'Options').join(', ') : 'None';
};
const variantSummary = (item, variants, currency) => {
  const values = variants.filter((variant) => variant.menu_item_id === item.id);
  return values.length ? values.map((variant) => `${variant.label}: ${money(variant.price, currency)}`).join('; ') : '-';
};

const cafeDetails = snapshot.cafes.map((cafe) => ({
  ...cafe,
  publicUrl: publicUrl(cafe.restaurant.id),
  categoryDetails: cafe.categories.map((category) => ({
    ...category,
    itemCount: cafe.menuItems.filter((item) => item.category_id === category.id).length,
    items: cafe.menuItems.filter((item) => item.category_id === category.id),
  })),
}));

const totalItems = cafeDetails.reduce((total, cafe) => total + cafe.menuItems.length, 0);
const totalCategories = cafeDetails.reduce((total, cafe) => total + cafe.categories.length, 0);
const totalVariants = cafeDetails.reduce((total, cafe) => total + cafe.priceVariants.length, 0);

const lines = [
  '# Cafe Menu Platform - Handover Details',
  '',
  `Prepared: 22 November 2026 (Asia/Riyadh)`,
  `Data snapshot: ${formatDate(snapshot.exportedAt)} (Asia/Riyadh)`,
  '',
  '## Purpose',
  '',
  'This handover records the current café configuration captured in the verified backup. It is designed for operations, menu maintenance, and recovery planning. It intentionally excludes user accounts, passwords, sessions, payments, audit records, and platform secrets.',
  '',
  '## Platform access',
  '',
  '| Service | Address |',
  '| --- | --- |',
  `| Public menu platform | ${publicBase} |`,
  `| Staff and administration portal | ${staffBase}/admin |`,
  '| Customer-facing features | Browse, category filters, search, Arabic/English, favourites, item details, variants and toppings, and the menu suggestion wheel |',
  '| Management features | Café profiles, categories, menu editor, image library, visibility controls, permanent QR links, theme controls, shared menu library, and role-based administration |',
  '',
  '## Portfolio summary',
  '',
  `- Cafés: ${cafeDetails.length}`,
  `- Categories: ${totalCategories}`,
  `- Café menu items: ${totalItems}`,
  `- Price variants: ${totalVariants}`,
  `- Shared menu-library items: ${snapshot.sharedMenuLibrary.length}`,
  `- Backed-up media files: ${snapshot.media.length}`,
  '',
  '| Café | Status | Theme | Currency | Categories | Items | Variants |',
  '| --- | --- | --- | --- | ---: | ---: | ---: |',
  ...cafeDetails.map((cafe) => `| ${escapeCell(cafe.restaurant.name)} | ${escapeCell(cafe.restaurant.status)} | ${escapeCell(cafe.restaurant.theme)} | ${escapeCell(cafe.restaurant.currency)} | ${cafe.categories.length} | ${cafe.menuItems.length} | ${cafe.priceVariants.length} |`),
  '',
  '## Café records',
  '',
];

for (const cafe of cafeDetails) {
  const { restaurant } = cafe;
  lines.push(
    `### ${restaurant.name}`,
    '',
    `- Public menu: ${cafe.publicUrl}`,
    `- Current state: ${restaurant.status}; visible: ${restaurant.hidden ? 'No' : 'Yes'}`,
    `- Theme: ${restaurant.theme}`,
    `- Currency: ${restaurant.currency}`,
    `- Cuisine: ${restaurant.cuisine_type || 'Not specified'}`,
    `- Contact: ${restaurant.phone || 'Not specified'}`,
    `- Address: ${restaurant.address || 'Not specified'}`,
    `- Opening hours: ${restaurant.opening_hours || 'Not specified'}`,
    '',
    '#### Categories',
    '',
  );
  if (!cafe.categoryDetails.length) {
    lines.push('No categories or items have been configured yet.', '');
    continue;
  }
  lines.push('| Category | Items |', '| --- | ---: |', ...cafe.categoryDetails.map((category) => `| ${escapeCell(category.title)} | ${category.itemCount} |`), '');
  lines.push('#### Menu catalogue', '');
  for (const category of cafe.categoryDetails) {
    lines.push(`##### ${category.title}`, '');
    if (!category.items.length) {
      lines.push('No items.', '');
      continue;
    }
    lines.push('| Item | Price | Availability | Options | Variants |', '| --- | ---: | --- | --- | --- |');
    for (const item of category.items) {
      const availability = item.is_available ? 'Visible' : 'Hidden';
      const price = item.discount > 0 ? `${money(item.price, restaurant.currency)} (-${item.discount}%)` : money(item.price, restaurant.currency);
      lines.push(`| ${escapeCell(item.name)} | ${price} | ${availability} | ${escapeCell(modifierSummary(item))} | ${escapeCell(variantSummary(item, cafe.priceVariants, restaurant.currency))} |`);
    }
    lines.push('');
  }
}

lines.push(
  '## Shared menu library',
  '',
  `The reusable library contains ${snapshot.sharedMenuLibrary.length} items. It can be used to add common products to another café without re-entering the base details. The exported SQL and JSON backup retain the individual records.`,
  '',
  '## Backup and recovery',
  '',
  '- The all-cafes recovery archive includes `schema-and-data.sql`, `database.json`, `README.txt`, and 180 media files.',
  '- The SQL file creates an isolated `cafe_menu_backup` schema before inserting data, which makes it safe to inspect without overwriting production tables.',
  '- During a full restore, recreate or assign manager accounts separately, then restore café profiles, categories, menu items, variants, shared-library items, and media in that order.',
  '- Keep all recovery files private. They contain operational café data and media but no credentials or secrets.',
  '',
  '## Change checklist',
  '',
  '1. Update the menu from the staff portal for the target café.',
  '2. Confirm visibility and category placement before sharing the public menu URL or QR code.',
  '3. Check the customer menu in both English and Arabic on a mobile screen.',
  '4. Run a fresh private backup after material menu, theme, or media changes.',
  '',
);

await fs.mkdir(folder, { recursive: true });
await fs.writeFile(path.join(folder, 'Cafe-Platform-Details.md'), `${lines.join('\n')}\n`, { mode: 0o600 });
await fs.writeFile(path.join(folder, 'cafe-details.json'), JSON.stringify({
  preparedAt: '2026-11-22T00:00:00+03:00',
  snapshotExportedAt: snapshot.exportedAt,
  platform: {
    publicMenuBaseUrl: publicBase,
    staffPortalUrl: `${staffBase}/admin`,
  },
  summary: { cafes: cafeDetails.length, categories: totalCategories, menuItems: totalItems, variants: totalVariants, sharedLibraryItems: snapshot.sharedMenuLibrary.length, media: snapshot.media.length },
  cafes: cafeDetails,
  sharedMenuLibrary: snapshot.sharedMenuLibrary,
  media: snapshot.media,
}, null, 2), { mode: 0o600 });
await fs.writeFile(path.join(folder, 'Cafe-Menu-PRD.md'), `# Cafe Menu Platform - Product Requirements Document

## 1. Product overview

Cafe Menu is an internal multi-café platform for maintaining branded, mobile-first digital menus. Each café has its own permanent public menu URL and QR code while staff work in a separate protected administration portal. The product supports four cafés in this handover: Urban Café, Inflata Café, Drive Through Café, and Qstrawberry.

## 2. Goals

- Give guests a fast, polished menu experience on a phone.
- Let a café manager independently manage only their own café.
- Let a super admin manage the entire café portfolio, managers, and shared menu library.
- Keep each public menu URL and QR code permanent across normal menu and branding updates.
- Reuse menu items across cafés without accidentally sharing later edits.
- Maintain a recoverable café and media backup without placing secrets in source control.

## 3. Users and permissions

| User | Main permissions |
| --- | --- |
| Guest | View a public café menu, search, filter, switch Arabic/English, save favourites locally, browse options, and use the suggestion wheel. |
| Café manager | Manage their assigned café profile, theme, categories, items, photos, availability, specials, variants, toppings, QR code, and imports from the shared library. |
| Super admin | Manage all cafés and accounts, enter any café workspace, manage the shared library, and freeze or delete manager accounts. |

## 4. Core functional requirements

### Guest menu

1. Display active and visible café menus at a permanent URL.
2. Provide compact category navigation, top-level filters, text search, favourites, and today-special discovery.
3. Search must match item names, categories, descriptions, tags, and relevant similar words.
4. Provide English and Arabic interface modes with right-to-left support where needed.
5. Present each item in a compact, mobile-safe detail overlay with image, price, discount, variants, topping/customisation groups, selection validation, and a calculated estimated total.
6. Respect unavailable items/options and selection requirements.
7. Provide a filtered-menu suggestion wheel when a guest selects "Can't decide?".
8. Keep browsing features separate from order processing: no payment or checkout is required.

### Café management

1. Create, rename, order, and remove categories.
2. Create, edit, duplicate, hide/show, discount, mark special, and remove menu items.
3. Upload one dedicated image per item.
4. Configure up to three price variants and multiple topping/customisation groups per item.
5. Configure each option group as required or optional, single or multiple choice, with availability and additional price.
6. Change logo, cover, theme, currency labels, contact information, address, hours, and menu visibility.
7. Generate and download one permanent QR target per café.
8. Import reusable templates from the global menu library as independent café copies.

### Administration and security

1. Enforce tenant boundaries for café managers.
2. Allow super admins to manage all cafés and manager accounts.
3. Support account freeze/unfreeze and controlled deletion/restore.
4. Keep public menu hosting separate from staff login and administration routes.
5. Reject unsafe or malformed menu configuration, prices, discounts, option limits, and stale concurrent writes.

## 5. Current delivery scope

| Area | Delivered capability |
| --- | --- |
| Portfolio | ${cafeDetails.length} cafés, ${totalCategories} categories, ${totalItems} café items, and ${snapshot.sharedMenuLibrary.length} reusable library items in the verified snapshot. |
| Themes | Independent per-café themes, including plum, ocean, and terracotta. |
| Languages | English and Arabic guest-menu interface. |
| Media | Dedicated item imagery with ${snapshot.media.length} backed-up media files. |
| Deployment | Customer menu and protected staff app on separate Cloudflare Worker origins. |
| Data recovery | Portable PostgreSQL schema/data export, JSON export, and original media files. |

## 6. Non-functional requirements

- Mobile-first layout must avoid horizontal clipping at narrow phone widths.
- Reduced-motion preferences must be respected.
- Guest menu refreshes must not expose administrative APIs or account pages.
- Production secrets, credentials, local databases, and private backups must remain outside Git.
- Every material content change must be testable in the public menu before sharing the QR code.
- Source changes must pass type-checking and build verification before deployment.

## 7. Operational acceptance criteria

1. A guest can open every active café URL on a phone and browse the intended items.
2. Switching the language, a category, a filter, or an item option updates the UI without clipping.
3. An item with variants/toppings shows selected choices and an accurate estimated total.
4. A manager can change item availability and see the update on their own public menu.
5. A manager cannot access another café's private management data.
6. A super admin can access every café workspace and manage manager-account state.
7. The all-cafes recovery package imports into its isolated PostgreSQL schema and maps each media record to a saved file.

## 8. Project risks and decisions

- The platform is for internal restaurant operations; payment, customer registration, and public account sign-up are intentionally disabled.
- Menu photos must be reviewed by the café before public use to ensure food representation is accurate.
- Restaurant data changes often; create a new private recovery export after meaningful menu, media, theme, or profile changes.
- Empty cafés are retained as configured portfolio records until their menus are populated.

## 9. Handover references

- Public menu base: ${publicBase}
- Staff portal: ${staffBase}/admin
- This folder: café portfolio details, source package, recovery archive, and PDF overview.
`, { mode: 0o600 });

await fs.writeFile(path.join(folder, 'Project-Source-Guide.md'), `# Cafe Menu Platform - Project Source Guide

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

The local application runs at http://localhost:5200. Do not copy production credentials into the repository or into a source archive.

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
`, { mode: 0o600 });
await fs.writeFile(path.join(folder, 'Handover-Contents.md'), `# Cafe Menu Platform - Handover Package

## Start here

1. Read Cafe-Menu-PRD.md for the product scope, users, requirements, and acceptance criteria.
2. Read Cafe-Platform-Details.md or open Cafe-Platform-Details.pdf for the current café portfolio and catalogue snapshot.
3. Read Project-Source-Guide.md before opening the source archive.
4. Keep All-cafes-recovery-backup-2026-10-21.zip private; it contains the full café recovery schema, data, and media.

## Included files

| File or folder | Contents |
| --- | --- |
| Cafe-Menu-PRD.md | Product requirements document. |
| Cafe-Platform-Details.md | Complete current café profile, category, and menu catalogue details. |
| Cafe-Platform-Details.pdf | Print-ready café portfolio and catalogue reference. |
| Project-Source-Guide.md | Source architecture, startup, and verification guide. |
| Cafe-Menu-Project-Source-2026-11-22.zip | Complete clean tracked project source. |
| All-cafes-recovery-backup-2026-10-21.zip | PostgreSQL schema/data export, JSON export, and original media. |
| Documentation/ | Versioned README, deployment, access-control, library, and audit documents. |

## Privacy boundary

This package deliberately omits credentials, API/service keys, user passwords, session data, payment data, and local environment files. Configure a new environment through the included examples and existing Cloudflare/Supabase secret stores.
`, { mode: 0o600 });
await fs.copyFile(archivePath, path.join(folder, 'All-cafes-recovery-backup-2026-10-21.zip'));
console.log(JSON.stringify({ folder, cafes: cafeDetails.length, menuItems: totalItems, media: snapshot.media.length }, null, 2));
