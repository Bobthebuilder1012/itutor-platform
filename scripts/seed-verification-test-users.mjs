// LOCAL-ONLY seed for testing teacher verification end to end.
//
//   node scripts/seed-verification-test-users.mjs --confirm-ref <ref>
//
// It REFUSES to run unless the database in .env.local (NEXT_PUBLIC_SUPABASE_URL) is
//   - localhost / 127.0.0.1 (the Supabase CLI stack), or
//   - the project ref you name in SEED_ALLOWED_PROJECT_REF, and you repeat that
//     same ref on the command line with --confirm-ref.
// It also refuses a known production/staging ref, and any sk_live_ Stripe key.
// Nothing is printed except emails and the shared test password. No real emails
// are sent: accounts are created already confirmed.
//
// Creates (idempotent, safe to re-run):
//   admin, reviewer, student, parent, and tutors in EVERY verification state, with
//   sample one-to-one listings and classes so the badges show everywhere.
// Needs migrations 252-257 applied to that database first.

import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ---- load .env.local without printing it ----
const envPath = new URL('../.env.local', import.meta.url);
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KNOWN_REMOTE_REFS = ['nfkrfciozjxrodkusrhh', 'lhxlhzgisrauqipuxaxh', 'thjsdcbzlvjradczhgso']; // production and staging, from the repo docs
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const confirmRef = process.argv.includes('--confirm-ref') ? process.argv[process.argv.indexOf('--confirm-ref') + 1] : null;

function refuse(why) {
  console.error(`\nREFUSING TO SEED: ${why}\n`);
  process.exit(1);
}

if (!url || !serviceKey) refuse('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local.');
if (/^sk_live_/.test(env.STRIPE_SECRET_KEY ?? '')) refuse('STRIPE_SECRET_KEY is a LIVE key (sk_live_).');

const host = new URL(url).hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
const ref = host.endsWith('.supabase.co') ? host.split('.')[0] : null;

if (ref && KNOWN_REMOTE_REFS.includes(ref)) refuse(`${ref} is a known production or staging project.`);
if (!isLocal) {
  if (!ref) refuse(`${host} is not localhost and not a *.supabase.co project.`);
  if (!env.SEED_ALLOWED_PROJECT_REF) refuse('this is a remote project. Set SEED_ALLOWED_PROJECT_REF in .env.local to YOUR OWN empty project ref to allow it.');
  if (env.SEED_ALLOWED_PROJECT_REF !== ref) refuse(`SEED_ALLOWED_PROJECT_REF (${env.SEED_ALLOWED_PROJECT_REF}) does not match the database in use (${ref}).`);
  if (confirmRef !== ref) refuse(`repeat the ref on the command line: --confirm-ref ${ref}`);
}

const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const PASSWORD = 'Test-Passw0rd!';
const results = [];
const note = (ok, what, extra = '') => results.push(`${ok ? 'ok  ' : 'FAIL'} ${what}${extra ? `  (${extra})` : ''}`);

// ---------------------------------------------------------------
async function ensureUser(email, profile) {
  let id;
  const created = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: profile.full_name } });
  if (created.data?.user) id = created.data.user.id;
  else {
    // already exists: find it
    const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = list.data?.users?.find((u) => u.email === email)?.id;
    if (id) await db.auth.admin.updateUserById(id, { password: PASSWORD, email_confirm: true });
  }
  if (!id) throw new Error(`could not create or find ${email}: ${created.error?.message}`);

  const row = { id, email, terms_accepted: true, terms_accepted_at: new Date().toISOString(), ...profile };
  const { error } = await db.from('profiles').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`profile for ${email}: ${error.message}`);
  return id;
}

