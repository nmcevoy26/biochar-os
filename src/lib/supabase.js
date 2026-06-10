import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env'
  )
}

// biochar-os authenticates operators via PIN (sessionStorage), never Supabase
// Auth — the client must stay pure-anon. persistSession / autoRefreshToken off
// stops supabase-js from loading or sending any stored session from localStorage
// (which can be shared with the dashboard under the same Supabase project ref).
// This keeps auth.uid() null on every request, which the audit trigger's
// anon-edit seam depends on — otherwise a stray dashboard session would make
// auth.uid() non-null and silently skip auditing an operator's historical edits.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
