# Cafe Menu Platform - Product Requirements Document

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
| Portfolio | 4 cafés, 23 categories, 103 café items, and 70 reusable library items in the verified snapshot. |
| Themes | Independent per-café themes, including plum, ocean, and terracotta. |
| Languages | English and Arabic guest-menu interface. |
| Media | Dedicated item imagery with 180 backed-up media files. |
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

- Public menu base: https://menu.cafe-menu.workers.dev
- Staff portal: https://staff.cafe-menu.workers.dev/admin
- This folder: café portfolio details, source package, recovery archive, and PDF overview.
