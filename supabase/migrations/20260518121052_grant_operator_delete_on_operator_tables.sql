-- ============================================================================
-- Follow-up to 20260518120411_restore_operator_delete_policies.
--
-- That migration added "Operator app delete" RLS policies but did not grant
-- table-level DELETE to the anon/authenticated roles, so the operator app
-- (anon role + PIN auth) still hit "permission denied for table bulk_bags"
-- on every delete attempt. RLS policies only filter what a role can act on;
-- the role must first have the underlying table privilege.
--
-- This patches parity with the INSERT/UPDATE grants already in place across
-- all 9 tables: GRANT to both anon and authenticated, matching the
-- intentionally permissive operator-app posture. Same Tier 0 caveat applies.
--
-- The original migration should have bundled grants + policy in a single
-- file (as the dashboard's 20260512075207_dispatch_delete_grants_and_policy
-- did). Future operator-write migrations should follow that pattern.
-- ============================================================================

GRANT DELETE ON public.active_carbon_parameters    TO anon, authenticated;
GRANT DELETE ON public.bulk_bags                   TO anon, authenticated;
GRANT DELETE ON public.daily_production            TO anon, authenticated;
GRANT DELETE ON public.daily_production_feedstock  TO anon, authenticated;
GRANT DELETE ON public.feedstock_sources           TO anon, authenticated;
GRANT DELETE ON public.lab_results                 TO anon, authenticated;
GRANT DELETE ON public.machines                    TO anon, authenticated;
GRANT DELETE ON public.weekly_samples              TO anon, authenticated;
GRANT DELETE ON public.weekly_sample_production    TO anon, authenticated;
