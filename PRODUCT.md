# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Café, restaurant, and specialty beverage guests** browsing menus on their own mobile browsers via table QR codes, counter NFC/QR coasters, branded venue links (`/v/:slug`), or outdoor curbside pickup bay signage — expecting instant English and Arabic (`RTL`) menus, customization, table reservations, walk-in waitlist passes, and reliable lock-screen phone ringing without downloading an App Store app.
- **Branch managers, baristas, order-prep teams, hosts, and cashiers** running high-velocity service across counter tablets, POS stations, and mobile phones — issuing or bumping virtual pagers, checking off multi-item prep tickets, recalling accidental bumps, managing table reservations and walk-in queues, dispatching curbside car-side orders, and updating live menu availability (`86'd` snooze).
- **Multi-branch tenant owners and platform super-administrators** overseeing multiple café brands and branches, switching workspaces cleanly without cross-tenant leakage, provisioning accounts, and reviewing branch and portfolio revenue/pager/QR/NFC analytics.

## Product Purpose

**dingzi** (`ding` = counter service bell chime + `zi` = effortless hospitality) replaces plastic hardware pager pucks, static paper/PDF menus, and fragmented reservation/curbside tools with one browser-native, multi-tenant hospitality operating platform. Success means guests scan or tap once to browse, order, reserve, or check into a bay and reliably hear and see their phone ding the instant their order or table is ready, while staff run every service channel from one calm real-time console.

## Positioning

Hardware-free lock-screen virtual pagers, reusable NFC/QR counter coasters (`/tag/:token`), bilingual English/Arabic digital menus with configurable commerce modes (browse + pager, order ahead & pay at venue, or full online SkipCash/Sadad checkout), combinable multi-table reservations, live walk-in waitlists, and curbside bay check-in unified on split-origin edge infrastructure (`dingzi-menu` public guest surface and `dingzi-staff` authenticated staff console) backed by Durable Object WebSocket Hibernation and encrypted Web Push.

## Operating Context

- Guests interact outdoors in bright sunlight (drive-thru bays, patios) and indoors at bustling counters on compact smartphones (`320px+`) in both English (`LTR`) and Arabic (`RTL`).
- Barista and order-prep staff operate continuously lit counter tablets in dim or steam-heavy bar environments with wet or gloved hands, requiring dark-mode Midnight Indigo surfaces, `>=44x44px` touch targets, per-item prep checkoffs, and 30-second undo/recall safety.
- Counter staff encode reusable NTAG213/215 NFC coasters once via Web NFC or NDEF CSV export and bind/release guest tickets infinitely, or print `58mm`/`80mm` thermal POS receipts and acrylic dual QR+NFC stands.

## Capabilities and Constraints

- **Split-Origin Security Boundary:** Public guest origin (`PUBLIC_MENU_ORIGIN`) serves only read-only menus, public guest passes, and guest WebSockets; all staff authentication, management pages, and mutations are strictly isolated to `MANAGEMENT_ORIGIN` with PostgreSQL Row-Level Security (`RLS`) tenant isolation.
- **Terminology Constraint:** Never use the three-letter acronym of a local restaurant (`K-D-S`) anywhere in UI copy, routes, staff role identifiers, code comments, or documentation; always refer to kitchen/barista screens as **Order Prep**, **Live Pagers**, or **Prep Queue** (`/admin/pagers`, role `prep_barista`).
- **Infrastructure Isolation:** Local development runs strictly on port `5200` (`data/database`), isolated from any legacy accounts, Workers, or port `5100`.

## Brand Commitments

- **Wordmark & Logo (*The Volt Ringer*):** Always typeset **`dingzi`** in all-lowercase in Latin UI and wordmarks (never `Dingzi` or `DINGZI`), and **«دِنغزي»** in Arabic. Keep the 25-degree tilted white service bell inside its `#6236FF` Electric Violet squircle with `#C8FF42` Volt Lime clapper, dual sound arcs, and `i`-dots; use `/brand/dingzi-icon-monochrome-thermal.svg` for 1-color thermal POS receipts.
- **Zero Gold & Zero Tuxedo Black:** Never introduce metallic gold, brass, warm amber, or pure `#000000` luxury black on any digital screen, QR stand, or printed collateral.
- **Multi-Tenant Co-Branding:** Client cafés keep 100% of their own menu theme colors (`plum`, `ocean`, `terracotta`, or custom brand hex) while browsing (`/v/:slug` or `/menu/:id`) with a subtle monochrome *"Powered by dingzi"* (`opacity: 0.65`) footer stamp; `dingzi`'s `#6236FF` + `#C8FF42` system owns the live Virtual Pager, Curbside Bay Check-In, and Order Prep console.
- **Sonic & Verbal Identity:** Ready alerts play a rising perfect-fifth marimba-bell chime (`G5 783.99 Hz` `140ms` -> `D6 1174.66 Hz` `240ms`) with `[180, 80, 240] ms` haptics and bilingual payoff-first slogans (*"Ding! Your food is ready."* / *«دِنغ! طلبك جاهز.»*).

## Evidence on Hand

- Official brand kit and vector/raster marks in `client/public/brand/` and `design-system/pager-hospitality-platform/`.
- Canonical 70-item WebP hospitality photography catalog verified by `scripts/verify-photo-assets.mjs` and seeded branches (`Urban Café`, `Qstrawberry`).
- End-to-end verification suites in `scripts/verify-hospitality-platform.ts`, `scripts/verify-qr-nfc-system.ts`, `scripts/verify-pwa-mobile-push.ts`, `scripts/verify-workers.ts`, and `scripts/verify-live-dingzi-cloud.mjs`.
- No customer testimonials, external press quotes, or third-party SLA claims exist on hand; never fabricate social proof or unverified metrics.

## Product Principles

1. **Instant Browser Readiness Over Friction:** Every guest flow must work immediately from a single QR scan or NFC tap with zero mandatory app install or account creation.
2. **Tenant Identity in Discovery, Universal Signal at Pickup:** Let each café's culinary brand lead menu browsing, then transition cleanly to `dingzi`'s unmistakable Volt Lime ready signal when an order or table is ready.
3. **One-Handed Speed Under Rush Pressure:** Every barista, host, and guest action must be unmistakable at arm's length, operable one-handed on `320px` phones or counter tablets, and recoverable via undo/recall.
4. **Native Bilingual Parity:** English (`LTR`) and Arabic (`RTL`) are co-equal first-class experiences across menus, smart tags, pagers, and alerts.

## Accessibility & Inclusion

- WCAG 2.1 AA/AAA contrast across light and dark surfaces (including `15.3:1` AAA `#17132E` Midnight Indigo text on `#C8FF42` Volt Lime ready banners and `8.2:1` AAA `#4B1FE0` Hyper Indigo inline links/focus rings on `#FFFFFF`).
- Minimum `44x44px` interactive touch targets, dual state cues (icon + text label + color), atomic `role="status"` / `role="alert"` live announcements, logical CSS properties for `dir="rtl"` mirroring down to `320px`, and `prefers-reduced-motion` support preserving audio/haptic ready alerts without motion sickness.
