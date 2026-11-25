# Workspace Engineering & Design Skill Mandate — Dingzi

On **every task** in this repository (`a:\Software Projects\pager`), you MUST actively apply all three installed skill systems together:

1. **`gstack` (`.agents/skills/gstack*`) — Engineering Sprint & Review Discipline**
   - **Reuse Ladder First:** Before writing new code, check existing repo helpers (`shared/`, `server/`, `client/src/lib/`), standard library, native platform/PostgreSQL constraints, and already-installed packages before adding dependencies.
   - **Plan -> Build -> Review -> Verify -> QA:** Pressure-test schema, tenant isolation, race conditions, and concurrency first; implement root-cause solutions; review diffs critically as a staff engineer; run full verification (`npm run check`, `npm test`, `npm run build`, `npm run cloud:build`, `npm run cloud:test`); and verify live UI flows.
   - **Builder Voice:** Direct, concrete communication naming exact files, endpoints, commands, and user-visible outcomes. Zero filler or placeholder `TODO`s.

2. **`ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max`) — Dingzi Design System, RTL & Accessibility Intelligence**
   - Read `design-system/pager-hospitality-platform/MASTER.md` first, plus any page override in `design-system/pager-hospitality-platform/pages/` (`staff-console.md`).
   - Enforce **Dingzi**'s official AAA/AA brand tokens:
     - Primary Brand: Electric Violet `#6236FF` (`#FFFFFF` text, 6.0:1)
     - Deep Link Shade: Hyper Indigo `#4B1FE0` (8.2:1 AAA on `#FFFFFF`)
     - Ready Signal: Volt Lime `#C8FF42` (`#17132E` text, 15.3:1 AAA)
     - Dark Anchor: Midnight Indigo `#17132E` (`#FFFFFF` text, 18.0:1 AAA)
     - Dark Elevated: Cosmic Slate `#241E42` (`#FFFFFF` text, 14.6:1 AAA)
     - Light Canvas: Pure White `#FFFFFF` (`#17132E` text, 18.0:1 AAA)
     - Soft Surface: Lilac Mist `#F6F5FC` (`#17132E` text, 16.7:1 AAA)
     - Violet Tint: Iris Wash `#EFEAFF` (`#4B1FE0` text, 7.3:1 AAA)
     - Muted Copy & Hairline: Violet-Slate `#57507A` / Mist Border `#E5E2F2` (7.1:1 AAA)
   - Enforce 44x44px minimum touch targets with 8px+ separation, Hyper Indigo (`#4B1FE0`) focus rings, atomic `role="status"` live announcements, dual cues (icon + label + color) on order/pager states, and seamless English/Arabic (`dir="rtl"`) mirroring down to 320px with `prefers-reduced-motion` support.

3. **`taste-skill` (`.agents/skills/taste-skill`) — Anti-Slop Frontend Craft**
   - Build interfaces that read like a real shipped hospitality product (**Dingzi**), never a generic template.
   - **Strict bans:** Never use emojis as UI icons (use Lucide/Dingzi SVGs), never use scroll-jacking or gratuitous fade-ins on every row, and never ship placeholder/lorem-ipsum copy.
   - **Tactile micro-interactions:** Intentional 150-250ms hover/press transitions (`cursor-pointer` on all interactive controls), balanced container edges, clear typographic hierarchy, and single dominant primary action per view.

## Infrastructure Isolation Invariant

- Never connect, deploy, migrate, or back up against legacy Cafe Menu accounts, databases, Worker origins, or port `5100`. Keep local development on port `5200` (`data/database`) and cloud configuration gated by `scripts/legacy-guard.mjs`.
