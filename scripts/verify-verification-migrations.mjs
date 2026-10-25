// Applies the verification migrations (270-275) to an EMBEDDED Postgres (PGlite) with
// stubs of the Supabase pieces they lean on, then asserts the behaviour they promise:
// RLS as teacher / student / admin / service role, the guard triggers, the 3-extras
// limit, the append-only audit, the legacy-status mapping, and that every rollback
// runs and every migration re-applies. No real database, Docker or network.
//
// Run from the repo root:
//   npm install --no-save @electric-sql/pglite
//   node scripts/verify-verification-migrations.mjs
//
// It does NOT replay the other 240+ migrations (many need Supabase-only extensions);
// it applies only the real prerequisites it lists below.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, existsSync } from 'fs';

const REPO = process.cwd();
const read = (p) => readFileSync(`${REPO}/${p}`, 'utf8');
const db = new PGlite();

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, extra = '') {
  (cond ? pass++ : fail++);
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`);
}
async function run(sql, label) {
  try { await db.exec(sql); return null; } catch (e) { return `${label ?? ''} ${e.message}`; }
}
async function q(sql, params) { return (await db.query(sql, params)).rows; }
async function expectError(sql, re, name, params) {
  try { await db.query(sql, params); ok(name, false, 'expected an error, got none'); }
  catch (e) { ok(name, re.test(e.message), `got: ${e.message}`); }
}
const asRole = async (role, sub, fn) => {
  await db.exec(`SET ROLE ${role}; SELECT set_config('request.jwt.claim.role','${role}',false), set_config('request.jwt.claim.sub','${sub ?? ''}',false);`);
  try { return await fn(); } finally { await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.role','',false), set_config('request.jwt.claim.sub','',false);`); }
};

// ---------- bootstrap: the Supabase pieces the migrations lean on ----------
const bootstrap = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true), '') $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
CREATE FUNCTION public.update_updated_at_column() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'student', email text, full_name text, display_name text,
  is_suspended boolean DEFAULT false
);
CREATE TABLE public.subjects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, type text, message text, data jsonb, created_at timestamptz DEFAULT now()
);
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['booking_request'::text, 'new_message'::text, 'child_joined_class'::text])) NOT VALID;
`;
let err = await run(bootstrap, 'bootstrap'); if (err) { console.log('BOOTSTRAP FAILED', err); process.exit(1); }

// ---------- prerequisites: the real earlier migrations ----------
const prereq = [
  'supabase/migrations/024_tutor_verification_schema.sql',
  'supabase/migrations/025_verification_rls.sql',
  'supabase/migrations/032_add_verified_subjects_table.sql',
  'supabase/migrations/034_allow_admin_update_verification_status.sql',
  'supabase/migrations/035_fix_verification_rls_for_admins.sql',
  'supabase/migrations/037_allow_tutor_update_file_path.sql',
  'supabase/migrations/217_profiles_privileged_column_guard.sql',
];
for (const f of prereq) {
  const e = await run(read(f), f);
  ok(`prerequisite applies: ${f.split('/').pop()}`, !e, e ?? '');
}
await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated, service_role;`);

// ---------- my migrations ----------
const T = '11111111-1111-1111-1111-111111111111'; // tutor
const T2 = '22222222-2222-2222-2222-222222222222'; // another tutor
const ADM = '33333333-3333-3333-3333-333333333333'; // admin
const STU = '44444444-4444-4444-4444-444444444444'; // student
await db.exec(`
  INSERT INTO auth.users (id, email) VALUES ('${T}','t@x'),('${T2}','t2@x'),('${ADM}','a@x'),('${STU}','s@x');
  INSERT INTO public.profiles (id, role, email) VALUES ('${T}','tutor','t@x'),('${T2}','tutor','t2@x'),('${ADM}','admin','a@x'),('${STU}','student','s@x');
`);

