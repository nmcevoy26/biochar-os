# CLAUDE.md — Biochar-OS (TimberLoop Production Sheet)

## Project Overview
iPad-focused PWA for biochar production operators to log daily runs and weekly samples. Deployed as a static site with Supabase backend.

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
- Use `staging` branch for new features: `git checkout -b staging`
- Only merge to `main` after confirming changes work on the Vercel preview URL
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
