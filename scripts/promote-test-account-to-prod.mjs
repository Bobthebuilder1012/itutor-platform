// =====================================================================
// promote-test-account-to-prod.mjs — put ONE test login on production
// =====================================================================
// The sibling of create-test-accounts.mjs, pointed at production and
// deliberately narrowed to a single account. Prod credentials are never
// read from .env.local (that file is staging); pass them explicitly:
//
//   PROD_SUPABASE_URL=https://nfkrfciozjxrodkusrhh.supabase.co \
//   PROD_SERVICE_ROLE_KEY=sb_secret_... \
//   node scripts/promote-test-account-to-prod.mjs           # show the plan
//   …same env… node scripts/promote-test-account-to-prod.mjs --apply
//
// Both values are in Vercel: `vercel env pull --environment=production
// .env.prod.tmp --scope liam-rampersads-projects`, read them out, then
// DELETE that file — it contains every production secret.
//
// Safety rails:
//   * Refuses unless the URL is the production ref.
//   * Touches exactly the one email in ACCOUNT below.
//   * Idempotent: an existing account has its password reset and its
//     profile re-stamped rather than being duplicated.
//   * marketing_consent=false and is_test_data=true, so the account can
//     never be swept into a real campaign.
// =====================================================================

import { createClient } from '@supabase/supabase-js';

const PROD_REF = 'nfkrfciozjxrodkusrhh';
const APPLY = process.argv.includes('--apply');

const url = process.env.PROD_SUPABASE_URL;
const serviceKey = process.env.PROD_SERVICE_ROLE_KEY;

// Same credentials as the staging twin, so one password works on both.
const ACCOUNT = {
  email: 'jovangoodluck+teststudent2@myitutor.com',
  password: 'StagingTest!Student2-26',
  username: 'teststudent26b',
  full_name: 'Test Student Two',
  role: 'student',
  extra: { billing_mode: 'self_allowed' },
};

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

async function findUserByEmail(supabase, targetEmail) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (match) return match;
    if (data.users.length < perPage) return null;
  }
}

async function main() {
  if (!url || !serviceKey) {
    return fail('Set PROD_SUPABASE_URL and PROD_SERVICE_ROLE_KEY (see the header of this file).');
  }
  if (!url.includes(PROD_REF)) {
    return fail(`Refusing: ${url} is not the production project (${PROD_REF}).`);
  }
  console.log('Project:', url, APPLY ? '(APPLY — writing to PRODUCTION)' : '(dry run)');

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const email = ACCOUNT.email.toLowerCase();
  const existing = await findUserByEmail(supabase, email);

  // A username collision would fail the profile upsert on the unique index.
  const { data: nameTaken } = await supabase
    .from('profiles')
    .select('id, email')
    .ilike('username', ACCOUNT.username)
    .limit(1)
    .maybeSingle();
  if (nameTaken && nameTaken.id !== existing?.id) {
    return fail(`Username "${ACCOUNT.username}" already belongs to ${nameTaken.email}. Aborted.`);
  }

  if (!APPLY) {
    console.log(`  ${email}  role=${ACCOUNT.role}  ${existing ? '→ would reset password' : '→ would create'}`);
    console.log('\nDry run — nothing changed. Re-run with --apply.');
    return;
  }

  let userId = existing?.id;
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ACCOUNT.password,
      email_confirm: true,
    });
    if (error) return fail(`Password reset failed — ${error.message}`);
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: ACCOUNT.password,
      email_confirm: true,
      user_metadata: {
        full_name: ACCOUNT.full_name,
        username: ACCOUNT.username,
        role: ACCOUNT.role,
        country: 'Trinidad and Tobago',
        terms_accepted: true,
      },
    });
    if (error || !data.user) return fail(`Create failed — ${error?.message}`);
    userId = data.user.id;
  }

  const { error: profileErr } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: ACCOUNT.full_name,
      display_name: ACCOUNT.full_name.split(' ')[0],
      username: ACCOUNT.username,
      role: ACCOUNT.role,
      country: 'Trinidad and Tobago',
      terms_accepted: true,
      terms_accepted_at: new Date().toISOString(),
      is_test_data: true,
      is_suspended: false,
      marketing_consent: false,
      marketing_consent_at: new Date().toISOString(),
      marketing_consent_source: 'test_account_script',
      ...ACCOUNT.extra,
    },
    { onConflict: 'id' },
  );
  if (profileErr) return fail(`Profile upsert failed — ${profileErr.message}`);

  console.log(`  ✅ ${email}  role=${ACCOUNT.role}  id=${userId}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exitCode = 1;
});
