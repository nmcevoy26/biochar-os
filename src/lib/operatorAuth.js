import { supabase, supabaseUrl, supabaseAnonKey } from './supabase'

export const PIN_OK = 'ok'
export const PIN_INVALID = 'invalid'
export const PIN_LOCKED = 'locked'
export const PIN_NOT_PROVISIONED = 'not_provisioned'
export const PIN_ERROR = 'error'

// Exchange a PIN for a session via the pin-login edge function, then
// reconcile against any persisted session. The comparison is the entered
// PIN's operator_id vs the session's app_metadata.operator_id — identity
// always comes from the session, never from a swapped display name:
//   same operator  -> keep the existing session (the PIN was still verified
//                     server-side; no session-row churn)
//   different/none -> signOut the old session, mint fresh from token_hash
export async function pinLogin(operatorId, pin) {
  let res
  try {
    res = await fetch(`${supabaseUrl}/functions/v1/pin-login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({ operator_id: operatorId, pin }),
    })
  } catch {
    return { status: PIN_ERROR }
  }

  if (res.status === 429) {
    const body = await res.json().catch(() => ({}))
    return { status: PIN_LOCKED, retryAfterSeconds: body.retry_after_seconds ?? 900 }
  }
  if (res.status === 409) {
    return { status: PIN_NOT_PROVISIONED }
  }
  if (!res.ok) {
    return { status: PIN_INVALID }
  }

  let tokenHash
  try {
    const body = await res.json()
    tokenHash = body.token_hash
  } catch {
    return { status: PIN_ERROR }
  }

  const { data: { session } } = await supabase.auth.getSession()
  const sessionOperatorId = session?.user?.app_metadata?.operator_id ?? null
  if (sessionOperatorId !== operatorId) {
    if (session) {
      try {
        await supabase.auth.signOut()
      } catch {
        // Server-side revoke can fail offline; the local session is still
        // cleared and verifyOtp below replaces it.
      }
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (error) return { status: PIN_ERROR }
  }
  return { status: PIN_OK }
}

// Clears the operator's local identity AND revokes the Supabase session —
// the next operator must never ride the previous JWT.
export async function operatorSignOut() {
  sessionStorage.removeItem('grip_operator_id')
  sessionStorage.removeItem('grip_operator_name')
  try {
    await supabase.auth.signOut()
  } catch {
    // Offline: server revoke fails but the local session is removed, which is
    // what protects attribution on this device.
  }
}

// Launch-time check: does the persisted session belong to this operator?
// Used by App to drop back to the PIN screen when the sessionStorage identity
// and the session disagree (or the session is gone).
export async function sessionMatchesOperator(operatorId) {
  const { data: { session } } = await supabase.auth.getSession()
  return (session?.user?.app_metadata?.operator_id ?? null) === operatorId
}
