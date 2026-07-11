// =====================================================================
// send-password-reset.mjs  —  send a Supabase password-recovery email
// =====================================================================
// Triggers the same flow as the app's /forgot-password page: Supabase
// emails the user a recovery link that lands on <origin>/reset-password,
// where they set a new password themselves. No password is handled here.
//
// Reads project URL + key from TARGET_* (preferred) or .env.local. The key
// can be the anon key OR the service-role key; it is never printed.
//
// Usage (PowerShell) — target PROD explicitly:
//   $env:TARGET_SUPABASE_URL="https://nfkrfciozjxrodkusrhh.supabase.co"
//   $env:TARGET_SERVICE_ROLE_KEY="<prod service_role OR anon key>"
//   $env:EXPECT_PROJECT_REF="nfkrfciozjxrodkusrhh"
//   $env:ADMIN_EMAIL="admin@myitutor.com"
//   $env:RESET_REDIRECT_TO="https://<your-prod-site>/reset-password"
//   node scripts/send-password-reset.mjs
//   # then: Remove-Item Env:TARGET_SERVICE_ROLE_KEY,Env:TARGET_SUPABASE_URL,Env:EXPECT_PROJECT_REF,Env:ADMIN_EMAIL,Env:RESET_REDIRECT_TO
// =====================================================================

import nextEnv from '@next/env';
const { loadEnvConfig } = nextEnv;
import { createClient } from '@supabase/supabase-js';

loadEnvConfig(process.cwd(), true);

const url = process.env.TARGET_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key =
  process.env.TARGET_SERVICE_ROLE_KEY ||
  process.env.TARGET_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const expectRef = (process.env.EXPECT_PROJECT_REF || '').trim();
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const redirectTo =
  process.env.RESET_REDIRECT_TO ||
  (process.env.NEXT_PUBLIC_APP_URL ? `${process.env.NEXT_PUBLIC_APP_URL}/reset-password` : '');

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
  return 1;
}

async function main() {
  if (!url) return fail('Missing project URL (TARGET_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).');
  if (!key) return fail('Missing key (TARGET_SERVICE_ROLE_KEY / anon key).');
  if (!email) return fail('Missing ADMIN_EMAIL env var.');
  if (!redirectTo) return fail('Missing RESET_REDIRECT_TO (or NEXT_PUBLIC_APP_URL) for the email link.');

  console.log('Project URL:  ', url);
  console.log('Recovery email to:', email);
  console.log('redirectTo:   ', redirectTo);

  if (expectRef && !url.includes(expectRef)) {
    return fail(`Refusing: project URL does not contain expected ref "${expectRef}".`);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return fail(`Failed to send recovery email: ${error.message}`);

  console.log(`\n✅ Recovery email requested for ${email}.`);
  console.log('Note: Supabase returns success even if the address has no account');
  console.log('(anti-enumeration). Confirm via the inbox and the project’s Auth logs.');
  console.log('Ensure redirectTo is in the project’s allowed Redirect URLs, or it falls back to Site URL.');
  return 0;
}

main().catch((err) => {
  console.error('Unexpected error:', err?.message ?? err);
  process.exitCode = 1;
});
