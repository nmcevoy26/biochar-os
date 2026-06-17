-- Tier 0 Step 5 — 🔴 batch (1/4): wood_vinegar_fills.
-- Operator app uses S/I/U/D (DailySheet WV fill upsert + removeWvFill delete).
-- Replace the 4 permissive "Operator app *" policies AND the pre-existing
-- area-only DELETE policy ("Wood vinegar fills deletable per area edit", which
-- did NOT admit operators) with the standard 4 area policies that include
-- is_operator() on EVERY verb — operators must keep delete on the shared iPad.
-- Area = wood_vinegar. TO authenticated.
--
-- This is the exact table that 42501'd in Phase 5 (policy present, grant absent);
-- here policies do the work and anon grants stay until Step 7.
--
-- ROLLBACK: scripts/rollback_path_a.sql (🔴 wood_vinegar_fills block — restores
-- the 4 permissive policies AND the area-only DELETE, i.e. the two-DELETE-policy
-- original state).

drop policy "Operator app read" on public.wood_vinegar_fills;
drop policy "Operator app insert" on public.wood_vinegar_fills;
drop policy "Operator app update" on public.wood_vinegar_fills;
drop policy "Operator app delete" on public.wood_vinegar_fills;
drop policy "Wood vinegar fills deletable per area edit" on public.wood_vinegar_fills;

create policy "Wood vinegar fills viewable per area access" on public.wood_vinegar_fills
  for select to authenticated
  using (is_operator() or has_area_access('wood_vinegar', 'view'));
create policy "Wood vinegar fills writable per area edit" on public.wood_vinegar_fills
  for insert to authenticated
  with check (is_operator() or has_area_access('wood_vinegar', 'edit'));
create policy "Wood vinegar fills updatable per area edit" on public.wood_vinegar_fills
  for update to authenticated
  using (is_operator() or has_area_access('wood_vinegar', 'edit'))
  with check (is_operator() or has_area_access('wood_vinegar', 'edit'));
create policy "Wood vinegar fills deletable per area edit" on public.wood_vinegar_fills
  for delete to authenticated
  using (is_operator() or has_area_access('wood_vinegar', 'edit'));
