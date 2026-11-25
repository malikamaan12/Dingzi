# Multi-Tenant Hospitality Operating Platform — Product Requirements Document (v1.0)

**Document Status:** Approved v1 Architecture Baseline  
**Prepared:** 22 November 2026 (Asia/Qatar)  
**Target Stack:** Cloudflare Workers (Split Public/Staff Origins + Durable Objects) · React · Node.js 22+ · TypeScript · PostgreSQL (Supabase RLS)

## 1. Product Vision & Strategic Scope

This platform is a clean-slate, multi-tenant SaaS application for cafés, restaurants, kiosks, and drive-thru venues. It replicates the proven multi-tenant digital menu foundation of the Cafe Menu Platform (without touching or modifying the existing running deployment) and expands the hardware-free browser paging concept of [Pager App](https://pager-app.com/en/coffee-shop-pager) into a five-pillar hospitality operating platform:

1. **Branded Bilingual Digital Menu & Configurable Ordering** — Permanent QR/URL menus in English and Arabic (RTL) with per-tenant themes, variants, modifier groups, and a per-branch toggle between **Browse & Pager Only**, **Order Now & Pay at Venue**, or **Full In-App Cart & Online Checkout**.
2. **Hardware-Free Virtual Pager & Pickup Queue** — Zero-download mobile browser paging triggered via POS invoice number, 1-tap auto-numbering for kiosks/carts, or in-app orders, complete with instant sound/Web Push alerts, post-pickup Google Maps review prompts, and prep-time SLA analytics.
3. **Table Reservations & Live Walk-In Waitlist** — Zone-aware table slot booking with double-booking prevention and a virtual walk-in waitlist that alerts guests on their phones when their table is ready.
4. **Drive-Thru & Curbside Pickup Queue** — Lane and numbered parking-bay ordering/check-in capturing vehicle color, make, and license plate, paired with live arrival chimes on the staff screen and browser paging when orders are ready.
5. **Aggregator Delivery Storefront Handoff (v1)** — Branded venue and item-level redirect hub sending delivery guests directly to the café's active storefronts on [Talabat Qatar](https://www.talabat.com/qatar), [Snoonu](https://partner.snoonu.com/), [Keeta Qatar](https://www.keeta-global.com/QA/en/wst), or custom regional apps with outbound click attribution.

## 2. Core Architectural Principles

| Principle | Architectural Implementation |
| :--- | :--- |
| **Clean-Slate Multi-Tenancy** | Built from scratch with strict `tenant_id` and `branch_id` isolation enforced at both the API middleware layer and PostgreSQL Row-Level Security (RLS), supporting multi-branch brands and single-site cafés alike. |
| **Split Worker Security Boundary** | Replicates Cafe Menu's two-origin isolation: a public customer origin (`menu.<domain>`) serving zero-auth guest experiences, and a separate staff/admin origin (`staff.<domain>`) protecting the order & pager queue, host stands, branch settings, and super-admin controls. |
| **Sub-Second Stateful Edge Queue** | Uses [Cloudflare Durable Objects with WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (one stateful room per active `branch_id`) paired with the browser Web Push API so status changes reach guest phones and barista tablets in under 250 ms without idle Worker billing. |
| **Per-Tenant Commerce Flexibility** | Every branch selects its own `ordering_mode` (`browse_and_pager`, `cart_pay_at_venue`, or `full_online_checkout`) so browse-only cafés and full pre-order drive-thrus run on one unified codebase. |
| **Permanent QR Targets** | Venue menus, dine-in tables, curbside parking bays, walk-in waitlist stands, and counter pager screens use immutable UUID routing tokens so printed acrylics and stickers never break across rebrands or menu edits. |

## 3. User Roles & Permissions Matrix

| Role | Scope | Primary Capabilities |
| :--- | :--- | :--- |
| **Guest (Customer)** | Public (`menu.<domain>`) | Browse EN/AR menus, search/filter, customize items, spin the suggestion wheel, place orders (when enabled), track live virtual pager status, book tables or join walk-in waitlists, check into curbside/drive-thru bays, and launch aggregator delivery storefronts. |
| **Barista / Prep / Runner** | Assigned Branch (`staff.<domain>`) | View live incoming orders, POS/auto-numbered pager tickets, and arrived drive-thru vehicles; advance prep states (`Preparing` to `Ready` to `Collected`); snooze out-of-stock items or modifiers. |
| **Host / Cashier** | Assigned Branch (`staff.<domain>`) | Issue instant virtual pager QR codes (by POS receipt number or 1-tap auto-number), manage floor table reservations, seat walk-in waitlist parties, and confirm pay-at-venue tickets. |
| **Branch Manager** | Assigned Branch (`staff.<domain>`) | Configure branch profile, theme, ordering/payment mode, categories, items, variants, toppings, floor tables, curbside bays, aggregator links, permanent QR downloads, and branch analytics; import templates from the shared library. |
| **Tenant Owner** | All Branches in Tenant | Compare branch prep times, peak hours, reservation volume, and aggregator clicks side-by-side (matching and extending [Pager App](https://pager-app.com/en/coffee-shop-pager) multi-branch analytics); manage branch managers and payment credentials. |
| **Platform Super Admin** | Portfolio-Wide | Provision/freeze/restore tenants and accounts, step into any tenant/branch workspace with audited elevation, and curate the reusable Global Menu Library. |

## 4. Functional Requirements by Pillar

### 4.1 Pillar 1 — Multi-Tenant Menu, Themes & Configurable Ordering

1. **Permanent Branded Storefronts:** Serve each active, visible branch at `/v/:slug` and `/menu/:public_uuid` with independent themes (`plum`, `ocean`, `terracotta`, or custom brand hex tokens), logos, cover banners, currency (`QAR` default), hours, and contact details.
2. **Bilingual Interface & Search:** Support instant English and Arabic switching with full RTL layout mirroring. Search matches English/Arabic item titles, categories, descriptions, tags, and synonyms.
3. **Catalog Structure (Inherited from Cafe Menu):**
   - Unlimited ordered categories per branch with instant visibility toggles and optional time-of-day windows (e.g., Breakfast 06:00–11:30).
   - Dedicated item photo, price, promotional discount price, "Today's Special" badge, allergen/dietary tags, and estimated prep time.
   - Up to **3 price variants** per item (enforced at both API and database levels) and unlimited customisation/topping groups configured as required or optional, single or multi-select (`min_selections` / `max_selections`), with per-option price deltas and 1-tap snooze.
   - Local browser favourites and the filtered **"Can't decide?"** suggestion wheel.
   - Copy-on-import **Shared Menu Library** allowing branches to clone curated items into independent branch records so subsequent edits never affect other cafés.
4. **Configurable Tenant Ordering & Payment Modes:**
   - **Mode A — `browse_and_pager`:** Displays the interactive item customizer and live estimated total for reference only (zero cart, zero checkout), keeping guest browsing identical to Cafe Menu while enabling Virtual Pager, Table Booking, Waitlist, and Aggregator Delivery buttons.
   - **Mode B — `cart_pay_at_venue`:** Enables cart submission for dine-in table QR orders, counter pickup, or drive-thru/curbside pre-orders, injecting tickets straight into the branch live order queue while collecting payment via cash/POS terminal at the venue.
   - **Mode C — `full_online_checkout`:** Enables online payment prior to prep queue release through pluggable Qatar/GCC payment adapters supporting [SkipCash](https://skipcash.app/solutions) and [Sadad](https://sadad.qa/en/best-payment-gateway-qatar/) (Apple Pay, Google Pay, NAPS, Visa, Mastercard), verified via signed webhooks and idempotency keys.

### 4.2 Pillar 2 — Hardware-Free Virtual Pager & Counter Display

1. **Dual Ticket Issuance (POS & POS-Free):**
   - **Manual POS Link:** Cashier enters the POS invoice/receipt number on a counter phone/tablet to generate an instant single-use ticket QR on a customer-facing screen or thermal receipt.
   - **Auto-Number Mode:** For kiosks, pop-ups, and coffee carts without a POS, tapping **New Pager** issues an atomic daily sequential code (`A-001`, `A-002`) in one tap (matching [Pager App](https://pager-app.com/en/coffee-shop-pager)).
   - **Automatic In-App Issuance:** Orders placed under `cart_pay_at_venue` or `full_online_checkout` automatically open the live virtual pager screen upon submission.
2. **Zero-Download Guest Pager Screen:**
   - Opens directly in mobile Safari/Chrome via camera scan with tenant logo and theme colors.
   - Displays live state transitions (`Waiting` -> `Preparing` -> `Ready for Pickup` -> `Collected`), queue position or estimated prep countdown, and optional wait-screen specials or lightweight mini-game toggle.
   - Requests one-tap Web Push permission and unlocks Web Audio/vibration on initial tap so the phone rings, vibrates, and flashes even if the screen locks or the guest switches tabs.
3. **Barista / Kitchen Pager Console:**
   - Displays active tickets sorted by age with elapsed prep-time color thresholds (green, amber, overdue red).
   - Supports 1-tap **Ready** notification, **Re-buzz** (with ring counter and 20-second cooldown to prevent spam), and **Collected / No-Show** archival.
4. **Post-Pickup Reputation Loop & SLA Analytics:**
   - After pickup confirmation, displays a branded satisfaction check; positive ratings prompt a direct 1-tap link to the branch's Google Maps review page.
   - Captures exact timestamps (`queued_at`, `preparing_at`, `ready_at`, `collected_at`) to power hourly prep-time SLA and peak-congestion charts.

### 4.3 Pillar 3 — Cafe & Restaurant Table Booking + Walk-In Waitlist

1. **Floor Zones & Table Inventory:**
   - Configure dining zones (e.g., Indoor Lounge, Outdoor Terrace, Family/Majlis, Quiet Study) and individual tables (`table_code`, `min_covers`, `max_covers`, combinable flag, and table-specific QR endpoint).
2. **Advance Table Reservations:**
   - Guests select date, party size, dining zone preference, and available time slot calculated dynamically from branch operating hours, `slot_interval_mins`, and `default_turn_duration_mins`.
   - Enforces conflict-free table allocation in PostgreSQL using `tstzrange` exclusion constraints so concurrent requests can never double-book the same table.
   - Supports optional reservation deposits when `full_online_checkout` is active, plus guest self-service status view and cancellation link.
3. **Live Walk-In Virtual Waitlist:**
   - During peak hours when tables are full, guests scan the host-stand Waitlist QR, enter name, phone (optional), party size, and seating preference, and receive a live browser waitlist pager ticket.
   - Host taps **Table Ready** to trigger the exact same Virtual Pager audio/Web Push alert (`"Your table is ready — held for 10 minutes"`), allowing guests to tap **On My Way** or **Release Spot** from their phone instead of crowding the entrance.

### 4.4 Pillar 4 — Drive-Thru & Curbside Pickup Queue

1. **Lane & Numbered Parking-Bay Setup:**
   - Branches configure drive-thru lanes (`Lane 1`, `VIP Window`) and numbered curbside bays (`Bay 1` through `Bay 20`), each with its own permanent signage QR code.
2. **Guest Vehicle Identification & Check-In:**
   - Pre-ordering guests enter vehicle color, car make/body type (SUV, Sedan, Pickup, Coupe), and license plate number during order placement, then tap **5 Mins Away** and **I'm Here — Select Bay** on arrival.
   - Drive-up guests without a pre-order scan the parking-bay QR directly from their car window: if ordering is enabled, their bay ID pre-fills into checkout; if `browse_and_pager` is active, staff take the order car-side and link the bay's virtual pager to the vehicle.
3. **Runner & Window Dispatch Board:**
   - Dedicated Drive-Thru dispatch view highlights arrived vehicles with distinct visual car-color badges, plate numbers, bay codes, and wait timers since arrival check-in (`arrived_at`), firing an audible chime when a pre-ordered vehicle pulls into a bay.

### 4.5 Pillar 5 — Aggregator Delivery Storefront Handoff (v1)

1. **Multi-Aggregator Branch Storefront Hub:**
   - Branch managers configure active delivery links for [Talabat Qatar](https://www.talabat.com/qatar), [Snoonu](https://partner.snoonu.com/), [Keeta Qatar](https://www.keeta-global.com/QA/en/wst), and any additional custom aggregator profiles, including custom bilingual badges (e.g., `"Fastest in Lusail"`, `"Free Delivery Promo"`) and display order.
2. **Guest Handoff Drawer & Item Deep-Links:**
   - Guests tapping **Get Delivery** on the public menu open a clean bottom sheet displaying all active delivery partners for that specific branch, redirecting straight into the partner's native app (via universal link) or mobile web store.
   - Optional per-item override URLs let signature items link directly to that product on the aggregator when desired.
3. **Outbound Conversion Telemetry (Zero-PII):**
   - Logs anonymous click events (`branch_id`, `platform`, `menu_item_id`, `locale`, `clicked_at`) so café owners can quantify how much aggregator demand their own QR codes and social channels generate, establishing baseline metrics ahead of future Phase 2 middleware/3PL dispatch integrations (such as [Snoonu Last-Mile](https://join.snoonu.com/en), [Grubtech](https://grubtech.com/en/integrations/snoonu/), or [Deliverect](https://www.deliverect.com/en/integrations/snoonu)).

## 5. Technical Architecture & Repository Layout

### 5.1 Cloudflare Split-Worker + Durable Object Topology

| Component | Runtime / Service | Responsibility |
| :--- | :--- | :--- |
| **Public Guest Worker** (`wrangler.jsonc`) | Cloudflare Worker + React SPA (`menu.<domain>`) | Serves guest menus, item customizer, virtual pager screen, reservation/waitlist forms, curbside check-in, checkout redirects, and aggregator handoff links. Zero admin routes or staff bundles exposed. |
| **Staff & Admin Worker** (`wrangler.staff.jsonc`) | Cloudflare Worker + React SPA (`staff.<domain>`) | Serves Barista & Pager Queue console, Counter Pager issuer, Host table/waitlist map, Drive-Thru bay board, Branch Manager studio, and Super-Admin portal. |
| **Branch Realtime Hub** (`BranchRealtimeDO`) | [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) | Maintains hibernatable WebSockets per `branch_id` for guests (scoped strictly to their `tracking_token` channel) and authenticated staff (receiving live order queue, pager, waitlist, and curbside bay diffs). |
| **Primary Relational Store** | PostgreSQL 16 (Supabase + Hyperdrive) | Stores multi-tenant relational state, enforces `tstzrange` table booking exclusions, Row-Level Security (RLS), optimistic concurrency (`version`), and JSON/SQL backup exports. |
| **Object Media Store** | Cloudflare R2 / Supabase Storage | Stores tenant logos, cover banners, and dedicated menu item photos served through edge caching. |

### 5.2 Planned Monorepo Structure (Aligned with Cafe Menu)

```text
/
├── client/
│   ├── guest/                # Public mobile menu, virtual pager, table booking, drive-thru, delivery sheet
│   ├── staff/                # Pager & Order Queue console, host floor view, drive-thru board, manager & super-admin
│   └── shared-ui/            # RTL-safe primitives, theme tokens (plum, ocean, terracotta, custom)
├── server/
│   ├── public-worker.ts      # Public Worker entry + guest read/booking/pager/checkout endpoints
│   ├── staff-worker.ts       # Protected Staff/Admin Worker entry + RBAC & tenant boundary middleware
│   ├── durable-objects/
│   │   └── branch-hub.ts     # WebSocket Hibernation room for sub-second pager, waitlist & order events
│   ├── payments/             # Pluggable SkipCash, Sadad & Pay-at-Venue gateway adapters + webhook verifier
│   └── db/                   # Hyperdrive/Postgres client + RLS session context setter
├── shared/
│   └── schemas/              # Zod contracts & TypeScript types shared across client, server, and DO messages
├── migrations/
│   └── 0001_multi_tenant_hospitality_schema.sql
├── scripts/                  # Local setup, isolated tenant/portfolio backup export, source-control audit
├── wrangler.jsonc            # Public guest Worker + Durable Object binding configuration
└── wrangler.staff.jsonc      # Staff administration Worker configuration
```

## 6. Non-Functional, Security & Governance Requirements

1. **Strict Tenant Isolation:** Every staff request sets `SET LOCAL app.current_user_id` and `SET LOCAL app.current_tenant_id` inside a database transaction so PostgreSQL RLS blocks cross-tenant reads or writes even if an application route omits a filter.
2. **Mobile-First & Bilingual Ergonomics:** Zero horizontal overflow down to 320 px viewport width, full `dir="rtl"` layout mirroring in Arabic, `prefers-reduced-motion` support, and Wake Lock / Web Push fallback on virtual pager screens.
3. **Optimistic Concurrency & Validation:** Reject malformed prices, invalid option group bounds (`min_selections > max_selections`), more than 3 variants per item, overlapping table reservations, and stale concurrent menu edits (`version` mismatch).
4. **Secret & Backup Hygiene:** Payment API keys, VAPID keys, and database credentials live strictly in Cloudflare/Supabase secret stores (never in Git or SQL backups). Automated backup scripts export an isolated recovery schema plus media manifest following the Cafe Menu handover standard.

## 7. Operational Acceptance Criteria (v1 Launch Gate)

1. A Super Admin can provision two independent tenants (one set to `browse_and_pager`, one set to `full_online_checkout`) and import items from the Global Menu Library without later edits leaking across cafés.
2. A cashier in a POS-free kiosk can tap **Auto Pager**, display QR `A-001`, have a guest scan on iOS/Android browser with zero app install, tap **Ready** on the barista screen, and trigger an audible/visual alert on the guest's phone in under 1 second.
3. Concurrent booking requests for the same table and overlapping time window result in exactly one confirmed reservation and zero double-bookings at the PostgreSQL constraint layer.
4. A drive-thru guest scanning `Bay 3` QR and tapping **I'm Here** immediately surfaces their car color, make, and plate number at the top of the branch's Drive-Thru dispatch lane with an arrival timestamp.
5. A guest tapping **Delivery** on a branch menu sees only that branch's active [Talabat Qatar](https://www.talabat.com/qatar), [Snoonu](https://partner.snoonu.com/), or [Keeta Qatar](https://www.keeta-global.com/QA/en/wst) links, redirects cleanly, and increments the branch's outbound aggregator click counter without storing personal guest data.

## 8. External References

1. [Pager App — Coffee Shop Pager System Without Hardware](https://pager-app.com/en/coffee-shop-pager)
2. [Cloudflare Durable Objects — WebSocket Hibernation Best Practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)
3. [SkipCash — Qatar Central Bank Licensed Payment Gateway](https://skipcash.app/solutions)
4. [Sadad — Electronic Payment Gateway in Qatar](https://sadad.qa/en/best-payment-gateway-qatar/)
5. [Talabat Qatar — Online Food Delivery](https://www.talabat.com/qatar)
6. [Snoonu Partner Portal — Merchant Storefront Platform](https://partner.snoonu.com/)
7. [Snoonu B2B Last-Mile Delivery Services (Phase 2 Reference)](https://join.snoonu.com/en)
8. [Keeta Qatar — Restaurant Delivery Storefronts](https://www.keeta-global.com/QA/en/wst)
9. [Grubtech — Snoonu & Aggregator POS Integration Reference (Phase 2)](https://grubtech.com/en/integrations/snoonu/)
10. [Deliverect — Middle East Delivery Channel Integration Reference (Phase 2)](https://www.deliverect.com/en/integrations/snoonu)
