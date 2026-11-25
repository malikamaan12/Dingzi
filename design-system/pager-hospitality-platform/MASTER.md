# Dingzi — Design System Master Specification

**Application Name:** Dingzi
**Category:** Multi-Tenant Hospitality Operating Platform (Digital Menus, Lock-Screen Virtual Pager, Table Reservations, Walk-In Waitlist & Curbside Dispatch)

---

## Official Dingzi Brand Color Tokens

| Token Role | Name | Hex | Suggested Text Pair & Contrast | Primary Surface / Usage |
|---|---|---|---|---|
| **Primary Brand** | Electric Violet | `#6236FF` | `#FFFFFF` on fill (6.0:1 AA) | Primary CTAs, active category pills, QR badges, and "Preparing" progress bar |
| **Deep Link Shade** | Hyper Indigo | `#4B1FE0` | On `#FFFFFF` (8.2:1 AAA) | Small inline text links, hover/pressed button state, and focus rings |
| **Ready Signal** | Volt Lime | `#C8FF42` | `#17132E` on fill (15.3:1 AAA) | Order Ready full-screen pager flash, sound-wave accents, `i`-dots, and "Bay Arrived" dispatch badge |
| **Dark Anchor** | Midnight Indigo | `#17132E` | `#FFFFFF` (18.0:1 AAA) | Wordmark typography, dark-mode Barista Pager Queue canvas, and drive-thru bollards |
| **Dark Elevated** | Cosmic Slate | `#241E42` | `#FFFFFF` (14.6:1 AAA) | Active ticket rows and modals inside the dark Barista / Staff console |
| **Light Canvas** | Pure White | `#FFFFFF` | `#17132E` (18.0:1 AAA) | Default guest menu cards, item overlays, and counter QR cards |
| **Soft Surface** | Lilac Mist | `#F6F5FC` | `#17132E` (16.7:1 AAA) | Page backdrop, search inputs, modifier group backgrounds, and inactive tabs |
| **Violet Tint** | Iris Wash | `#EFEAFF` | `#4B1FE0` (7.3:1 AAA) | Selected modifier chips, table slot highlights, and subtle feature callouts |
| **Muted Copy & Hairline** | Violet-Slate / Mist Border | `#57507A` / `#E5E2F2` | `#57507A` on `#FFFFFF` (7.1:1 AAA) | Secondary descriptions, timestamps, Arabic/English subtitles, and 1px dividers |

---

## Accessibility, RTL & Craft Rules

- **Contrast:** Every text pair meets WCAG AA/AAA (minimum 6.0:1 on Primary Brand `#6236FF`, 15.3:1 AAA on Ready Signal `#C8FF42` with `#17132E` Midnight Indigo text).
- **Wordmark Signature:** The **Dingzi** wordmark pairs Midnight Indigo (`#17132E`) or Pure White (`#FFFFFF`) letterforms with **Volt Lime (`#C8FF42`)** `i`-dots and acoustic sound-wave arcs.
- **Touch & Motion:** Minimum 44×44px interactive touch targets, Hyper Indigo (`#4B1FE0`) keyboard focus rings, full English & Arabic (`dir="rtl"`) mirroring down to 320px, and full `prefers-reduced-motion` support.
- **Iconography:** Strictly crisp Lucide / custom Dingzi SVG icons — zero emojis as UI controls.
