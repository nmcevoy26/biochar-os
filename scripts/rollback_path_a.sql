-- Tier 0 Step 5 (🟢 batch) — Path-A rollback
-- Restores the exact permissive "Operator app" policies that the 🟢 migration
-- drops, and removes the replacement area-access policies. Run per table as
-- needed (each block is self-contained), or the whole file to revert the batch.
-- Captured from live staging/prod pg_policies 2026-06-10 (both identical).

-- ── lab_results ────────────────────────────────────────────────────────────
drop policy if exists "Lab results viewable per area access" on public.lab_results;
drop policy if exists "Lab results writable per area edit" on public.lab_results;
drop policy if exists "Lab results updatable per area edit" on public.lab_results;
drop policy if exists "Lab results deletable per area edit" on public.lab_results;
create policy "Operator app read"   on public.lab_results for select using (true);
create policy "Operator app insert" on public.lab_results for insert with check (true);
create policy "Operator app update" on public.lab_results for update using (true) with check (true);
create policy "Operator app delete" on public.lab_results for delete using (true);

-- ── active_carbon_parameters ───────────────────────────────────────────────
drop policy if exists "Active carbon parameters viewable per area access" on public.active_carbon_parameters;
drop policy if exists "Active carbon parameters writable per area edit" on public.active_carbon_parameters;
drop policy if exists "Active carbon parameters updatable per area edit" on public.active_carbon_parameters;
drop policy if exists "Active carbon parameters deletable per area edit" on public.active_carbon_parameters;
create policy "Operator app read"   on public.active_carbon_parameters for select using (true);
create policy "Operator app insert" on public.active_carbon_parameters for insert with check (true);
create policy "Operator app update" on public.active_carbon_parameters for update using (true) with check (true);
create policy "Operator app delete" on public.active_carbon_parameters for delete using (true);

-- ── sales_dispatch (3 permissive policies only; the area-edit DELETE policy
--    predates Step 5 and is untouched in both directions) ───────────────────
drop policy if exists "Sales dispatch viewable per area access" on public.sales_dispatch;
drop policy if exists "Sales dispatch writable per area edit" on public.sales_dispatch;
drop policy if exists "Sales dispatch updatable per area edit" on public.sales_dispatch;
create policy "Operator app read"   on public.sales_dispatch for select using (true);
create policy "Operator app insert" on public.sales_dispatch for insert with check (true);
create policy "Operator app update" on public.sales_dispatch for update using (true) with check (true);

-- ── weekly_sample_production (Step 5 adds NO replacement policies — the
--    rollback is purely restoring the permissive set) ───────────────────────
create policy "Operator app read"   on public.weekly_sample_production for select using (true);
create policy "Operator app insert" on public.weekly_sample_production for insert with check (true);
create policy "Operator app update" on public.weekly_sample_production for update using (true) with check (true);
create policy "Operator app delete" on public.weekly_sample_production for delete using (true);
