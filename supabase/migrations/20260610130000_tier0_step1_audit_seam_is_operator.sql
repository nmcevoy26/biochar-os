-- Tier 0 Step 1 — audit-seam redesign: is_operator() + trigger guard swap
--
-- The audit_daily_production_anon_edits trigger guard `auth.uid() IS NOT NULL`
-- encodes "non-null uid = dashboard user, skip audit". Once operators hold real
-- Supabase sessions (Tier 0 Step 4), that guard would silently stop auditing
-- every operator past-run correction AND destroy last_edit_reason unrecorded.
-- This migration replaces the seam with identity-table membership (Option A of
-- the Tier 0 Sub-phase A investigation): skip only authenticated users who are
-- NOT linked, active operators. With today's all-anon operator traffic and zero
-- linked operators (operators.auth_user_id all NULL), behaviour is
-- byte-identical to before — prod-safe by construction, deployable ahead of the
-- persistSession flip.
--
-- Hard requirements honoured (confirmed independently by both repo
-- investigations — see docs/tier0-dashboard-repo-checks.md §7.1):
--   * operator edits keep resolving to operator_id with user_id NULL — the
--     dashboard's actorLabel() and "Most Active User" KPI depend on it;
--   * the guard is operator-specific, NOT authenticated-specific — dashboard
--     staff edits to daily_production stay app-side-logged only (no
--     double-logging with lib/auditLog.ts).
--
-- The previous trigger function had no file in either repo (applied 2026-06-05
-- via MCP as audit_daily_production_anon_historical_edits_trigger). Its body is
-- captured verbatim below; it is also the ONE-STATEMENT ROLLBACK for this
-- migration (is_operator() may stay behind — harmless while unused):
--
--   CREATE OR REPLACE FUNCTION public.audit_daily_production_anon_edits()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_reason text := NULLIF(NEW.last_edit_reason, '');
--   BEGIN
--     NEW.last_edit_reason := NULL;
--     IF auth.uid() IS NOT NULL THEN RETURN NEW; END IF;
--     IF NEW.date >= CURRENT_DATE THEN RETURN NEW; END IF;
--
--     INSERT INTO public.audit_log
--       (user_id, operator_id, table_name, record_id, field_name, old_value, new_value, action, reason)
--     SELECT NULL, NEW.operator_id, 'daily_production', NEW.id, f.field, f.oldv, f.newv, 'update', v_reason
--     FROM (VALUES
--       ('feedstock_start_weight_t', OLD.feedstock_start_weight_t::text, NEW.feedstock_start_weight_t::text),
--       ('feedstock_end_weight_t',   OLD.feedstock_end_weight_t::text,   NEW.feedstock_end_weight_t::text),
--       ('feedstock_moisture_pct',   OLD.feedstock_moisture_pct::text,   NEW.feedstock_moisture_pct::text),
--       ('runtime_hours',            OLD.runtime_hours::text,            NEW.runtime_hours::text),
--       ('downtime_hours',           OLD.downtime_hours::text,           NEW.downtime_hours::text),
--       ('downtime_reason',          OLD.downtime_reason,                NEW.downtime_reason),
--       ('diesel_litres',            OLD.diesel_litres::text,            NEW.diesel_litres::text),
--       ('avg_pyrolysis_temp_c',     OLD.avg_pyrolysis_temp_c::text,     NEW.avg_pyrolysis_temp_c::text),
--       ('max_pyrolysis_temp_c',     OLD.max_pyrolysis_temp_c::text,     NEW.max_pyrolysis_temp_c::text),
--       ('avg_exhaust_temp_c',       OLD.avg_exhaust_temp_c::text,       NEW.avg_exhaust_temp_c::text),
--       ('thermal_output_kwh',       OLD.thermal_output_kwh::text,       NEW.thermal_output_kwh::text),
--       ('notes',                    OLD.notes,                          NEW.notes),
--       ('maintenance_notes',        OLD.maintenance_notes,              NEW.maintenance_notes)
--     ) AS f(field, oldv, newv)
--     WHERE f.oldv IS DISTINCT FROM f.newv;
--
--     RETURN NEW;
--   END $function$;

-- 1) Shared "is this session a linked, active operator?" membership test.
--    Same definition the Step 5 RLS policies will use, so the audit seam and
--    the policies share one source of truth for "operator".
--    SECURITY DEFINER (owner postgres) because anon/operator sessions have no
--    SELECT grant on operators; STABLE so RLS can cache it per statement;
--    search_path '' + schema-qualified refs per the is_admin/is_staff pattern.
create or replace function public.is_operator()
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.operators
    where auth_user_id = auth.uid()
      and is_active
  );
$$;

-- anon needs EXECUTE too: post-Step-5, anon sessions (stale clients) will
-- evaluate is_operator() inside policy quals — without the grant that is a
-- 42501 error on the whole query instead of a clean row-filter denial.
revoke all on function public.is_operator() from public;
grant execute on function public.is_operator() to anon, authenticated, service_role;

-- 2) Guard swap. Only the first IF changes; everything else is verbatim.
create or replace function public.audit_daily_production_anon_edits()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_reason text := NULLIF(NEW.last_edit_reason, '');
BEGIN
  NEW.last_edit_reason := NULL;
  -- THE SEAM (Tier 0 Step 1): skip only authenticated non-operators (dashboard
  -- staff — their edits are app-side logged by the dashboard). Anon (legacy /
  -- rollback path) AND linked-operator sessions are audited.
  IF auth.uid() IS NOT NULL AND NOT public.is_operator() THEN RETURN NEW; END IF;
  IF NEW.date >= CURRENT_DATE THEN RETURN NEW; END IF;

  INSERT INTO public.audit_log
    (user_id, operator_id, table_name, record_id, field_name, old_value, new_value, action, reason)
  SELECT NULL, NEW.operator_id, 'daily_production', NEW.id, f.field, f.oldv, f.newv, 'update', v_reason
  FROM (VALUES
    ('feedstock_start_weight_t', OLD.feedstock_start_weight_t::text, NEW.feedstock_start_weight_t::text),
    ('feedstock_end_weight_t',   OLD.feedstock_end_weight_t::text,   NEW.feedstock_end_weight_t::text),
    ('feedstock_moisture_pct',   OLD.feedstock_moisture_pct::text,   NEW.feedstock_moisture_pct::text),
    ('runtime_hours',            OLD.runtime_hours::text,            NEW.runtime_hours::text),
    ('downtime_hours',           OLD.downtime_hours::text,           NEW.downtime_hours::text),
    ('downtime_reason',          OLD.downtime_reason,                NEW.downtime_reason),
    ('diesel_litres',            OLD.diesel_litres::text,            NEW.diesel_litres::text),
    ('avg_pyrolysis_temp_c',     OLD.avg_pyrolysis_temp_c::text,     NEW.avg_pyrolysis_temp_c::text),
    ('max_pyrolysis_temp_c',     OLD.max_pyrolysis_temp_c::text,     NEW.max_pyrolysis_temp_c::text),
    ('avg_exhaust_temp_c',       OLD.avg_exhaust_temp_c::text,       NEW.avg_exhaust_temp_c::text),
    ('thermal_output_kwh',       OLD.thermal_output_kwh::text,       NEW.thermal_output_kwh::text),
    ('notes',                    OLD.notes,                          NEW.notes),
    ('maintenance_notes',        OLD.maintenance_notes,              NEW.maintenance_notes)
  ) AS f(field, oldv, newv)
  WHERE f.oldv IS DISTINCT FROM f.newv;

  RETURN NEW;
END $function$;
