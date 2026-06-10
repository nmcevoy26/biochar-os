// Tier 0 Step 2 — create + link Supabase auth users for the active operators.
//
// One-off provisioning script. Run server-side only with the SERVICE ROLE key:
//
//   SUPABASE_URL=https://<ref>.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=<service-role key, env only, never committed> \
//   node scripts/tier0-step2-create-operator-auth-users.mjs --ref <ref>
//
// --ref must match the project ref in SUPABASE_URL *and* in the key's JWT —
// a triple check so the wrong env/key combination aborts loudly.
//
// For each active operator (must be exactly Jess, Mick, Nick, Rachael):
//   1. auth.admin.createUser({ email: operator-<name>@timberloop.test,
//      email_confirm: true, app_metadata: { role: 'operator', operator_id } })
//      — no password: these users can never password-login; Step 4's pin-login
//      Edge Function mints their sessions server-side.
//   2. UPDATE operators SET auth_user_id = <new uid> WHERE id = <operator id>
//      AND auth_user_id IS NULL (refuses to overwrite an existing link).
//
// Operators get NO user_roles row — user_roles is staff-gating only.
// Rollback: UPDATE operators SET auth_user_id = NULL (the FK on auth.users is
// ON DELETE SET NULL, so deleting the auth users also auto-unlinks).

import { createClient } from '@supabase/supabase-js'

const EXPECTED_OPERATORS = ['Jess', 'Mick', 'Nick', 'Rachael']
const EMAIL_DOMAIN = 'timberloop.test'

function fail(msg) {
  console.error(`ABORT: ${msg}`)
  process.exit(1)
}

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment')

const refArg = process.argv.indexOf('--ref')
const expectedRef = refArg !== -1 ? process.argv[refArg + 1] : null
if (!expectedRef) fail('pass --ref <project-ref> to confirm the target environment')

const urlRef = new URL(url).hostname.split('.')[0]
if (urlRef !== expectedRef) fail(`--ref is ${expectedRef} but SUPABASE_URL points at ${urlRef}`)

let payload
try {
  payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
} catch {
  fail('SUPABASE_SERVICE_ROLE_KEY is not a decodable JWT — cannot verify its role/ref')
}
if (payload.role !== 'service_role') fail(`key role is '${payload.role}', expected 'service_role'`)
if (payload.ref !== expectedRef) fail(`key belongs to project ${payload.ref}, expected ${expectedRef}`)

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

console.log(`Target project: ${expectedRef}`)

// 1. Resolve operators by name (IDs differ between staging and prod).
const { data: operators, error: opErr } = await supabase
  .from('operators')
  .select('id, name, is_active, auth_user_id')
if (opErr) fail(`could not read operators: ${opErr.message}`)

const active = operators.filter((o) => o.is_active)
const activeNames = active.map((o) => o.name).sort()
if (JSON.stringify(activeNames) !== JSON.stringify([...EXPECTED_OPERATORS].sort())) {
  fail(`active operators are [${activeNames}], expected exactly [${EXPECTED_OPERATORS}]`)
}
const alreadyLinked = active.filter((o) => o.auth_user_id !== null)
if (alreadyLinked.length > 0) {
  fail(`already linked: ${alreadyLinked.map((o) => o.name).join(', ')} — refusing to proceed`)
}

// 2. Pre-check: none of the synthetic emails may already exist.
const plannedEmails = active.map((o) => `operator-${o.name.toLowerCase()}@${EMAIL_DOMAIN}`)
const existingEmails = []
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
  if (error) fail(`listUsers failed: ${error.message}`)
  existingEmails.push(...data.users.map((u) => u.email))
  if (data.users.length < 1000) break
}
const collisions = plannedEmails.filter((e) => existingEmails.includes(e))
if (collisions.length > 0) fail(`auth users already exist for: ${collisions.join(', ')}`)

// 3. Create + link, one operator at a time.
for (const op of [...active].sort((a, b) => a.name.localeCompare(b.name))) {
  const email = `operator-${op.name.toLowerCase()}@${EMAIL_DOMAIN}`
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { role: 'operator', operator_id: op.id },
  })
  if (error) fail(`createUser(${email}) failed: ${error.message}`)
  const uid = data.user.id

  const { data: updated, error: linkErr } = await supabase
    .from('operators')
    .update({ auth_user_id: uid })
    .eq('id', op.id)
    .is('auth_user_id', null)
    .select('id, name, auth_user_id')
  if (linkErr) fail(`linking ${op.name} failed: ${linkErr.message} (auth user ${uid} was created)`)
  if (!updated || updated.length !== 1) {
    fail(`linking ${op.name} updated ${updated?.length ?? 0} rows, expected 1 (auth user ${uid} was created)`)
  }
  console.log(`${op.name}: created ${email} (uid ${uid}) -> linked to operator ${op.id}`)
}

// 4. Read back and report.
const { data: final, error: finalErr } = await supabase
  .from('operators')
  .select('id, name, is_active, auth_user_id')
  .order('name')
if (finalErr) fail(`final read-back failed: ${finalErr.message}`)
console.log('\nFinal operators state:')
for (const o of final) {
  console.log(`  ${o.name} (active=${o.is_active}): auth_user_id=${o.auth_user_id}`)
}
