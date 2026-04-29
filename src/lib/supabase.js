import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://enkhbhllkvvuykantdgv.supabase.co'
const supabaseAnonKey =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVua2hiaGxsa3Z2dXlrYW50ZGd2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNzQ2MjYsImV4cCI6MjA5Mjk1MDYyNn0.HSr6f3x0kXAL4izHGn6LKV1mNoD0HbHKs3gHoZOPXeY'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const MACHINES = {
  CP500: 'c79db7c9-bc54-43a9-993b-41b9121bbd68',
  CP1000: 'd804052e-e7d7-484a-8a4c-4f1da6048fdd',
}

export function detectShift() {
  const hour = new Date().getHours()
  if (hour >= 5 && hour < 13) return 'Morning'
  if (hour >= 13 && hour < 21) return 'Evening'
  return 'Night'
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
