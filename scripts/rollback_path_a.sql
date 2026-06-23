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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Tier 0 Step 5 (🟡 batch) — Path-A rollback                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Drops the 🟡 area-access policies and restores the permissive "Operator app"
-- quartet on each table. Self-contained per table.

-- ── feedstock_sources ──────────────────────────────────────────────────────
drop policy if exists "Feedstock sources viewable per area access" on public.feedstock_sources;
drop policy if exists "Feedstock sources writable per area edit" on public.feedstock_sources;
drop policy if exists "Feedstock sources updatable per area edit" on public.feedstock_sources;
drop policy if exists "Feedstock sources deletable per area edit" on public.feedstock_sources;
create policy "Operator app read"   on public.feedstock_sources for select using (true);
create policy "Operator app insert" on public.feedstock_sources for insert with check (true);
create policy "Operator app update" on public.feedstock_sources for update using (true) with check (true);
create policy "Operator app delete" on public.feedstock_sources for delete using (true);

-- ── machines ───────────────────────────────────────────────────────────────
drop policy if exists "Machines viewable per area access" on public.machines;
drop policy if exists "Machines writable per area edit" on public.machines;
drop policy if exists "Machines updatable per area edit" on public.machines;
drop policy if exists "Machines deletable per area edit" on public.machines;
create policy "Operator app read"   on public.machines for select using (true);
create policy "Operator app insert" on public.machines for insert with check (true);
create policy "Operator app update" on public.machines for update using (true) with check (true);
create policy "Operator app delete" on public.machines for delete using (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Tier 0 Step 5 (🟠 batch) — Path-A rollback                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Restores the permissive "Operator app" set on the write-path tables. Self-
-- contained per table. NOTE wood_vinegar_batches: its DELETE was already
-- area-gated BEFORE Step 5 ("Wood vinegar batches deletable per area edit")
-- and is left untouched in both directions (mirrors sales_dispatch in 🟢).

-- ── weekly_samples ───────────────────────────────────────────────────────────
drop policy if exists "Weekly samples viewable per area access" on public.weekly_samples;
drop policy if exists "Weekly samples writable per area edit" on public.weekly_samples;
drop policy if exists "Weekly samples updatable per area edit" on public.weekly_samples;
drop policy if exists "Weekly samples deletable per area edit" on public.weekly_samples;
create policy "Operator app read"   on public.weekly_samples for select using (true);
create policy "Operator app insert" on public.weekly_samples for insert with check (true);
create policy "Operator app update" on public.weekly_samples for update using (true) with check (true);
create policy "Operator app delete" on public.weekly_samples for delete using (true);

-- ── wood_vinegar_batches (S/I/U only; pre-existing area DELETE untouched) ─────
drop policy if exists "Wood vinegar batches viewable per area access" on public.wood_vinegar_batches;
drop policy if exists "Wood vinegar batches writable per area edit" on public.wood_vinegar_batches;
drop policy if exists "Wood vinegar batches updatable per area edit" on public.wood_vinegar_batches;
create policy "Operator app read"   on public.wood_vinegar_batches for select using (true);
create policy "Operator app insert" on public.wood_vinegar_batches for insert with check (true);
create policy "Operator app update" on public.wood_vinegar_batches for update using (true) with check (true);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Tier 0 Step 5 (🔴 batch) — Path-A rollback                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
-- Restores the permissive "Operator app" set on the production-critical tables.
-- Self-contained per table. daily_production is LAST.

-- ── wood_vinegar_fills (restores 4 permissive + the area-only DELETE = the
--    original two-DELETE-policy state) ─────────────────────────────────────────
drop policy if exists "Wood vinegar fills viewable per area access" on public.wood_vinegar_fills;
drop policy if exists "Wood vinegar fills writable per area edit" on public.wood_vinegar_fills;
drop policy if exists "Wood vinegar fills updatable per area edit" on public.wood_vinegar_fills;
drop policy if exists "Wood vinegar fills deletable per area edit" on public.wood_vinegar_fills;
create policy "Operator app read"   on public.wood_vinegar_fills for select using (true);
create policy "Operator app insert" on public.wood_vinegar_fills for insert with check (true);
create policy "Operator app update" on public.wood_vinegar_fills for update using (true) with check (true);
create policy "Operator app delete" on public.wood_vinegar_fills for delete using (true);
create policy "Wood vinegar fills deletable per area edit" on public.wood_vinegar_fills for delete using (has_area_access('wood_vinegar', 'edit'));

-- ── daily_production_feedstock ───────────────────────────────────────────────
drop policy if exists "Feedstock links viewable per area access" on public.daily_production_feedstock;
drop policy if exists "Feedstock links writable per area edit" on public.daily_production_feedstock;
drop policy if exists "Feedstock links updatable per area edit" on public.daily_production_feedstock;
drop policy if exists "Feedstock links deletable per area edit" on public.daily_production_feedstock;
create policy "Operator app read"   on public.daily_production_feedstock for select using (true);
create policy "Operator app insert" on public.daily_production_feedstock for insert with check (true);
create policy "Operator app update" on public.daily_production_feedstock for update using (true) with check (true);
create policy "Operator app delete" on public.daily_production_feedstock for delete using (true);

-- ── bulk_bags ────────────────────────────────────────────────────────────────
drop policy if exists "Bulk bags viewable per area access" on public.bulk_bags;
drop policy if exists "Bulk bags writable per area edit" on public.bulk_bags;
drop policy if exists "Bulk bags updatable per area edit" on public.bulk_bags;
drop policy if exists "Bulk bags deletable per area edit" on public.bulk_bags;
create policy "Operator app read"   on public.bulk_bags for select using (true);
create policy "Operator app insert" on public.bulk_bags for insert with check (true);
create policy "Operator app update" on public.bulk_bags for update using (true) with check (true);
create policy "Operator app delete" on public.bulk_bags for delete using (true);

-- ── daily_production (LAST; restores permissive quartet. Audit trigger is
--    independent and untouched by Step 5) ──────────────────────────────────────
drop policy if exists "Daily production viewable per area access" on public.daily_production;
drop policy if exists "Daily production writable per area edit" on public.daily_production;
drop policy if exists "Daily production updatable per area edit" on public.daily_production;
drop policy if exists "Daily production deletable per area edit" on public.daily_production;
create policy "Operator app read"   on public.daily_production for select using (true);
create policy "Operator app insert" on public.daily_production for insert with check (true);
create policy "Operator app update" on public.daily_production for update using (true) with check (true);
create policy "Operator app delete" on public.daily_production for delete using (true);
