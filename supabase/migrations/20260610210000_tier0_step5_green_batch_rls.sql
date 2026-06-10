-- Tier 0 Step 5 — 🟢 batch: replace Path-A permissive policies on the four
-- tables the operator app never touches (zero biochar-os src references; the
-- offline queue can only replay app-enqueued ops, so it can't reach them
-- either). Dashboard (authenticated staff) is the only legitimate client —
-- audit evidence: every lab_results/sales_dispatch audit row carries user_id.
--
-- All new policies are TO authenticated (Step 3 lesson): anon keeps its
-- grants (grant cleanup is Step 7) but matches no policy -> empty SELECT,
-- RLS-violation on writes. Operator sessions (authenticated, no user_roles
-- row) fail every has_area_access() check -> same clean deny. No is_operator()
-- term on purpose: operators have no business on these tables.
--
-- SELECT scopes wider than the owning area where the dashboard already
-- grants wider read intent (approved judgment calls):
--   * lab_results: Home "Recent lab results" is deliberately operations-gated
--     (homeSections.ts — "operators and sales can monitor") and
--     useLabSamplingStatus reads the table directly; can_export_data() keeps
--     the sales CORC-Calculation export working after Step 6 flips
--     v_weekly_summary to security_invoker (parity with corc_issuance).
--   * sales_dispatch: v_sales_dispatch is ALREADY security_invoker, so
--     Inventory/Home bag-inventory (operations-gated) hit this table's RLS
--     today, not at Step 6.
--
-- weekly_sample_production is dead (no refs in either app, no audit rows):
-- policies dropped with NO replacement -> RLS-on/zero-policy default-deny,
-- service-role only (the operator_login_attempts posture).
--
-- ROLLBACK: scripts/rollback_path_a.sql (restores the exact permissive set
-- per table; sales_dispatch's pre-existing area-edit DELETE policy is
-- untouched in both directions).

-- ── lab_results ────────────────────────────────────────────────────────────
drop policy "Operator app read" on public.lab_results;
drop policy "Operator app insert" on public.lab_results;
drop policy "Operator app update" on public.lab_results;
drop policy "Operator app delete" on public.lab_results;

create policy "Lab results viewable per area access" on public.lab_results
  for select to authenticated
  using (
    has_area_access('corcs', 'view')
    or has_area_access('operations', 'view')
    or can_export_data()
  );
create policy "Lab results writable per area edit" on public.lab_results
  for insert to authenticated
  with check (has_area_access('corcs', 'edit'));
create policy "Lab results updatable per area edit" on public.lab_results
  for update to authenticated
  using (has_area_access('corcs', 'edit'))
  with check (has_area_access('corcs', 'edit'));
create policy "Lab results deletable per area edit" on public.lab_results
  for delete to authenticated
  using (has_area_access('corcs', 'edit'));

-- ── active_carbon_parameters ───────────────────────────────────────────────
drop policy "Operator app read" on public.active_carbon_parameters;
drop policy "Operator app insert" on public.active_carbon_parameters;
drop policy "Operator app update" on public.active_carbon_parameters;
drop policy "Operator app delete" on public.active_carbon_parameters;

create policy "Active carbon parameters viewable per area access" on public.active_carbon_parameters
  for select to authenticated
  using (has_area_access('corcs', 'view'));
create policy "Active carbon parameters writable per area edit" on public.active_carbon_parameters
  for insert to authenticated
  with check (has_area_access('corcs', 'edit'));
create policy "Active carbon parameters updatable per area edit" on public.active_carbon_parameters
  for update to authenticated
  using (has_area_access('corcs', 'edit'))
  with check (has_area_access('corcs', 'edit'));
create policy "Active carbon parameters deletable per area edit" on public.active_carbon_parameters
  for delete to authenticated
  using (has_area_access('corcs', 'edit'));

-- ── sales_dispatch (area-edit DELETE policy already exists; untouched) ─────
drop policy "Operator app read" on public.sales_dispatch;
drop policy "Operator app insert" on public.sales_dispatch;
drop policy "Operator app update" on public.sales_dispatch;

create policy "Sales dispatch viewable per area access" on public.sales_dispatch
  for select to authenticated
  using (
    has_area_access('sales', 'view')
    or has_area_access('operations', 'view')
  );
create policy "Sales dispatch writable per area edit" on public.sales_dispatch
  for insert to authenticated
  with check (has_area_access('sales', 'edit'));
create policy "Sales dispatch updatable per area edit" on public.sales_dispatch
  for update to authenticated
  using (has_area_access('sales', 'edit'))
  with check (has_area_access('sales', 'edit'));

-- ── weekly_sample_production: default-deny (no replacement policies) ───────
drop policy "Operator app read" on public.weekly_sample_production;
drop policy "Operator app insert" on public.weekly_sample_production;
drop policy "Operator app update" on public.weekly_sample_production;
drop policy "Operator app delete" on public.weekly_sample_production;