const mig = (n) => `supabase/migrations/${n}`;
const rb = (n) => `supabase/rollbacks/${n}`;
const files = [
  '270_teacher_verification_v2.sql',
  '271_verification_security_hardening.sql',
  '272_verification_v2_review.sql',
  '273_verification_v2_redaction_deletion.sql',
];
for (const f of files) {
  if (f.startsWith("271")) await db.exec(`ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check; ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY['booking_request'::text, 'new_message'::text, 'child_joined_class'::text])) NOT VALID;`);
  const e = await run(read(mig(f)), f);
  ok(`applies on a clean database: ${f}`, !e, e ?? '');
}

// legacy rows BEFORE 274, to prove the mapping
await db.exec(`
  SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',false);
  INSERT INTO public.tutor_verification_v2 (tutor_id, consent_at, stripe_identity_session_id, identity_status, identity_error_code, identity_attempts)
    VALUES ('${T}', now(), 'vs_a', 'requires_input', 'document_expired', 1),
           ('${T2}', now(), 'vs_b', 'under_supported_age', 'under_supported_age', 1);
  RESET ROLE;
`);
for (const f of ['274_identity_providers.sql', '275_identity_outcomes.sql']) {
  const e = await run(read(mig(f)), f);
  ok(`applies on a clean database: ${f}`, !e, e ?? '');
}

// ---------- 274: mapping and backfill ----------
let rows = await q(`SELECT tutor_id, identity_status, identity_error_code, identity_provider, identity_provider_session_ref, identity_providers_tried, identity_provider_code FROM public.tutor_verification_v2 ORDER BY stripe_identity_session_id`);
ok('274 maps requires_input -> retryable_failure with a neutral reason', rows[0].identity_status === 'retryable_failure' && rows[0].identity_error_code === 'document_expired' && rows[0].identity_provider_code === 'document_expired', JSON.stringify(rows[0]));
ok('274 maps under_supported_age -> not_supported / minor', rows[1].identity_status === 'not_supported' && rows[1].identity_error_code === 'minor', JSON.stringify(rows[1]));
ok('274 backfills provider = stripe and the session ref', rows[0].identity_provider === 'stripe' && rows[0].identity_provider_session_ref === 'vs_a' && rows[0].identity_providers_tried[0] === 'stripe', JSON.stringify(rows[0]));
const refs = await q(`SELECT identity_session_refs FROM public.tutor_verification_v2 WHERE tutor_id='${T}'`);
ok('274 backfills the session reference list', JSON.stringify(refs[0].identity_session_refs) === '[{"ref": "vs_a", "provider": "stripe"}]' || refs[0].identity_session_refs?.[0]?.ref === 'vs_a', JSON.stringify(refs[0]));
await expectError(`UPDATE public.tutor_verification_v2 SET identity_status='bogus' WHERE tutor_id='${T}'`, /check/i, '274 rejects an unknown identity status');
await expectError(`UPDATE public.tutor_verification_v2 SET identity_provider='manual' WHERE tutor_id='${T}'`, /check/i, '274 has no manual provider');
await db.exec(`UPDATE public.tutor_verification_v2 SET identity_status='old_name' WHERE false`);

// ---------- 270: RLS and limits ----------
await expectError(
  `INSERT INTO public.tutor_extras_v2 (tutor_id,title,description) VALUES ('${T}','a','a'),('${T}','b','b'),('${T}','c','c'),('${T}','d','d')`,
  /extras_limit_reached/, '270 the 4th extra is rejected by the database');
const e3 = await q(`SELECT count(*)::int AS n FROM public.tutor_extras_v2 WHERE tutor_id='${T}'`);
ok('270 the failed 4-row insert left no partial rows', e3[0].n === 0, JSON.stringify(e3));
await db.exec(`INSERT INTO public.tutor_extras_v2 (tutor_id,title,description) VALUES ('${T}','a','a'),('${T}','b','b'),('${T}','c','c')`);
await expectError(`INSERT INTO public.tutor_extras_v2 (tutor_id,title,description) VALUES ('${T}','d','d')`, /extras_limit_reached/, '270 a 4th extra after 3 exist is rejected');
await db.exec(`INSERT INTO public.tutor_extras_v2 (tutor_id,title,description) VALUES ('${T2}','a','a')`);
ok('270 the limit is per teacher', true);

