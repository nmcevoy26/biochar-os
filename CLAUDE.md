# CLAUDE.md — Biochar-OS (TimberLoop Production Sheet)

## Project Overview
iPad-focused PWA for biochar production operators to log daily runs and weekly samples. Deployed as a static site with Supabase backend.

## Behavioral Guidelines

Adapted from Andrej Karpathy's coding principles. These bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think before coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.
- For schema, RLS, or migration work: investigate existing structure and data first via the Supabase MCP. Never apply migrations to prod without explicit approval.

### 2. Simplicity first

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Test: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

Touch only what you must. Clean up only your own mess.

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

Test: Every changed line should trace directly to the user's request.

### 4. Goal-driven execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step or multi-phase work:
- Use the Sub-phase A/B/C... pattern. Investigation and design first, pause for approval, then execute.
- State a brief plan with verifiable checkpoints:
  1. [Step] → verify: [check]
  2. [Step] → verify: [check]
  3. [Step] → verify: [check]
- Pause again before each significant step: schema change, prod deployment, irreversible operation.

Strong success criteria allow independent looping. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:**
- Fewer unnecessary changes in diffs
- Fewer rewrites due to overcomplication
- Clarifying questions come before implementation, not after mistakes
- Multi-phase tasks pause at natural decision points rather than barreling through

## Tech Stack
- **Frontend:** React 18 (JSX) + Vite + Tailwind CSS 3
- **Backend:** Supabase (Postgres + Auth)
- **PWA:** vite-plugin-pwa with injectManifest strategy, custom service worker (`src/sw.js`)
- **Hosting:** Static build (Vercel-compatible)

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build to `dist/`
- `npm run preview` — Preview production build locally

## Project Structure
```
src/
├── App.jsx              # Root: auth gate, tab routing, header, offline banner
├── main.jsx             # Entry point
├── index.css            # Tailwind base + custom utility classes
├── sw.js                # Service worker (network-first caching)
├── lib/
│   ├── supabase.js      # Supabase client, machine IDs, helpers
│   └── offline.js       # Offline queue (localStorage-backed)
├── components/
│   ├── TabBar.jsx       # Bottom tab navigation
│   ├── NumberInput.jsx  # Touch-friendly number stepper
│   ├── ToggleGroup.jsx  # Segmented button group
│   ├── SaveConfirmation.jsx
│   ├── UpdateBanner.jsx # SW update prompt
│   └── PullToRefresh.jsx
└── pages/
    ├── PinLogin.jsx     # Operator PIN login
    ├── Today.jsx        # Today overview
    ├── DailySheet.jsx   # Daily production run sheet
    └── WeeklySample.jsx # Weekly sample tracking
```

## Key Conventions
- **No test framework** — no tests exist yet
- **Tailwind only** — no CSS modules or styled-components; custom classes defined in `index.css`
- **Custom colors:** `primary` (#1e3a5f), `primary-light` (#2d5a8e) defined in tailwind.config.js
- **iPad-first design:** large touch targets (py-3.5, text-lg), safe-area padding for notch/status bar
- **Offline-first:** all writes go through offline queue; flushed on reconnect
- **Auth:** PIN-based login stored in sessionStorage (`grip_operator_id`, `grip_operator_name`)
- **Operator floor identity (Tier 0 doctrine):** `operators.auth_user_id` links each operator to a synthetic auth user (`operator-<name>@timberloop.test`, `app_metadata.role='operator'` + `operator_id`, no `user_roles` row). PIN login will mint real sessions from it (Step 4) and the audit seam's `is_operator()` keys on it. It is **service-role-owned** — provisioned only via the `operator-admin` edge function (`supabase/functions/operator-admin/`) or service-role scripts; a DB trigger (`guard_operator_floor_identity`) blocks dashboard sessions from changing it. Never point it at a staff/dashboard auth user.
- **Two machines:** CP500 and CP1000 (UUIDs in `src/lib/supabase.js`)
- **Supabase credentials** are hardcoded (anon key only) — no .env required for dev

## Code Quality Rules
- Components must stay under 150 lines. If a component exceeds this, extract sub-components or move logic to `src/lib/`
- Shared logic (date formatting, Supabase queries, validation) goes in `src/lib/`, not duplicated across pages
- No inline styles — Tailwind classes only
- All Supabase calls must have error handling (try/catch or .then/.catch)
- Remove unused imports before committing
- Use consistent naming: camelCase for functions/variables, PascalCase for components

## Before Every Commit
- Run `npm run build` and fix any errors before committing
- Test the affected page in the browser to verify it works
- Write a clear, concise commit message describing what changed

## Git Workflow
- Feature branches off `main` using `feat/...`, `fix/...`, or `chore/...` naming
- Open a PR to `main` for review and merge
- Confirm changes work on the Vercel preview URL before merging
- The `staging` branch exists as a long-lived integration marker (currently in sync with `main`) but isn't used as an active integration branch for new work
- Push directly to `main` only for urgent hotfixes

## Supabase Context
- Project ref: `enkhbhllkvvuykantdgv`
- Use the Supabase MCP tools to inspect tables before writing queries
- Views (`v_daily_production`, `v_bulk_bags`, `v_weekly_summary`, `v_sales_dispatch`) handle all computed fields — don't duplicate calculation logic in the frontend
- RLS is currently open (anon access) — auth will be tightened later

## Design Context
- iPad-first, operators wear gloves, bright outdoor conditions
- All touch targets minimum 48px height
- Number values displayed in large bold text (operators glance from 2m away)
- Forms should mirror the paper run sheets the operators already know

## Supabase Tables
- `daily_sheets` — one row per machine/date/shift
- `weekly_samples` — one row per machine/week

## Style Patterns
- Form fields use `input-field` and `field-label` utility classes
- Buttons use `btn-primary` utility class
- Toggle switches: inline `Toggle` component in WeeklySample (flexbox pill + translateX knob)
- Segmented controls: `ToggleGroup` component

## Lessons Learned & Gotchas

### Offline persistence

**Pre-allocated UUIDs + upsert + queue coalescing is the right offline pattern.** When operator state needs to persist offline, allocate the record's UUID client-side before any save, use upsert (not insert) on the queue, and coalesce queue ops by `data.id` to prevent duplicates. This eliminates 409 conflicts on reconnect-drain. Modern industry standard (Notion, Linear, Asana pattern).

### Autosave

**Don't use a boolean dirty flag as the autosave effect dep.** React bails on the rerender when setting `dirty=true` on already-true state, so the timer never resets per keystroke. Use a `dirtyTick` counter that bumps on every edit instead — that's the real per-keystroke debounce. Save-on-blur for free-text fields prevents mid-type erase races (industry standard from Google Forms, Notion).

### Phase 5 RLS regressions

Phase 5's dashboard RLS overhaul broke biochar-os twice (WV access, missing DELETE policies). Pattern: when the dashboard tightens RLS on a table that biochar-os also writes to, revert to permissive `qual=true` on operator-write paths. Tier 0 RLS overhaul will properly restrict both contexts.
