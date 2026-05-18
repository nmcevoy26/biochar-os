-- ============================================================================
-- Restore operator-app DELETE capability on tables that have permissive
-- SELECT/INSERT/UPDATE policies for the public/anon role but were deployed
-- without a matching DELETE policy. Default-deny RLS was silently 401'ing
-- legitimate operator actions:
--
--   1. src/pages/DailySheet.jsx handleSave: delete()+insert() pair on
--      daily_production_feedstock ran on every save. The DELETE was denied,
--      then the INSERT succeeded, leaving stale links when operators changed
--      feed source mid-shift.
--
--   2. src/pages/DailySheet.jsx removeBag: delete().eq('id', ...) on bulk_bags
--      was denied; optimistic-UI rollback fired with "Failed to delete bag"
--      alert. Operators have not been able to remove saved bags.
--
-- This is a Path A patch -- it matches the existing permissive operator-app
-- posture across the four CRUD verbs. It is NOT the long-term security
-- model. The Tier 0 RLS overhaul will replace all of these qual=true
-- "Operator app *" policies with role/area-aware checks (similar to the
-- has_area_access pattern already on wood_vinegar_*, wood_vinegar_dispatches,
-- and sales_dispatch).
--
-- Audit date: 2026-05-18. Tables already covered by a DELETE policy
-- (sales_dispatch, wood_vinegar_batches, wood_vinegar_fills,
-- wood_vinegar_dispatches) are intentionally NOT touched here.
-- ============================================================================

CREATE POLICY "Operator app delete" ON public.active_carbon_parameters
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.bulk_bags
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.daily_production
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.daily_production_feedstock
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.feedstock_sources
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.lab_results
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.machines
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.weekly_samples
  FOR DELETE TO public USING (true);

CREATE POLICY "Operator app delete" ON public.weekly_sample_production
  FOR DELETE TO public USING (true);