await expectError(`INSERT INTO public.tutor_credentials_v2 (tutor_id,kind,subject,grade,exam_year) VALUES ('${T}','CSEC','Maths','I',2020)`, /check|violates/i, '270 a CSEC credential without proof is rejected');
await expectError(`INSERT INTO public.tutor_credentials_v2 (tutor_id,kind,school,degree,graduation_year,proof_path) VALUES ('${T}','DEGREE','U','BSc',2020,'${T2}/x.pdf')`, /check|violates/i, '270 a proof path in someone else\'s folder is rejected');
await db.exec(`INSERT INTO public.tutor_credentials_v2 (tutor_id,kind,subject,grade,exam_year,proof_url) VALUES ('${T}','CSEC','Maths','I',2020,'https://example.com/p')`);
await expectError(`INSERT INTO public.tutor_credentials_v2 (tutor_id,kind,subject,grade,exam_year,proof_url) VALUES ('${T}','CSEC','Maths','I',2020,'javascript:alert(1)')`, /check|violates/i, '270 a javascript: proof link is rejected');

// ---------- RLS as a TEACHER (authenticated) ----------
await asRole('authenticated', T, async () => {
  const own = await q(`SELECT tutor_id FROM public.tutor_verification_v2`);
  ok('270 a teacher reads only their own verification row', own.length === 1 && own[0].tutor_id === T, JSON.stringify(own));
  const upd = await q(`UPDATE public.tutor_verification_v2 SET status='VERIFIED' WHERE tutor_id='${T}' RETURNING tutor_id`);
  ok('270/271 a teacher cannot update their own status (no policy)', upd.length === 0, JSON.stringify(upd));
  const ins = await db.query(`INSERT INTO public.tutor_verification_v2 (tutor_id) VALUES ('${STU}')`).then(() => 'inserted', (e) => e.message);
  ok('270/271 a teacher cannot insert a verification row', ins !== 'inserted', ins);
  const decided = await q(`UPDATE public.tutor_verification_v2 SET decision_reason='x', decided_at=now() WHERE tutor_id='${T}' RETURNING tutor_id`);
  ok('270/271 a teacher cannot write decision fields', decided.length === 0);
});
await asRole('service_role', null, async () => {
  const upd = await q(`UPDATE public.tutor_verification_v2 SET status='IN_REVIEW' WHERE tutor_id='${T}' RETURNING status`);
  ok('271 the service role CAN write the status', upd.length === 1 && upd[0].status === 'IN_REVIEW', JSON.stringify(upd));
});

// teacher edits while editable / locked
await asRole('authenticated', T, async () => {
  const del = await q(`DELETE FROM public.tutor_extras_v2 WHERE tutor_id='${T}' RETURNING id`);
  ok('270 a teacher cannot delete extras once IN_REVIEW', del.length === 0, JSON.stringify(del));
});
await db.exec(`UPDATE public.tutor_verification_v2 SET status='IN_PROGRESS' WHERE tutor_id='${T}'`);
await asRole('authenticated', T, async () => {
  const del = await q(`DELETE FROM public.tutor_extras_v2 WHERE tutor_id='${T}' AND title='c' RETURNING id`);
  ok('270 a teacher can delete extras while IN_PROGRESS', del.length === 1);
});

// students / parents see credentials only of VERIFIED teachers
await asRole('authenticated', STU, async () => {
  const before = await q(`SELECT id FROM public.tutor_credentials_v2`);
  ok('270 a student sees no credentials of an unverified teacher', before.length === 0, JSON.stringify(before));
});
await db.exec(`UPDATE public.tutor_verification_v2 SET status='VERIFIED' WHERE tutor_id='${T}'`);
await asRole('authenticated', STU, async () => {
  const after = await q(`SELECT id FROM public.tutor_credentials_v2`);
  const ext = await q(`SELECT id FROM public.tutor_extras_v2`);
  ok('270 a student sees the credentials of a VERIFIED teacher', after.length === 1, JSON.stringify(after));
  ok('270 a student sees the extras of a VERIFIED teacher', ext.length === 2, JSON.stringify(ext));
});
await asRole('authenticated', T2, async () => {
  const other = await q(`SELECT id FROM public.tutor_credentials_v2 WHERE tutor_id='${T}'`);
  ok('270 another TEACHER cannot read a teacher\'s credentials', other.length === 0, JSON.stringify(other));
});
await asRole('authenticated', ADM, async () => {
  await db.exec(`SET LOCAL x.y = 1`).catch(() => {});
});