async function main() {
  const names = {
    admin: ['vtest.admin@example.test', { role: 'admin', full_name: 'Ada Admin', display_name: 'Ada Admin', username: 'vtest_admin' }],
    reviewer: ['vtest.reviewer@example.test', { role: 'student', is_reviewer: true, full_name: 'Rey Reviewer', display_name: 'Rey Reviewer', username: 'vtest_reviewer' }],
    student: ['vtest.student@example.test', { role: 'student', full_name: 'Sam Student', display_name: 'Sam Student', username: 'vtest_student' }],
    parent: ['vtest.parent@example.test', { role: 'parent', full_name: 'Pat Parent', display_name: 'Pat Parent', username: 'vtest_parent' }],
  };
  const tutors = {
    notstarted: ['Nora NotStarted', {}],
    inprogress: ['Ian InProgress', { v2: 'IN_PROGRESS' }],
    idfailed: ['Faye IdFailed', { v2: 'IN_PROGRESS', identity: { identity_status: 'retryable_failure', identity_error_code: 'document_expired', identity_attempts: 1, identity_provider: 'stripe' } }],
    idunsupported: ['Una Unsupported', { v2: 'IN_PROGRESS', identity: { identity_status: 'not_supported', identity_error_code: 'country', identity_attempts: 1, identity_provider: 'stripe', identity_country: 'GY' } }],
    inreview: ['Rita InReview', { v2: 'IN_REVIEW', profile: 'PENDING', identityOk: true, creds: true, extras: 2 }],
    verified: ['Vera Verified', { v2: 'VERIFIED', profile: 'VERIFIED', identityOk: true, creds: true, extras: 3, listings: true }],
    verified2: ['Victor Verified', { v2: 'VERIFIED', profile: 'VERIFIED', identityOk: true, creds: true, extras: 0, listings: true }],
    rejected: ['Rex Rejected', { v2: 'REJECTED', profile: 'REJECTED', identityOk: true, creds: true, reason: 'The results slip is cropped. Please upload the full page.' }],
    revoked: ['Remy Revoked', { v2: 'REVOKED', profile: 'REVOKED', identityOk: true, creds: true, reason: 'Misrepresented qualifications', listings: true }],
    reverify: ['Rae Reverify', { v2: 'REVERIFICATION_REQUIRED', profile: 'REVERIFICATION_REQUIRED', identityOk: true, creds: true }],
    oldverified: ['Olga OldVerified', { profile: 'VERIFIED', listings: true }],
  };

  const ids = {};
  for (const [key, [email, profile]] of Object.entries(names)) ids[key] = await ensureUser(email, profile);
  note(true, 'admin, reviewer, student and parent accounts');

  const sessionBase = `seed_${Date.now()}`;
  for (const [key, [fullName, spec]] of Object.entries(tutors)) {
    const email = `vtest.tutor.${key}@example.test`;
    const id = await ensureUser(email, {
      role: 'tutor', full_name: fullName, display_name: fullName, username: `vtest_tutor_${key}`,
      tutor_verification_status: spec.profile ?? 'UNVERIFIED',
      tutor_verified_at: spec.profile === 'VERIFIED' ? new Date().toISOString() : null,
    });
    ids[`tutor.${key}`] = id;
    if (!spec.v2) continue;

    const identity = spec.identityOk
      ? { identity_status: 'verified', identity_attempts: 1, identity_provider: 'stripe', identity_country: 'TT', identity_provider_session_ref: `${sessionBase}_${key}`, identity_providers_tried: ['stripe'], identity_verified_at: new Date().toISOString() }
      : { identity_provider_session_ref: `${sessionBase}_${key}`, identity_providers_tried: ['stripe'], ...(spec.identity ?? {}) };
    const decided = ['VERIFIED', 'REJECTED', 'REVOKED'].includes(spec.v2);
    const { error } = await db.from('tutor_verification_v2').upsert({
      tutor_id: id, status: spec.v2, consent_at: new Date().toISOString(), consent_version: '2026-10-v1',
      submitted_at: ['IN_REVIEW', 'VERIFIED', 'REJECTED', 'REVOKED', 'REVERIFICATION_REQUIRED'].includes(spec.v2) ? new Date().toISOString() : null,
      decision_reason: spec.reason ?? null, decided_at: decided ? new Date().toISOString() : null, ...identity,
    }, { onConflict: 'tutor_id' });
    note(!error, `v2 row for tutor.${key} (${spec.v2})`, error?.message);

    if (spec.creds) {
      await db.from('tutor_credentials_v2').delete().eq('tutor_id', id);
      const { error: ce } = await db.from('tutor_credentials_v2').insert([
        { tutor_id: id, kind: 'CSEC', subject: 'Mathematics', grade: 'I', exam_year: 2019, proof_url: 'https://example.com/proof' },
        { tutor_id: id, kind: 'CAPE', subject: 'Physics', grade: 'II', exam_year: 2021, proof_url: 'https://example.com/proof2' },
      ]);
      note(!ce, `credentials for tutor.${key}`, ce?.message);
    }
    if (spec.extras !== undefined) {
      await db.from('tutor_extras_v2').delete().eq('tutor_id', id);
      const rows = [
        { tutor_id: id, title: 'Robotics club mentor', description: 'Ran the school robotics club.', link_url: 'https://example.com/robotics' },
        { tutor_id: id, title: 'Maths Olympiad coach', description: 'Coached two regional finalists.' },
        { tutor_id: id, title: 'Published study guide', description: 'CSEC revision guide.', link_url: 'https://example.com/guide' },
      ].slice(0, spec.extras);
      if (rows.length) {
        const { error: ee } = await db.from('tutor_extras_v2').insert(rows);
        note(!ee, `extras for tutor.${key}`, ee?.message);
      }
    }
  }

  // ---- listings so badges show on one-to-one profiles and class cards ----
  let { data: subject } = await db.from('subjects').select('id').limit(1).maybeSingle();
  if (!subject) {
    const ins = await db.from('subjects').insert({ name: 'Mathematics', curriculum: 'CSEC', level: 'Form 4' }).select('id').single();
    subject = ins.data;
    note(!ins.error, 'created a sample subject', ins.error?.message);
  }
  for (const [key, [, spec]] of Object.entries(tutors)) {
    if (!spec.listings) continue;
    const id = ids[`tutor.${key}`];
    if (subject) {
      const { error } = await db.from('tutor_subjects').upsert({ tutor_id: id, subject_id: subject.id, price_per_hour_ttd: 150, mode: 'online' }, { onConflict: 'tutor_id,subject_id' });
      note(!error, `one-to-one listing for tutor.${key}`, error?.message);
    }
    const existing = await db.from('groups').select('id').eq('tutor_id', id).eq('name', `${key} Maths (sample class)`).maybeSingle();
    if (!existing.data) {
      const { error } = await db.from('groups').insert({
        name: `${key} Maths (sample class)`, description: 'Sample class for testing the verification badges.', tutor_id: id,
        subject: 'Mathematics', status: 'active', visibility: 'public', price_monthly: 200, price_per_session: 60,
        form_level: 'Form 4', max_students: 12, session_length_minutes: 60,
      });
      note(!error, `sample class for tutor.${key}`, error?.message);
    }
  }

  console.log('\n' + results.join('\n'));
  console.log('\n=== TEST LOGINS (all use the same password) ===');
  console.log(`password: ${PASSWORD}\n`);
  for (const [, [email]] of Object.entries(names)) console.log(email);
  for (const key of Object.keys(tutors)) console.log(`vtest.tutor.${key}@example.test`);
  console.log('\nTeacher states: notstarted, inprogress, idfailed, idunsupported, inreview, verified, verified2, rejected, revoked, reverify, oldverified');
  console.log(results.some((r) => r.startsWith('FAIL')) ? '\nSome rows FAILED (see above). Usually a migration is not applied or a column differs.' : '\nSeed complete.');
}

main().catch((e) => {
  console.error('\nSEED FAILED:', e.message);
  process.exit(1);
});
