-- Tier 0 Step 5 — 🔴 batch (2/4): daily_production_feedstock.
-- Link table (production_id, feedstock_id) — NO operator_id column. Operator app
-- uses SELECT + INSERT + DELETE (blind delete-by-production_id then insert-one on
-- every DailySheet save; Today.deleteRun hard-deletes). Replace the permissive
-- quartet with operations-area policies that admit operators on every verb.
-- (UPDATE is included for parity though the app never updates this table.)
-- Area = operations. TO authenticated.
--
-- ROLLBACK: scripts/rollback_path_a.sql (🔴 daily_production_feedstock block).

drop policy "Operator app read" on public.daily_production_feedstock;
drop policy "Operator app insert" on public.daily_production_feedstock;
drop policy "Operator app update" on public.daily_production_feedstock;
drop policy "Operator app delete" on public.daily_production_feedstock;

create policy "Feedstock links viewable per area access" on public.daily_production_feedstock
  for select to authenticated
  using (is_operator() or has_area_access('operations', 'view'));
create policy "Feedstock links writable per area edit" on public.daily_production_feedstock
  for insert to authenticated
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Feedstock links updatable per area edit" on public.daily_production_feedstock
  for update to authenticated
  using (is_operator() or has_area_access('operations', 'edit'))
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Feedstock links deletable per area edit" on public.daily_production_feedstock
  for delete to authenticated
  using (is_operator() or has_area_access('operations', 'edit'));
