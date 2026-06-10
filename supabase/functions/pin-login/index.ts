import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// pin-login — exchange an operator's PIN for a real Supabase session
// (Tier 0 Step 4b). The PIN stays the only credential the operator ever sees.
//
// Flow: throttle check -> verify_operator_pin (bcrypt, is_active enforced
// in-function) -> require a provisioned floor login (operators.auth_user_id)
// -> admin.generateLink(magiclink) for the synthetic email -> return the
// hashed token. The client exchanges it via auth.verifyOtp({ token_hash,
// type: 'email' }) to obtain the session. generateLink never sends an email
// (and the .test addresses are undeliverable anyway).
//
// Throttle: 5 consecutive failures per operator -> 15-minute lockout (429
// with retry_after_seconds). Counter resets on success. Backing table
// operator_login_attempts is service-role-only.
//
// Responses are uniform for "wrong PIN" and "unknown/inactive operator"
// (both 401 invalid_pin) so the endpoint is not an operator oracle.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_FAILURES = 5
const LOCKOUT_MINUTES = 15

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const body = await req.json().catch(() => ({}))
  const { operator_id, pin } = body
  if (typeof operator_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(operator_id)) {
    return jsonResponse({ error: 'operator_id required' }, 400)
  }
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
    return jsonResponse({ error: 'invalid_pin' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceKey)

  // Throttle gate
  const { data: attempts } = await adminClient
    .from('operator_login_attempts')
    .select('failed_count, locked_until')
    .eq('operator_id', operator_id)
    .maybeSingle()
  if (attempts?.locked_until && new Date(attempts.locked_until) > new Date()) {
    const retryAfter = Math.ceil(
      (new Date(attempts.locked_until).getTime() - Date.now()) / 1000
    )
    return jsonResponse({ error: 'locked', retry_after_seconds: retryAfter }, 429)
  }

  // Verify PIN (bcrypt compare server-side; false for unknown or inactive
  // operators too — uniform failure).
  const { data: pinOk, error: verifyErr } = await adminClient.rpc('verify_operator_pin', {
    p_operator_id: operator_id,
    p_pin: pin,
  })
  if (verifyErr) {
    return jsonResponse({ error: 'Verification failed' }, 500)
  }
  if (pinOk !== true) {
    const failedCount = (attempts?.failed_count ?? 0) + 1
    const lockedUntil =
      failedCount >= MAX_FAILURES
        ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString()
        : null
    await adminClient.from('operator_login_attempts').upsert({
      operator_id,
      failed_count: failedCount,
      locked_until: lockedUntil,
      updated_at: new Date().toISOString(),
    })
    if (lockedUntil) {
      return jsonResponse(
        { error: 'locked', retry_after_seconds: LOCKOUT_MINUTES * 60 },
        429
      )
    }
    return jsonResponse({ error: 'invalid_pin' }, 401)
  }

  // Success: reset the throttle counter
  await adminClient.from('operator_login_attempts').delete().eq('operator_id', operator_id)

  const { data: op } = await adminClient
    .from('operators')
    .select('id, name, auth_user_id')
    .eq('id', operator_id)
    .single()
  if (!op?.auth_user_id) {
    return jsonResponse({ error: 'not_provisioned' }, 409)
  }

  const { data: authUser, error: userErr } = await adminClient.auth.admin.getUserById(
    op.auth_user_id
  )
  if (userErr || !authUser?.user?.email) {
    return jsonResponse({ error: 'Floor login user missing' }, 500)
  }

  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })
  if (linkErr || !linkData?.properties?.hashed_token) {
    return jsonResponse({ error: `Could not mint session: ${linkErr?.message ?? 'no token'}` }, 500)
  }

  return jsonResponse({
    success: true,
    token_hash: linkData.properties.hashed_token,
    operator: { id: op.id, name: op.name },
  })
})
