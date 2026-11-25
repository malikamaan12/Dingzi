---
brand:
  name: "dingzi"
  etymology: "ding (service bell ready chime) + zi (easy, effortless hospitality)"
  guest_slogan_en: "Ding! Your food is ready."
  guest_slogan_ar: "دِنغ! طلبك جاهز."
  platform_tagline_en: "Menus, tables, and pickup — made dingzi."
  platform_tagline_ar: "المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي."
  prohibited_aesthetics:
    - "No gold, brass, warm amber, or metallic bronze accents"
    - "No pure #000000 luxury/tuxedo black surfaces"
colors:
  core:
    electric_violet: "#6236FF"
    volt_lime: "#C8FF42"
    midnight_indigo: "#17132E"
    pure_white: "#FFFFFF"
  semantic_light:
    canvas_bg: "#FFFFFF"
    surface_subtle: "#F6F5FC"
    surface_tint: "#EFEAFF"
    border_hairline: "#E5E2F2"
    ink_primary: "#17132E"
    ink_secondary: "#2E2752"
    ink_muted: "#57507A"
    action_primary_bg: "#6236FF"
    action_primary_hover: "#4B1FE0"
    action_primary_fg: "#FFFFFF"
    link_inline: "#4B1FE0"
    signal_ready_bg: "#C8FF42"
    signal_ready_fg: "#17132E"
  semantic_dark_console:
    canvas_bg: "#17132E"
    surface_elevated: "#241E42"
    surface_active: "#312959"
    border_hairline: "#3B3269"
    ink_primary: "#FFFFFF"
    ink_muted: "#B8B2D8"
    action_primary_bg: "#6236FF"
    signal_ready_bg: "#C8FF42"
    signal_ready_fg: "#17132E"
  status:
    preparing_violet: "#6236FF"
    ready_volt: "#C8FF42"
    overdue_coral: "#FF4D6D"
    snoozed_slate: "#57507A"
typography:
  wordmark_family: "'Plus Jakarta Sans', 'Bricolage Grotesque', system-ui, sans-serif"
  wordmark_case: "lowercase"
  wordmark_weight: 800
  wordmark_tracking: "-0.03em"
  latin_ui_family: "'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif"
  arabic_rtl_family: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', system-ui, sans-serif"
  mono_queue_family: "'JetBrains Mono', 'Google Sans Code', ui-monospace, monospace"
  scale:
    display_hero: "clamp(2.25rem, 4vw, 3.5rem)"
    pager_ticket_code: "clamp(2.5rem, 6vw, 4rem)"
    h1_display: "2rem"
    h1: "1.875rem"
    wordmark: "1.5rem"
    h2: "1.375rem"
    h3: "1.125rem"
    body: "1rem"
    caption: "0.8125rem"
    micro_label: "0.75rem"
    dense_badge: "0.6875rem"
  line_heights:
    tight: 1.15
    heading: 1.25
    body: 1.6
    arabic_body: 1.75
spacing_and_shape:
  base_unit_px: 4
  container_guest_max_width: "480px"
  container_console_max_width: "1600px"
  radii:
    squircle_icon: "24%"
    card: "20px"
    modal_sheet: "28px"
    pill_button: "9999px"
    input: "14px"
    qr_frame: "16px"
  elevation:
    card_light: "0 8px 24px -6px rgba(23, 19, 46, 0.08)"
    primary_glow: "0 10px 26px -6px rgba(98, 54, 255, 0.38)"
    volt_ready_glow: "0 12px 32px -6px rgba(200, 255, 66, 0.50)"
motion_and_sensory:
  spring_snappy: "cubic-bezier(0.22, 1, 0.36, 1)"
  duration_fast_ms: 160
  duration_state_ms: 320
  bell_swing_keyframes: "rotate(-16deg) -> rotate(12deg) -> rotate(-8deg) -> rotate(0deg)"
  sonic_chime_notes: "G5 (783.99 Hz, 140ms) -> D6 (1174.66 Hz, 240ms)"
  haptic_ready_pattern_ms: [180, 80, 240]
---

# dingzi Design System (`DESIGN.md`)

**dingzi** (`ding` = counter service bell + `zi` = easy) is a multi-tenant hospitality operating platform powering bilingual digital menus, hardware-free browser pagers, table reservations, drive-thru/curbside pickup bays, and aggregator delivery handoffs.

## 1. Visual Philosophy & Anti-Gold / Anti-Black Guardrail

- **Consumer-Tech Energy, Zero Stuffiness:** dingzi deliberately rejects luxury hospitality clichés (no gold, no brass, no warm amber, no `#000000` tuxedo black) and regional delivery clichés (no tangerine orange or crimson red). Instead, it pairs **Electric Violet (`#6236FF`)** and **Volt Lime (`#C8FF42`)** with **Midnight Indigo (`#17132E`)** and **Pure White (`#FFFFFF`)** for an upbeat, instantaneous consumer-tech feel.
- **60–25–10–5 Proportion Discipline:**
  - **60% Pure White / Lilac Mist (`#FFFFFF` / `#F6F5FC`):** Keeps guest mobile menus bright, appetizing, and glare-resistant outdoors.
  - **25% Midnight Indigo (`#17132E`):** Anchors all typography on light screens (`18.0:1` AAA contrast) and serves as the zero-eye-strain canvas on Barista Order Prep tablets and outdoor curbside bollards.
  - **10% Electric Violet (`#6236FF`):** Drives primary actions, QR frames, active category tabs, and the `"Preparing"` progress state.
  - **5% Volt Lime (`#C8FF42`):** Reserved strictly for the **Ready / Chime** moment (*"Ding! Your food is ready."*), live sound-wave indicators, arrived drive-thru bay badges (`BAY 02`), and the dual dots over the `i` stems in `dingzi`.

