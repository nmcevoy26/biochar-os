import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

// Operators hold real Supabase sessions (Tier 0 Step 4): PIN login exchanges
// the PIN for a session via the pin-login edge function, so auth.uid() is the
// operator's floor identity on every request — the audit trigger's
// is_operator() seam (and, from Step 5, RLS policies) key on it. The persisted
// session provides in-shift continuity and offline-queue drains; the app still
// requires a PIN at every launch, and PinLogin/App reconcile the entered
// operator against the session's app_metadata.operator_id (mismatch = signOut
// + fresh mint — another operator's session is never reused). The explicit
// storageKey keeps this session out of the default sb-<ref>-auth-token slot so
// it can never collide with the dashboard's when both apps share an origin
// (localhost dev).
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'grip-auth-token',
    detectSessionInUrl: false,
  },
})

export { supabaseUrl, supabaseAnonKey }

export const MACHINES = {
  CP500: 'c79db7c9-bc54-43a9-993b-41b9121bbd68',
  CP1000: 'd804052e-e7d7-484a-8a4c-4f1da6048fdd',
}

export const MACHINE_NAMES = Object.fromEntries(
  Object.entries(MACHINES).map(([name, id]) => [id, name])
)

export function detectShift() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 13) return 'Morning'
  if (hour >= 13 && hour < 21) return 'Evening'
  return 'Night'
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
