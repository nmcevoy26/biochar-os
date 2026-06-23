-- Tier 0 Step 5 — 🔴 batch (3/4): bulk_bags.
-- Operator app uses S/I/U/D (DailySheet add/edit bag upsert; remove saved bag;
-- Today.deleteRun cascade). Replace the permissive quartet with operations-area
-- policies that admit operators on every verb. Area = operations.
-- TO authenticated. operator_id preserve-on-edit is already handled in app code
-- (PR #20: operator_id: bag.operator_id ?? (loggedInOperator?.id || null)).
--
-- ROLLBACK: scripts/rollback_path_a.sql (🔴 bulk_bags block).

drop policy "Operator app read" on public.bulk_bags;
drop policy "Operator app insert" on public.bulk_bags;
drop policy "Operator app update" on public.bulk_bags;
drop policy "Operator app delete" on public.bulk_bags;

create policy "Bulk bags viewable per area access" on public.bulk_bags
  for select to authenticated
  using (is_operator() or has_area_access('operations', 'view'));
create policy "Bulk bags writable per area edit" on public.bulk_bags
  for insert to authenticated
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Bulk bags updatable per area edit" on public.bulk_bags
  for update to authenticated
  using (is_operator() or has_area_access('operations', 'edit'))
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Bulk bags deletable per area edit" on public.bulk_bags
  for delete to authenticated
  using (is_operator() or has_area_access('operations', 'edit'));