## 2. Logo & Wordmark Rules (*The Volt Ringer*)

- **Master Lockup:** An Electric Violet (`#6236FF`) continuous-curve squircle containing a 25-degree tilted pure white (`#FFFFFF`) café service bell with a top tapper button, a Volt Lime (`#C8FF42`) spherical clapper underneath, and two pill-rounded `#C8FF42` concentric sound-wave arcs at the upper right — paired with the lowercase bold geometric wordmark **`dingzi`** in `#17132E` (light mode) or `#FFFFFF` (dark mode) featuring `#C8FF42` dots over both `i` stems.
- **Misuse Guardrails:**
  - Never capitalize the wordmark: always set `dingzi` in all-lowercase — never `Dingzi` or `DINGZI`.
  - Never recolor the bell or dots to gold or yellow: use exact Volt Lime (`#C8FF42`) for the clapper, sound arcs, and `i` dots.
  - Never place Volt Lime text on white: use Midnight Indigo (`#17132E`) or Pure White (`#FFFFFF`) for the wordmark depending on background luminance.
  - Never rotate, stretch, or unbox the bell: keep the bell nested inside its continuous-curve squircle at its fixed 25-degree tilt.
- **Clear Space & Minimum Size:** Maintain clear space of at least `0.25X` (where `X` is the squircle height) on all four sides. Never render the full horizontal lockup smaller than `92px` wide (`24px` height) on screen or `28mm` wide in print; below `92px`, switch to the standalone squircle icon (`min 16px`).
- **Thermal POS Receipt Stamp:** On 1-color `58mm`/`80mm` thermal printers and laser-etched acrylics, use `/brand/dingzi-icon-monochrome-thermal.svg` (solid `#17132E` silhouette with crisp white cutouts, zero gradients).

## 3. Accessibility & Color Pairing Rules (WCAG 2.1 AA/AAA)

- **Volt Lime (`#C8FF42`) Is a Surface Fill, Never Light-Mode Body Text:** Always place `#17132E` Midnight Indigo text on `#C8FF42` pills and banners (`15.3:1` AAA contrast). Never render `#C8FF42` text on `#FFFFFF`.
- **Electric Violet (`#6236FF`) Pairing:** Use `#FFFFFF` bold/medium UI text (`>= 14px`) on `#6236FF` solid buttons (`6.0:1` AA), and step down to **Hyper Indigo (`#4B1FE0`)** for small inline text links and focus rings on `#FFFFFF` (`8.2:1` AAA).
- **Reduced Motion:** Respect `@media (prefers-reduced-motion: reduce)` by replacing bell-swing and pulse rings with an instant opacity/color state transition while preserving audio and haptic alerts.

## 4. Bilingual (EN / AR RTL) & Queue Typography

- **Lowercase Brand Rule:** Always typeset **`dingzi`** in all-lowercase in headlines and UI chrome; in Arabic copy, write **«دِنغزي»** (brand) and **«دِنغ! طلبك جاهز.»** (hero slogan).
- **Logical CSS Properties Only:** Use `margin-inline`, `padding-inline`, `border-inline-start`, `inset-inline-end`, and `text-align: start` across React components so toggling `dir="rtl"` mirrors menus, modifier sheets, and pager timelines automatically.
- **Tabular Numerals on Live Queues:** Apply `font-variant-numeric: tabular-nums` with the monospace stack (`JetBrains Mono` / `Google Sans Code`) on all ticket codes (`A-042`), QAR prices (`35.00 QAR`), car plates, bay numbers, and Order Prep elapsed timers (`02:14`) so digits never jitter as seconds tick.

## 5. Verbal Identity & Bilingual Slogan Matrix

| Surface | English Copy | Arabic Copy (RTL) |
|---|---|---|
| **Hero Guest Slogan** | `Ding! Your food is ready.` | `دِنغ! طلبك جاهز.` |
| **B2B Platform Line** | `Menus, tables, and pickup — made dingzi.` | `المنيو والطاولات والاستلام.. بكل سهولة مع دِنغزي.` |
| **Pager Waiting State** | `Sit easy. We'll ding your phone when it's hot.` | `استرح مكانك، بننبهك أول ما يجهز طلبك.` |
| **Curbside & Drive-Thru** | `Park easy. Scan your bay and we'll bring it out.` | `صُفّ بسهولة، امسح رمز الموقف وبنجيب طلبك لسيارتك.` |
| **Walk-In Table Waitlist** | `Skip the crowd. Your table will ding you.` | `تجنّب الزحمة، طاولتك بتنبهك أول ما تفضى.` |

## 6. Sonic Signature & Multi-Tenant Coexistence

- **Sonic & Haptic Ready Alert:** Play a crisp rising perfect-fifth marimba-bell chime (`G5 783.99 Hz` for `140ms` -> `D6 1174.66 Hz` for `240ms`, `380ms` total) paired with vibration pattern `[180, 80, 240] ms` and a `#C8FF42` Volt Lime screen flash.
- **Tenant Menus Own the Craving:** Inside a café's public guest menu (`/v/:slug` or `/menu/:uuid`), the café's configured theme (`plum`, `ocean`, `terracotta`, or custom brand hex) owns 100% of category pills, item cards, and add-to-cart buttons. A subtle monochrome *"Powered by dingzi"* stamp (`opacity: 0.65`) sits only in the footer.
- **dingzi Owns the Ready Moment:** When the guest enters the live **Virtual Pager**, **Curbside Bay Check-In**, or **Staff Order Prep / Counter Pager Issuer**, the interface uses dingzi's signature `#6236FF` -> `#C8FF42` state system so guests across every café recognize the universal dingzi ready chime.
