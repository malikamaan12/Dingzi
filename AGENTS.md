# Workspace Engineering & Design Skill Mandate

On **every task** in this repository (`a:\Software Projects\pager`), you MUST actively apply all three installed skill systems together:

1. **`gstack` (`.agents/skills/gstack*`) — Engineering Sprint & Review Discipline**
   - **Reuse Ladder First:** Before writing new code, check existing repo helpers (`shared/`, `server/`, `client/src/lib/`), standard library, native platform/PostgreSQL constraints, and already-installed packages before adding dependencies.
   - **Plan -> Build -> Review -> Verify -> QA:** Pressure-test schema, tenant isolation, race conditions, and concurrency first; implement root-cause solutions; review diffs critically as a staff engineer; run full verification (`npm run check`, `npm test`, `npm run build`, `npm run cloud:build`, `npm run cloud:test`); and verify live UI flows in a browser.
   - **Builder Voice:** Direct, concrete communication naming exact files, endpoints, commands, and user-visible outcomes. Zero filler or placeholder `TODO`s.

2. **`ui-ux-pro-max` (`.agents/skills/ui-ux-pro-max`) — Design System, RTL & Accessibility Intelligence**
   - Read `design-system/pager-hospitality-platform/MASTER.md` first, plus any page override in `design-system/pager-hospitality-platform/pages/` (`staff-console.md`).
   - Query `scripts/search.py` when introducing new UI patterns, charts, RTL layouts (`--rtl=full`), or stack components (`--stack shadcn`, `--stack react`).
   - Enforce WCAG AA contrast (4.5:1+), 44x44px minimum touch targets with 8px+ separation, visible keyboard focus rings, atomic `role="status"` live announcements for async counters/timers, and dual cues (icon + label + color, never color alone) on KDS/pager states.
   - Support seamless English and Arabic (`dir="rtl"`) mirroring down to 320px width with zero horizontal overflow and full `prefers-reduced-motion` support.

3. **`taste-skill` (`.agents/skills/taste-skill`) — Anti-Slop Frontend Craft**
   - Build interfaces that read like a real shipped hospitality product, never a generic AI template.
   - **Strict bans:** Never use emojis as UI icons (use Lucide/brand SVGs), never use default violet/indigo gradients, never use scroll-jacking or gratuitous fade-ins on every row, and never ship placeholder/lorem-ipsum copy.
   - **Tactile micro-interactions:** Intentional 150-250ms hover/press transitions (`cursor-pointer` on all interactive controls), balanced container edges, clear typographic hierarchy, and single dominant primary action per view.

## Infrastructure Isolation Invariant

- Never connect, deploy, migrate, or back up against legacy Cafe Menu accounts, databases, Worker origins, or port `5100`. Keep local development on port `5200` (`data/database`) and cloud configuration gated by `scripts/legacy-guard.mjs`.
