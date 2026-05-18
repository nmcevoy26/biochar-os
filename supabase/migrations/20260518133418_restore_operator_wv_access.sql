-- ============================================================================
-- Restore operator-app UPDATE access to wood_vinegar_fills.
--
-- Phase 5's RLS overhaul (20260517112505_phase5_rls_per_area_helper and
-- related migrations) narrowed UPDATE on this table to authenticated +
-- has_area_access('wood_vinegar','edit'). The biochar-os operator app
-- calls Supabase as the anon role (PIN-based auth lives in-app), so
-- every WV-fill update returns 401. This breaks the upsert path the
-- autosave structural fix relies on -- first save inserts cleanly,
-- second save runs as UPDATE and fails.
--
-- This is a Path A holding fix matching the permissive operator-app
-- posture on the other operator-write tables (daily_production,
-- bulk_bags, etc.). The Tier 0 RLS overhaul will replace this with
-- proper role/area-aware checks once the operator app has real auth.
--
-- Scope intentionally narrow:
--   * wood_vinegar_fills UPDATE policy + GRANT only.
--   * DELETE policy on wood_vinegar_fills left as has_area_access --
--     DailySheet doesn't delete fills; revisit if that changes.
--   * wood_vinegar_batches is already on the permissive operator
--     pattern for SELECT/INSERT/UPDATE. No change needed.
--   * wood_vinegar_dispatches is sales-only and the operator app
--     never touches it. No change.
-- ============================================================================

DROP POLICY IF EXISTS "Wood vinegar fills updatable per area edit"
  ON public.wood_vinegar_fills;

CREATE POLICY "Operator app update" ON public.wood_vinegar_fills
  FOR UPDATE TO public USING (true) WITH CHECK (true);

GRANT UPDATE ON public.wood_vinegar_fills TO anon, authenticated;