// ---------- 271: guards ----------
await asRole('authenticated', T, async () => {
  await expectError(`UPDATE public.profiles SET is_reviewer = true WHERE id='${T}'`, /not user-writable/, '271 a user cannot make themselves a reviewer');
  await expectError(`UPDATE public.profiles SET tutor_verified_at = now() WHERE id='${T}'`, /not user-writable/, '271 a user cannot set tutor_verified_at');
  await expectError(`UPDATE public.profiles SET tutor_verification_status = 'VERIFIED' WHERE id='${T}'`, /not user-writable/, '217 a user cannot set their verification status');
});
await asRole('service_role', null, async () => {
  const r = await q(`UPDATE public.profiles SET is_reviewer = true, tutor_verified_at = now() WHERE id='${ADM}' RETURNING is_reviewer`);
  ok('271 the service role can change is_reviewer', r.length === 1);
});
// requests guard
await db.exec(`INSERT INTO public.tutor_verification_requests (id, tutor_id, status, file_path, file_type) VALUES (gen_random_uuid(), '${T}', 'SUBMITTED', 'p', 'pdf')`);
await asRole('authenticated', T, async () => {
  await expectError(`UPDATE public.tutor_verification_requests SET status='APPROVED' WHERE tutor_id='${T}'`, /only change file_path/, '271 a tutor cannot change request status');
  await expectError(`UPDATE public.tutor_verification_requests SET reviewer_decision='APPROVE' WHERE tutor_id='${T}'`, /only change file_path/, '271 a tutor cannot change reviewer_decision');
  const fp = await q(`UPDATE public.tutor_verification_requests SET file_path='new/path.pdf' WHERE tutor_id='${T}' RETURNING file_path`);
  ok('271 a tutor CAN still change file_path', fp.length === 1 && fp[0].file_path === 'new/path.pdf', JSON.stringify(fp));
});
// verified subjects guard
const subj = (await q(`INSERT INTO public.subjects (name) VALUES ('Maths') RETURNING id`))[0].id;
await db.exec(`INSERT INTO public.tutor_verified_subjects (tutor_id, subject_id, exam_type, grade) VALUES ('${T}','${subj}','CSEC',1)`);
await asRole('authenticated', T, async () => {
  await expectError(`UPDATE public.tutor_verified_subjects SET grade = 9 WHERE tutor_id='${T}'`, /only change is_public/, '271 a tutor cannot change a verified grade');
  const v = await q(`UPDATE public.tutor_verified_subjects SET is_public = false WHERE tutor_id='${T}' RETURNING is_public`);
  ok('271 a tutor CAN still hide a subject (is_public)', v.length === 1 && v[0].is_public === false, JSON.stringify(v));
});
// notifications constraint
const nc = await q(`SELECT pg_get_constraintdef(oid) AS def, convalidated FROM pg_constraint WHERE conname='notifications_type_check'`);
ok('271 added the VERIFICATION_* types and kept the others', /VERIFICATION_APPROVED/.test(nc[0].def) && /VERIFICATION_REJECTED/.test(nc[0].def) && /VERIFICATION_REVOKED/.test(nc[0].def) && /booking_request/.test(nc[0].def) && /child_joined_class/.test(nc[0].def), nc[0].def);
ok('271 kept NOT VALID as it was', nc[0].convalidated === false, JSON.stringify(nc[0]));
await db.exec(`INSERT INTO public.notifications (user_id, type, message) VALUES ('${T}','VERIFICATION_APPROVED','ok')`);
await expectError(`INSERT INTO public.notifications (user_id, type, message) VALUES ('${T}','made_up_type','no')`, /check/i, '271 still rejects an unknown notification type');
// re-running the DO block is a no-op
const again = await run(read(mig('271_verification_security_hardening.sql')), '271 re-run');
ok('271 is safe to run twice', !again, again ?? '');

