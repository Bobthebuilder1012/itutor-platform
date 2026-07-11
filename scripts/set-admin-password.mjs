// =====================================================================
// set-admin-password.mjs  —  rotate a Supabase admin account's password
// =====================================================================
// Run from the project root. Reads NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY from .env.local (never printed). The target
// email and new password are taken from env vars YOU set at run time, so
// no secret is ever hardcoded, committed, or echoed.
//
// Safety rails:
//   * Dry-run by default — prints who would be affected, changes nothing.
//   * Refuses unless the target profile is role='admin' OR is_reviewer.
//   * Requires --apply AND NEW_ADMIN_PASSWORD (>= 12 chars) to write.
//   * Never logs the password or the service-role key.
//
// Usage (PowerShell):
//   # List admin/reviewer accounts (read-only) — to find the right email:
//   node scripts/set-admin-password.mjs --list
//
//   # Dry run — confirm the right account:
//   $env:ADMIN_EMAIL="admin@example.com"; node scripts/set-admin-password.mjs
//
//   # Apply — set a new password (you choose it; it stays in your shell):
//   $env:ADMIN_EMAIL="admin@example.com"; `
//   $env:NEW_ADMIN_PASSWORD="<your-strong-password>"; `
//   node scripts/set-admin-password.mjs --apply
//
//   # then clear it from your session:  Remove-Item Env:NEW_ADMIN_PASSWORD
// =====================================================================

import nextEnv from '@next/env'; // CommonJS module — default import, then destructure
const { loadEnvConfig } = nextEnv;
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd(), true); // loads .env.local like Next does

// Explicit TARGET_* overrides take precedence over .env.local, so you can
// point at a specific project (e.g. prod) WITHOUT editing .env.local.
const url = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.TARGET_SECRET_KEY ||        // new sb_secret_... key (replaces service_role)
  process.env.TARGET_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
// Optional safety: refuse to run unless the project URL contains this ref.
const expectRef = (process.env.EXPECT_PROJECT_REF || '').trim();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const newPassword = process.env.NEW_ADMIN_PASSWORD || '';
const APPLY = process.argv.includes('--apply');
const LIST = process.argv.includes('--list');

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
  return 1;
}

async function findUserByEmail(supabase, targetEmail) {
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const match = data.users.find((u) => (u.email || '').toLowerCase() === targetEmail);
    if (match) return match;
    if (data.users.length < perPage) return null; // reached last page
  }
}

async function main() {
  if (!url) return fail('Missing project URL (set TARGET_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL). Aborting.');
  if (!serviceKey) return fail('Missing service-role key (set TARGET_SERVICE_ROLE_KEY or SUPABASE_SERVICE_ROLE_KEY). Aborting.');

  console.log('Using project URL:', url);
  if (expectRef && !url.includes(expectRef)) {
    return fail(`Refusing: project URL does not contain expected ref "${expectRef}". Aborting.`);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // --- LIST mode: show admin/reviewer accounts, change nothing -------
  if (LIST) {
    const { data: admins, error } = await supabase
      .from('profiles')
      .select('id, email, role, is_reviewer, full_name')
      .or('role.eq.admin,is_reviewer.eq.true')
      .order('email');
    if (error) return fail(`Profile query failed: ${error.message}`);
    console.log(`Admin / reviewer accounts (${admins.length}):`);
    for (const a of admins) {
      console.log(`  ${a.email}  | role=${a.role ?? '-'} is_reviewer=${a.is_reviewer ?? false} | ${a.full_name ?? ''}`);
    }
    return 0;
  }

  if (!email) return fail('Missing ADMIN_EMAIL env var. Aborting.');

  const user = await findUserByEmail(supabase, email);
  if (!user) return fail(`No auth user found with email ${email}. Aborting.`);

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, role, is_reviewer, full_name')
    .eq('id', user.id)
    .single();
  if (profileErr) return fail(`Profile lookup failed: ${profileErr.message}`);

  const qualifiesAsAdmin = profile && (profile.role === 'admin' || profile.is_reviewer === true);

  console.log('Target account:');
  console.log('  id:            ', user.id);
  console.log('  email:         ', user.email);
  console.log('  full_name:     ', profile?.full_name ?? '(none)');
  console.log('  role:          ', profile?.role ?? '(none)');
  console.log('  is_reviewer:   ', profile?.is_reviewer ?? false);
  console.log('  qualifies admin:', qualifiesAsAdmin);

  if (!qualifiesAsAdmin) {
    return fail('\nRefusing: target is not role=admin and not is_reviewer.');
  }

  if (!APPLY) {
    console.log('\nDRY RUN — no change made.');
    console.log('Re-run with --apply and NEW_ADMIN_PASSWORD set to update the password.');
    return 0;
  }

  if (!newPassword) return fail('Missing NEW_ADMIN_PASSWORD env var. Aborting.');
  if (newPassword.length < 12) {
    return fail('Refusing: NEW_ADMIN_PASSWORD must be at least 12 characters.');
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  });
  if (updateErr) return fail(`Update failed: ${updateErr.message}`);

  console.log(`\n✅ Password updated for ${user.email} (${user.id}).`);
  console.log('Reminder: clear NEW_ADMIN_PASSWORD from your shell session.');
  return 0;
}

// Set exitCode and let the event loop drain naturally — avoids the
// libuv "UV_HANDLE_CLOSING" assertion that process.exit() triggers on
// Windows when the HTTP client still has sockets closing.
main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exitCode = 1;
});
