-- Tier 0 Step 4b — pin-login attempt throttling
--
-- Backing table for the pin-login edge function's brute-force throttle:
-- 5 consecutive failures for an operator -> 15-minute lockout (HTTP 429).
-- Closes the <=10k-call PIN brute-force exposure flagged in the Sub-phase A
-- investigation (verify_operator_pin alone is anon-callable and unthrottled).
--
-- Service-role only: the edge function is the sole reader/writer. Explicit
-- REVOKEs because new tables inherit grants from upstream ALTER DEFAULT
-- PRIVILEGES rules (the user_preferences lesson, CLAUDE.md gotchas).
--
-- ROLLBACK: drop table if exists public.operator_login_attempts;

create table public.operator_login_attempts (
  operator_id uuid primary key references public.operators(id) on delete cascade,
  failed_count int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.operator_login_attempts enable row level security;
-- No policies on purpose: default-deny for every client role. The edge
-- function's service_role client bypasses RLS.

revoke all on table public.operator_login_attempts from anon, authenticated;
grant select, insert, update, delete on table public.operator_login_attempts to service_role;
