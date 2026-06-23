-- Tier 0 Step 5 — 🟠 batch (1/2): weekly_samples.
-- UNLIKE the 🟡 tables, the operator app WRITES this one (WeeklySample
-- create/update; Today deleteSample), so is_operator() is in BOTH the SELECT
-- and the write policies (operators must keep S/I/U/D on the shared iPad).
-- Area = operations (operators create these; production-side sampling).
-- All policies TO authenticated: anon (stale build) matches none -> clean
-- deny; grant cleanup is Step 7.
--
-- Realtime: Today.jsx subscribes to postgres_changes on weekly_samples, so
-- the operator SELECT term (is_operator()) is what keeps live updates working.
--
-- Step 6 forward-note: when v_weekly_summary flips to security_invoker, staff
-- roles that read weekly summary but lack operations-view will need the SELECT
-- OR-term widened (cf. lab_results in the 🟢 batch). Out of scope here.
--
-- ROLLBACK: scripts/rollback_path_a.sql (🟠 weekly_samples block).

drop policy "Operator app read" on public.weekly_samples;
drop policy "Operator app insert" on public.weekly_samples;
drop policy "Operator app update" on public.weekly_samples;
drop policy "Operator app delete" on public.weekly_samples;

create policy "Weekly samples viewable per area access" on public.weekly_samples
  for select to authenticated
  using (is_operator() or has_area_access('operations', 'view'));
create policy "Weekly samples writable per area edit" on public.weekly_samples
  for insert to authenticated
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Weekly samples updatable per area edit" on public.weekly_samples
  for update to authenticated
  using (is_operator() or has_area_access('operations', 'edit'))
  with check (is_operator() or has_area_access('operations', 'edit'));
create policy "Weekly samples deletable per area edit" on public.weekly_samples
  for delete to authenticated
  using (is_operator() or has_area_access('operations', 'edit'));