// ---------- 272 ----------
await db.exec(`UPDATE public.tutor_verification_v2 SET status='REVERIFICATION_REQUIRED' WHERE tutor_id='${T}'`);
await db.exec(`UPDATE public.profiles SET tutor_verification_status='REVERIFICATION_REQUIRED' WHERE id='${T}'`);
ok('272 REVERIFICATION_REQUIRED is a valid status on v2 and profiles', true);
await expectError(`UPDATE public.profiles SET tutor_verification_status='NONSENSE' WHERE id='${T}'`, /check/i, '272 profiles still reject an unknown status');
await db.exec(`UPDATE public.tutor_verification_v2 SET status='IN_PROGRESS' WHERE tutor_id='${T}'`);
await asRole('authenticated', T, async () => {
  const ed = await q(`SELECT public.tutor_v2_is_editable('${T}') AS e`);
  ok('272 an IN_PROGRESS teacher is editable', ed[0].e === true);
});
await db.exec(`UPDATE public.tutor_verification_v2 SET status='REVERIFICATION_REQUIRED' WHERE tutor_id='${T}'`);
await asRole('authenticated', T, async () => {
  const ed = await q(`SELECT public.tutor_v2_is_editable('${T}') AS e`);
  ok('272 a REVERIFICATION_REQUIRED teacher is editable', ed[0].e === true);
});
await db.exec(`UPDATE public.tutor_verification_v2 SET status='IN_REVIEW' WHERE tutor_id='${T}'`);
await asRole('authenticated', T, async () => {
  const ed = await q(`SELECT public.tutor_v2_is_editable('${T}') AS e`);
  ok('272 an IN_REVIEW teacher is locked', ed[0].e === false);
});
await db.exec(`INSERT INTO public.tutor_verification_v2_decisions (tutor_id, actor_role, action, from_status, to_status) VALUES ('${T}','admin','APPROVE','IN_REVIEW','VERIFIED')`);
await expectError(`UPDATE public.tutor_verification_v2_decisions SET reason='tampered'`, /append-only/, '272 the audit table cannot be updated, even by a superuser');
await expectError(`DELETE FROM public.tutor_verification_v2_decisions`, /append-only/, '272 the audit table cannot be deleted from');
await expectError(`INSERT INTO public.tutor_verification_v2_decisions (tutor_id, actor_role, action) VALUES ('${T}','admin','BOGUS')`, /check/i, '272 the audit action is constrained');
await asRole('authenticated', ADM, async () => {
  const seen = await q(`SELECT id FROM public.tutor_verification_v2_decisions`);
  ok('272 an admin/reviewer can read the audit', seen.length === 1, JSON.stringify(seen));
});
await asRole('authenticated', STU, async () => {
  const seen = await q(`SELECT id FROM public.tutor_verification_v2_decisions`);
  ok('272 a student cannot read the audit', seen.length === 0, JSON.stringify(seen));
});
await asRole('authenticated', T, async () => {
  const w = await db.query(`INSERT INTO public.tutor_verification_v2_decisions (tutor_id, actor_role, action) VALUES ('${T}','admin','APPROVE')`).then(() => 'inserted', (e) => e.message);
  ok('272 a teacher cannot write the audit', w !== 'inserted', w);
});

// ---------- 273 ----------
await asRole('authenticated', T, async () => {
  await db.exec(`UPDATE public.tutor_verification_v2 SET status='IN_PROGRESS' WHERE false`);
});
await db.exec(`UPDATE public.tutor_verification_v2 SET status='IN_PROGRESS' WHERE tutor_id='${T}'`);
await asRole('authenticated', T, async () => {
  await expectError(`INSERT INTO public.tutor_credentials_v2 (tutor_id,kind,subject,grade,exam_year,proof_deleted_at) VALUES ('${T}','CSEC','Maths','I',2020, now())`, /server only|proof_deleted_at/, '273 a teacher cannot skip the proof requirement with proof_deleted_at');
});
await asRole('service_role', null, async () => {
  const r = await q(`UPDATE public.tutor_credentials_v2 SET proof_path = NULL, proof_url = NULL, proof_deleted_at = now() WHERE tutor_id='${T}' RETURNING id`);
  ok('273 the server can clear a proof after deleting the file (shape relaxed)', r.length >= 1, JSON.stringify(r));
});

