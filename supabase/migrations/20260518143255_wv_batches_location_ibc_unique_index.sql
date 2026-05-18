-- ============================================================================
-- Partial unique index on wood_vinegar_batches.location for the canonical
-- "IBC#N" format only. Catches simultaneous-operator races on new-batch
-- creation now that the autosave structural fix enables offline new batches
-- with pre-allocated UUIDs.
--
-- Partial deliberately: legacy rows with non-canonical location formats
-- ("IBC #1", "INC", "IBC", "IBC 3", etc.) are excluded by the WHERE clause,
-- so the migration applies with no backfill or collision resolution.
--
-- Going forward, all new-batch writes from biochar-os use the canonical
-- "IBC#N" format (no space) auto-allocated client-side. The partial index
-- enforces uniqueness on the new format only.
--
-- Cleanup of legacy location strings is out of scope. The Tier 0 backlog
-- can take it up if/when an operator-facing rename UI is needed.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS wood_vinegar_batches_location_ibc_unique
  ON public.wood_vinegar_batches (location)
  WHERE location ~ '^IBC#\d+$';
