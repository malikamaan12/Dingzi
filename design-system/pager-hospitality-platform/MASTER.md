# dingzi — Official Brand Identity & Design System Master Specification (v1.0)

**Brand Name:** `dingzi` (strictly all-lowercase in wordmarks, headlines, and UI chrome; Arabic: `دِنغزي`)
**Naming Origin:** `ding` (crisp service bell chime signaling fresh food on the pass) + `zi` (phonetic shorthand for *easy* — zero hardware pucks, zero App Store downloads, zero counter crowding)
**Category:** Multi-Tenant Hospitality Operating Platform (Bilingual Digital Menus, Lock-Screen Virtual Pager, Table Reservations, Walk-In Waitlist, Curbside Bay Check-In & Aggregator Handoff)

---

## 1. Master Logo System — *The Volt Ringer*

- **Signature Mark:** Houses a 25-degree tilted pure white (`#FFFFFF`) service bell inside an Electric Violet (`#6236FF`) continuous-curve squircle, accented by a Volt Lime (`#C8FF42`) clapper sphere and two concentric pill-rounded `#C8FF42` sound waves.
- **Wordmark:** Pairs horizontally with the custom lowercase geometric wordmark **`dingzi`** (`Plus Jakarta Sans` 700–800, tight `-0.03em` tracking) featuring matching `#C8FF42` Volt Lime dots over both `i` stems.
- **Approved Assets (`client/public/brand/`):**
  - `/brand/dingzi-lockup-dimensional-master.png` — Primary Dimensional Flagship Lockup (hero headers, splash screens, counter QR previews)
  - `/brand/dingzi-lockup-light.svg` — Flat vector lockup (`#17132E` ink + `#C8FF42` dots) for daylight UI & white acrylic signage
  - `/brand/dingzi-lockup-dark.svg` — Flat vector lockup on `#17132E` Midnight Indigo (`#FFFFFF` ink + `#C8FF42` dots) for dark prep screens & curbside bollards
  - `/brand/dingzi-icon-color.svg` — Standalone scalable squircle icon (`/favicon.svg`, `/icon-192.svg`, `/icon-512.svg`)
  - `/brand/dingzi-icon-monochrome-thermal.svg` — 1-color monochrome stamp (`#17132E` + `#FFFFFF` cutouts) for `58mm`/`80mm` thermal POS receipts & laser engraving
  - `/brand/dingzi-favicon-192.png` & `/brand/dingzi-app-icon-512.png` — Official raster PWA & iOS Home Screen icons
- **Clear Space & Misuse Guardrails:**
  - Maintain `0.25X` unobstructed clear space on all 4 sides (`X` = squircle height). Switch to standalone squircle icon below `92px` digital width (`24px` height; minimum standalone `16px`).
  - **Never capitalize** the wordmark (`dingzi` only — never `Dingzi` or `DINGZI`).
  - **Zero Gold & Zero Luxury Black:** Never introduce metallic gold, brass, warm amber, or pure `#000000` tuxedo black on any digital screen, QR stand, or printed collateral.
  - **Never place Volt Lime text on white:** Always set `#17132E` Midnight Indigo text on `#C8FF42` fills (`15.3:1` AAA).

---

## 2. Official Color Architecture & 60–25–10–5 UI Proportion Rule

- **60% Pure White / Lilac Mist (`#FFFFFF` / `#F6F5FC`)** — Daylight canvas
- **25% Midnight Indigo (`#17132E`)** — Body ink & dark Order Prep console
- **10% Electric Violet (`#6236FF`)** — Primary CTAs, squircle icon, QR frames, preparing bar
- **5% Volt Lime (`#C8FF42`)** — Order-Ready pager flash, chime arcs, `i`-dots, bay arrived pills