// ---------- 275 ----------
await asRole('service_role', null, async () => {
  const r = await q(`INSERT INTO public.identity_outcomes (tutor_id, provider, country, document_type, outcome, reason, provider_code, attempt, duration_seconds) VALUES ('${T}','didit','TT','Passport','verified',NULL,NULL,1,45) RETURNING id`);
  ok('275 the server can log an outcome', r.length === 1);
});
await expectError(`INSERT INTO public.identity_outcomes (provider, outcome) VALUES ('manual','verified')`, /check/i, '275 there is no manual provider');
await expectError(`INSERT INTO public.identity_outcomes (provider, outcome) VALUES ('stripe','pending')`, /check/i, '275 in-flight states are not logged');
await asRole('authenticated', ADM, async () => {
  const seen = await q(`SELECT id FROM public.identity_outcomes`);
  ok('275 an admin can read the outcomes', seen.length === 1);
});
await asRole('authenticated', STU, async () => {
  const seen = await q(`SELECT id FROM public.identity_outcomes`);
  ok('275 a student cannot read the outcomes', seen.length === 0);
});
await asRole('authenticated', T, async () => {
  const w = await db.query(`INSERT INTO public.identity_outcomes (provider, outcome) VALUES ('stripe','verified')`).then(() => 'inserted', (e) => e.message);
  ok('275 a teacher cannot write outcomes', w !== 'inserted', w);
});
const cols = (await q(`SELECT column_name FROM information_schema.columns WHERE table_name='identity_outcomes'`)).map((r) => r.column_name).sort();
ok('275 the outcomes table holds no personal data columns', JSON.stringify(cols) === JSON.stringify(['attempt','country','created_at','document_type','duration_seconds','id','outcome','provider','provider_code','reason','session_ref','tutor_id'].sort()), JSON.stringify(cols));
// account deletion keeps stats but unlinks
await db.exec(`DELETE FROM auth.users WHERE id='${T}'`).catch(() => {});
const after = await q(`SELECT count(*)::int AS n, count(tutor_id)::int AS linked FROM public.identity_outcomes`);
ok('275 deleting the account keeps the statistic and drops the link', after[0].n === 1 && after[0].linked === 0, JSON.stringify(after));

// ---------- rollbacks ----------
for (const f of ['275_identity_outcomes_rollback.sql', '274_identity_providers_rollback.sql', '273_verification_v2_redaction_deletion_rollback.sql', '272_verification_v2_review_rollback.sql']) {
  const e = await run(read(rb(f)), f);
  ok(`rollback runs: ${f}`, !e, e ?? '');
}
const afterRb = await q(`SELECT column_name FROM information_schema.columns WHERE table_name='tutor_verification_v2' AND column_name IN ('identity_provider','identity_started_at','files_deleted_at')`);
ok('rollbacks removed the added columns', afterRb.length === 0, JSON.stringify(afterRb));
for (const f of ['272_verification_v2_review.sql', '273_verification_v2_redaction_deletion.sql', '274_identity_providers.sql', '275_identity_outcomes.sql']) {
  const e = await run(read(mig(f)), f);
  ok(`re-applies after rollback: ${f}`, !e, e ?? '');
}
for (const f of ['275_identity_outcomes_rollback.sql', '274_identity_providers_rollback.sql', '273_verification_v2_redaction_deletion_rollback.sql', '272_verification_v2_review_rollback.sql', '271_verification_security_hardening_rollback.sql', '270_teacher_verification_v2_rollback.sql']) {
  const f2 = existsSync(`${REPO}/${rb(f)}`) ? f : null;
  if (!f2) { ok(`rollback file exists: ${f}`, false); continue; }
  const e = await run(read(rb(f)), f);
  ok(`full rollback chain: ${f}`, !e, e ?? '');
}
const left = await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%\\_v2%' ESCAPE '\\' OR table_name IN ('identity_outcomes','identity_webhook_events')`);
ok('after the full rollback no v2 tables remain', left.length === 0, JSON.stringify(left));

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
