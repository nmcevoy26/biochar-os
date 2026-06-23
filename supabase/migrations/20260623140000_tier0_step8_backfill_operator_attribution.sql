-- Tier 0 Step 8: backfill operator_id on the 8 clean single-initial historical
-- daily_production rows (operator_id was NULL, free-text `operator` is one clean
-- initial that maps unambiguously to an active operator).
--   JS -> Jess    (operators.id c9f32d77-484e-4aa9-a822-e215aeedc4fc)  [6 rows]
--   RC -> Rachael (operators.id a03089c0-6c57-4e08-b8f4-6e8d46c06344)  [2 rows]
--
-- WHY NOW: the app stamps operator_id: bag.operator_id ?? (loggedInOperator…) /
-- rowOperatorIdRef ?? (…) — a NULL-operator_id row gets the CURRENT editor stamped
-- on the first save that touches it (the GRIP00449 mechanism). Setting the correct
-- historical operator here forecloses a future edit mis-stamping these runs.
--
-- SCOPE: ONLY these 8 unambiguous rows, addressed by explicit id (not by a broad
-- `operator = 'JS'` predicate) for precision and exact reversibility. Multi-operator
-- rows (JS + RC + MC, etc.) are DEFERRED to the daily_production_operators join
-- table; rows containing unknown initials (TB / TW) are NEVER guessed. Free-text
-- `operator` is left untouched as the historical source of truth.
--
-- TRIGGER NOTE: audit_daily_production_anon_edits only audits changes to its 13
-- whitelisted fields (operator_id is not one), so this operator_id-only update
-- produces no audit_log rows.
--
-- ROLLBACK: scripts/rollback_step8_backfill.sql (restores operator_id = NULL on
-- exactly these 8 rows — all were NULL pre-backfill).

update public.daily_production set operator_id = 'c9f32d77-484e-4aa9-a822-e215aeedc4fc'
where id in (
  '5e0b2f7e-060a-4024-a896-fb5a522959a5',
  '4ed53b79-0505-481a-9d95-b63a52c09c15',
  '86e4cc3f-6b7c-4609-b63b-0f4bca46391e',
  'db04592b-c4ca-42f0-a26d-69eba0a16079',
  '8b187883-5555-42a0-8f60-68cc85cfeee4',
  '33960b59-0c8e-4b42-a592-6a51d19d128e'
) and operator_id is null;

update public.daily_production set operator_id = 'a03089c0-6c57-4e08-b8f4-6e8d46c06344'
where id in (
  '346476fb-590d-4ef0-91c4-4363195fe992',
  '1ddbe8f7-54c4-44ea-855a-8ab299b615c9'
) and operator_id is null;
