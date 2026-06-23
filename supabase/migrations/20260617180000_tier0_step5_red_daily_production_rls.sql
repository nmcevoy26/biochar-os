-- Tier 0 Step 5 — 🔴 batch (4/4, LAST): daily_production.
-- The run-logging hot path. Operator app uses S/I/U/D (DailySheet upsert;
-- Today.deleteRun). Replace the permissive quartet with operations-area policies
-- that admit operators on every verb. Area = operations. TO authenticated.
--
-- Unaffected by this change (verified): the audit seam trigger
-- audit_daily_production_anon_edits (Step 1) — it is BEFORE UPDATE, SECURITY
-- DEFINER (postgres), and fires on the allowed UPDATE; an operator past-run edit
-- still audits (user_id NULL, operator_id, reason). Today realtime depends on the
-- operator SELECT term (is_operator()).
--
-- ROLLBACK: scripts/rollback_path_a.sql (🔴 daily_production block).

drop policy "Operator app read" on public.daily_production;
drop policy "Operator app insert" on public.daily_production;
drop policy "Operator app update" on public.daily_production;
drop policy "Operator app delete" on public.daily_production;

create policy "Daily production viewable per area access" on public.daily_production
  for select to authenticated
  using (is_operator() or has_area_access('operations', 'view'));
create policy "Daily production writable per area edit" on public.daily_production
  for insert to authenticated
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Daily production updatable per area edit" on public.daily_production
  for update to authenticated
  using (is_operator() or has_area_access('operations', 'edit'))
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Daily production deletable per area edit" on public.daily_production
  for delete to authenticated
  using (is_operator() or has_area_access('operations', 'edit'));
