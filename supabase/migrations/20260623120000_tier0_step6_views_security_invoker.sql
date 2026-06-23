-- Tier 0 Step 6: convert the three RLS-bypassing views to security_invoker.
-- v_daily_production (read by biochar-os Today.jsx + dashboard), v_bulk_bags and
-- v_weekly_summary (dashboard-only). Until now these ran as definer (postgres)
-- and bypassed RLS entirely, so Step 5's table tightening was incomplete — anon
-- could still read all production data through them. This closes that hole.
--
-- Uses ALTER VIEW ... SET, NOT CREATE OR REPLACE VIEW: re-creating the view body
-- would have to repeat WITH (security_invoker = on) or it silently resets to
-- definer (the exact regression that put these three back to definer after the
-- 20260511 hygiene migration). ALTER VIEW only flips the flag, body untouched.
--
-- Readability post-flip verified (Sub-phase A + dashboard-repo readership check,
-- 2026-06-23): every current staff role has operations_access >= view, so the
-- inner-join spine (daily_production/machines/bulk_bags, all is_operator() OR
-- ops-view) returns rows for all readers; the floor operator reads
-- v_daily_production via is_operator(). LEFT-joined area tables (corc_issuance =
-- corcs OR can_export_data(); dispatch_bags = sales-view) degrade to NULL columns
-- for a reader lacking that area — no row loss, no error. authenticated holds
-- SELECT grants on every referenced table, so no hard 42501.
--
-- STANDING RULE (do not drop): every future CREATE OR REPLACE VIEW on these must
-- repeat WITH (security_invoker = on) or it silently regresses to definer.
--
-- ROLLBACK (per view, instant):
--   ALTER VIEW public.v_daily_production SET (security_invoker = off);
--   ALTER VIEW public.v_bulk_bags        SET (security_invoker = off);
--   ALTER VIEW public.v_weekly_summary   SET (security_invoker = off);

alter view public.v_bulk_bags      set (security_invoker = on);
alter view public.v_weekly_summary set (security_invoker = on);
alter view public.v_daily_production set (security_invoker = on);
