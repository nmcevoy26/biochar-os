import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

// operator-admin — floor-identity lifecycle for operators (Tier 0 Step 4a).
//
// Actions:
//   provision — create the synthetic floor auth user for an operator
//     (operator-<slug>@timberloop.test, app_metadata { role: 'operator',
//     operator_id }) and link operators.auth_user_id to it. Idempotent: an
//     already-provisioned operator returns 200 with already_provisioned=true.
//     This is Tier 0 Step 2's linking as a repeatable path — without it, an
//     operator created after the persistSession flip could never PIN-login
//     (pin-login mints sessions from auth_user_id).
//
// The service-role UPDATE deliberately passes the guard_operator_floor_identity
// trigger, which blocks the same column change from dashboard sessions.
//
// Caller gate mirrors the create_operator RPC: admin OR can_manage_users.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMAIL_DOMAIN = 'timberloop.test'

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '')
  return slug.length > 0 ? slug : 'operator'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing auth' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(supabaseUrl, serviceKey)
  const { data: roleData } = await adminClient
    .from('user_roles')
    .select('role, can_manage_users')
    .eq('id', user.id)
    .single()
  if (roleData?.role !== 'admin' && roleData?.can_manage_users !== true) {
    return jsonResponse({ error: 'Not authorized' }, 403)
  }

  const body = await req.json().catch(() => ({}))
  const { action, operator_id } = body
  if (action !== 'provision') {
    return jsonResponse({ error: `Unknown action: ${action}` }, 400)
  }
  if (typeof operator_id !== 'string' || operator_id.length === 0) {
    return jsonResponse({ error: 'operator_id required' }, 400)
  }

  const { data: op, error: opErr } = await adminClient
    .from('operators')
    .select('id, name, is_active, auth_user_id')
    .eq('id', operator_id)
    .single()
  if (opErr || !op) {
    return jsonResponse({ error: 'Operator not found' }, 404)
  }
  if (op.auth_user_id) {
    return jsonResponse({ success: true, already_provisioned: true, auth_user_id: op.auth_user_id })
  }

  // Synthetic, never-emailed address. Suffix on collision (two operators with
  // the same first name).
  const base = `operator-${slugify(op.name)}`
  let createdId: string | null = null
  let email = ''
  for (const suffix of ['', '-2', '-3', '-4', '-5']) {
    email = `${base}${suffix}@${EMAIL_DOMAIN}`
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { role: 'operator', operator_id: op.id },
    })
    if (!createErr && created?.user) {
      createdId = created.user.id
      break
    }
    const msg = createErr?.message?.toLowerCase() ?? ''
    if (!(msg.includes('already') && msg.includes('regist')) && createErr?.code !== 'email_exists') {
      return jsonResponse({ error: `Failed to create floor auth user: ${createErr?.message}` }, 500)
    }
    // email taken — try the next suffix
  }
  if (!createdId) {
    return jsonResponse({ error: 'Could not allocate a unique floor login email' }, 500)
  }

  const { error: linkErr } = await adminClient
    .from('operators')
    .update({ auth_user_id: createdId })
    .eq('id', op.id)
  if (linkErr) {
    // Rollback the orphaned auth user before bailing
    await adminClient.auth.admin.deleteUser(createdId)
    return jsonResponse({ error: `Failed to link operator: ${linkErr.message}` }, 500)
  }

  // Attribute the provisioning to the calling staff user in the audit log
  // (matches the app-side logEdit('operators', …, 'auth_user_id', …) the
  // retired link UI used to write).
  await adminClient.from('audit_log').insert({
    user_id: user.id,
    table_name: 'operators',
    record_id: op.id,
    field_name: 'auth_user_id',
    old_value: null,
    new_value: createdId,
    action: 'update',
    reason: 'floor login provisioned',
  })

  return jsonResponse({ success: true, auth_user_id: createdId, email })
})