| Token Role | Name | Hex | RGB / CMYK | Approved Text Pair | Primary Surface / Usage |
|---|---|---|---|---|---|
| **Primary Brand** | Electric Violet | `#6236FF` | `98, 54, 255` · `C74 M76 Y0 K0` | `#FFFFFF` (6.0:1 AA) | Primary CTAs, squircle icon, QR frames, preparing bar |
| **Ready Signal** | Volt Lime | `#C8FF42` | `200, 255, 66` · `C24 M0 Y82 K0` | `#17132E` (15.3:1 AAA) | Order-Ready pager banner, chime arcs, `i`-dots, bay arrived pills |
| **Dark Anchor** | Midnight Indigo | `#17132E` | `23, 19, 46` · `C86 M84 Y38 K66` | `#FFFFFF` (18.0:1 AAA) | Wordmark, body ink, dark-mode Barista Prep Queue, bollards |
| **Light Canvas** | Pure White | `#FFFFFF` | `255, 255, 255` · `C0 M0 Y0 K0` | `#17132E` (18.0:1 AAA) | Guest menu canvas, modal cards, counter QR stands |
| **Deep Link Shade** | Hyper Indigo | `#4B1FE0` | `75, 31, 224` · `C82 M84 Y0 K0` | On `#FFFFFF` (8.2:1 AAA) | Inline links, button hover/pressed state, focus outlines |
| **Soft Surface** | Lilac Mist | `#F6F5FC` | `246, 245, 252` · `C3 M3 Y0 K0` | `#17132E` (16.7:1 AAA) | Secondary cards, search inputs, modifier group panels |
| **Dark Elevated** | Cosmic Slate | `#241E42` | `36, 30, 66` · `C80 M82 Y28 K52` | `#FFFFFF` (14.6:1 AAA) | Elevated ticket cards inside dark-mode Order Prep console |
| **Violet Tint** | Iris Wash | `#EFEAFF` | — | `#4B1FE0` (7.3:1 AAA) | Selected modifier chips, table slot highlights, callouts |
| **Muted & Hairline** | Violet-Slate / Mist Border | `#57507A` / `#E5E2F2` | — | `#57507A` on `#FFFFFF` (7.1:1 AAA) | Secondary copy, timestamps, subtitles, 1px dividers |
| **Overdue Alert** | Overdue Coral | `#FF4D6D` | — | `#FFFFFF` | Overdue SLA ticket indicators |

---

## 3. Bilingual Typography & Queue Numerals

- **Display & Wordmark:** `Plus Jakarta Sans` / `Inter` (`700–800`, `-0.025em` to `-0.03em` tracking; lowercase `dingzi`).
- **Latin UI & Body:** `Plus Jakarta Sans` / `Inter` (`400–600`, `1.55–1.6` line-height).
- **Arabic (`dir="rtl"`) UI:** `IBM Plex Sans Arabic` / `Noto Sans Arabic` (`500–700`, `letter-spacing: 0`, `1.7–1.75` line-height so Arabic diacritics never clip).
- **Queue & Prep Mono:** `JetBrains Mono` / `Google Sans Code` (`600–700`, `font-variant-numeric: tabular-nums` on ticket IDs `A-042`, car plates, QAR totals, and timers).

---

## 4. Verbal Identity, Sonic Signature & Co-Branding

- **Hero Guest Slogan:** `Ding! Your food is ready.` / `دِنغ! طلبك جاهز.`
- **B2B Platform Line:** `Menus, tables, and pickup — made dingzi.` / `المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي.`
- **Pager Waiting State:** `Sit easy. We'll ding your phone when it's hot.` / `استرح مكانك، بننبهك أول ما يجهز طلبك.`
- **Curbside & Drive-Thru:** `Park easy. Scan your bay and we'll bring it out.` / `صُفّ بسهولة، امسح رمز الموقف وبنجيب طلبك لسيارتك.`
- **Walk-In Table Waitlist:** `Skip the crowd. Your table will ding you.` / `تجنّب الزحمة، طاولتك بتنبهك أول ما تفضى.`
- **Sonic & Haptic Ready Alert:** Rising perfect-fifth marimba-bell chime (`G5 783.99 Hz` `140ms` -> `D6 1174.66 Hz` `240ms`, `380ms` total) + vibration `[180, 80, 240] ms` + `#C8FF42` screen flash.
- **Multi-Tenant White-Label Rule:** Client cafés keep 100% of their own menu theme colors while browsing (`/v/:slug` or `/menu/:uuid`) with a subtle monochrome *"Powered by dingzi"* (`opacity: 0.65`) footer stamp; `dingzi`'s `#6236FF` + `#C8FF42` system owns the live Virtual Pager, Curbside Bay Check-In, and Order Prep console.
