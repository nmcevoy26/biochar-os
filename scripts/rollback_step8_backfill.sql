-- Tier 0 Step 8 — rollback: restore operator_id = NULL on exactly the 8 rows the
-- backfill (20260623140000_tier0_step8_backfill_operator_attribution.sql) set.
-- All 8 were operator_id NULL before the backfill. Free-text `operator` was never
-- touched, so the historical source of truth is intact either way.

update public.daily_production set operator_id = null
where id in (
  -- JS -> Jess (6)
  '5e0b2f7e-060a-4024-a896-fb5a522959a5',
  '4ed53b79-0505-481a-9d95-b63a52c09c15',
  '86e4cc3f-6b7c-4609-b63b-0f4bca46391e',
  'db04592b-c4ca-42f0-a26d-69eba0a16079',
  '8b187883-5555-42a0-8f60-68cc85cfeee4',
  '33960b59-0c8e-4b42-a592-6a51d19d128e',
  -- RC -> Rachael (2)
  '346476fb-590d-4ef0-91c4-4363195fe992',
  '1ddbe8f7-54c4-44ea-855a-8ab299b615c9'
);
