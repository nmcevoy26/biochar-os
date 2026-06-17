-- Tier 0 Step 5 — 🟡 batch: tighten RLS on feedstock_sources + machines, the
-- two tables the operator app only READS (feedstock_sources directly via the
-- DailySheet feed-source dropdown; machines indirectly through the v_* views).
-- Neither is ever written by biochar-os, so writes become dashboard-only while
-- SELECT keeps operators in via is_operator() — so the dropdown still populates
-- post-flip, and the views keep reading once Step 6 makes them security_invoker.
--
-- Differs from the 🟢 batch only in the SELECT term: 🟢 tables carry no
-- is_operator() (operators have no business there); these two do, because the
-- floor app reads them.
--
-- All policies TO authenticated (Step 3 lesson): anon keeps its grants (grant
-- cleanup is Step 7) but matches no policy -> empty SELECT, RLS-violation on
-- writes. Operator sessions pass is_operator() for SELECT and fail every
-- has_area_access() check on writes -> read-only, exactly as the app uses them.
--
-- ROLLBACK: scripts/rollback_path_a.sql (restores the exact permissive
-- quartet per table).

-- ── feedstock_sources ──────────────────────────────────────────────────────
drop policy "Operator app read" on public.feedstock_sources;
drop policy "Operator app insert" on public.feedstock_sources;
drop policy "Operator app update" on public.feedstock_sources;
drop policy "Operator app delete" on public.feedstock_sources;

create policy "Feedstock sources viewable per area access" on public.feedstock_sources
  for select to authenticated
  using (
    is_operator()
    or has_area_access('operations', 'view')
  );
create policy "Feedstock sources writable per area edit" on public.feedstock_sources
  for insert to authenticated
  with check (has_area_access('operations', 'edit'));
create policy "Feedstock sources updatable per area edit" on public.feedstock_sources
  for update to authenticated
  using (has_area_access('operations', 'edit'))
  with check (has_area_access('operations', 'edit'));
create policy "Feedstock sources deletable per area edit" on public.feedstock_sources
  for delete to authenticated
  using (has_area_access('operations', 'edit'));

-- ── machines ───────────────────────────────────────────────────────────────
drop policy "Operator app read" on public.machines;
drop policy "Operator app insert" on public.machines;
drop policy "Operator app update" on public.machines;
drop policy "Operator app delete" on public.machines;

create policy "Machines viewable per area access" on public.machines
  for select to authenticated
  using (
    is_operator()
    or has_area_access('operations', 'view')
  );
create policy "Machines writable per area edit" on public.machines
  for insert to authenticated
  with check (has_area_access('operations', 'edit'));
create policy "Machines updatable per area edit" on public.machines
  for update to authenticated
  using (has_area_access('operations', 'edit'))
  with check (has_area_access('operations', 'edit'));
create policy "Machines deletable per area edit" on public.machines
  for delete to authenticated
  using (has_area_access('operations', 'edit'));
