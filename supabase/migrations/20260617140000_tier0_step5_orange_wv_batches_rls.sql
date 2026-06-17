-- Tier 0 Step 5 — 🟠 batch (2/2): wood_vinegar_batches.
-- App writes S/I/U (DailySheet new-batch upsert + close-batch update); it never
-- deletes (no anon DELETE grant; the DELETE policy was already area-gated before
-- Step 5 and is LEFT UNTOUCHED here, mirroring sales_dispatch in the 🟢 batch).
-- So replace only the permissive read/insert/update with area policies that ALSO
-- admit operators (is_operator()). Area = wood_vinegar. TO authenticated.
--
-- View dependency: DailySheet reads the batch list via v_wood_vinegar_batches,
-- which is ALREADY security_invoker -> tightening this base table's SELECT bites
-- that view immediately. The is_operator() SELECT term keeps the operator batch
-- dropdown populating post-tighten.
--
-- ROLLBACK: scripts/rollback_path_a.sql (🟠 wood_vinegar_batches block; the
-- pre-existing area DELETE policy is untouched in both directions).

drop policy "Operator app read" on public.wood_vinegar_batches;
drop policy "Operator app insert" on public.wood_vinegar_batches;
drop policy "Operator app update" on public.wood_vinegar_batches;

create policy "Wood vinegar batches viewable per area access" on public.wood_vinegar_batches
  for select to authenticated
  using (is_operator() or has_area_access('wood_vinegar', 'view'));
create policy "Wood vinegar batches writable per area edit" on public.wood_vinegar_batches
  for insert to authenticated
  with check (is_operator() or has_area_access('wood_vinegar', 'edit'));
create policy "Wood vinegar batches updatable per area edit" on public.wood_vinegar_batches
  for update to authenticated
  using (is_operator() or has_area_access('wood_vinegar', 'edit'))
  with check (is_operator() or has_area_access('wood_vinegar', 'edit'));
