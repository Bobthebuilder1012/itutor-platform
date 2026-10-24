// Checks the two generated files in docs/ on an EMBEDDED Postgres (PGlite), no real
// database: the apply file runs in one transaction, is safe to run twice, the
// read-only pre-check runs, the rollback removes the feature, and a failure rolls
// everything back. Reuses the stubs in scripts/verify-verification-migrations.mjs.
//   npm install --no-save @electric-sql/pglite
//   node scripts/build-verification-sql.mjs && node scripts/verify-combined-migrations.mjs
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';

const read = (p) => readFileSync(`${process.cwd()}/${p}`, 'utf8');
const src = read('scripts/verify-verification-migrations.mjs');
const bootstrap = src.slice(src.indexOf('const bootstrap = `') + 'const bootstrap = `'.length, src.indexOf('`;\nlet err'));
const prereq = [...src.slice(src.indexOf('const prereq = ['), src.indexOf('];', src.indexOf('const prereq = [')))
  .matchAll(/'(supabase\/migrations\/[^']+)'/g)].map((m) => m[1]);

const results = [];
const ok = (name, cond, extra = '') => results.push({ pass: !!cond, line: `${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}` });
// A failed script leaves PGlite's single session in an aborted transaction (a real SQL
// Editor request would end, and roll back, instead), so roll back explicitly.
const tryRun = async (db, sql) => { try { await db.exec(sql); return null; } catch (e) { await db.exec('ROLLBACK').catch(() => {}); return e.message; } };

async function freshDb() {
  const db = new PGlite();
  await db.exec(bootstrap);
  for (const f of prereq) await db.exec(read(f));
  await db.exec('GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated, service_role; GRANT ALL ON ALL TABLES IN SCHEMA storage TO authenticated, service_role;');
  return db;
}
const objects = async (db) => (await db.query(`
  SELECT (SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN
            ('tutor_verification_v2','tutor_credentials_v2','tutor_extras_v2','tutor_verification_v2_decisions','identity_webhook_events','identity_outcomes'))::int AS tables,
         (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'trg_%guard%' AND tgname IN
            ('trg_profiles_guard_verification_columns','trg_tutor_verification_v2_guard','trg_tutor_verified_subjects_guard','trg_tutor_verification_requests_guard'))::int AS guards`)).rows[0];

const apply = read('docs/apply-verification-migrations.sql');
const rollback = read('docs/rollback-verification-migrations.sql');
const precheck = read('docs/pre-check-notifications.sql');

// 1. one transaction, no stray ones
ok('apply has exactly one BEGIN and one COMMIT', (apply.match(/^BEGIN;/gm) ?? []).length === 1 && (apply.match(/^COMMIT;/gm) ?? []).length === 1);
ok('rollback has exactly one BEGIN and one COMMIT', (rollback.match(/^BEGIN;/gm) ?? []).length === 1 && (rollback.match(/^COMMIT;/gm) ?? []).length === 1);
ok('rollback has no live storage delete', !/^DELETE FROM storage/m.test(rollback));

// 2. apply on a clean database
let db = await freshDb();
const applyErr = await tryRun(db, apply);
ok('apply runs on a clean database', !applyErr, String(applyErr).slice(0, 300));
let o = await objects(db);
ok('apply created 6 tables and 4 guard triggers', o.tables === 6 && o.guards === 4, JSON.stringify(o));
const nc = (await db.query(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname='notifications_type_check'`)).rows[0].d;
ok('apply widened notifications_type_check and kept the old types', /VERIFICATION_APPROVED/.test(nc) && /booking_request/.test(nc), nc);
ok('apply twice is safe', !(await tryRun(db, apply)));

// 3. rollback
const e = await tryRun(db, rollback);
ok('rollback runs', !e, e ?? '');
o = await objects(db);
ok('rollback removed the tables and guard triggers', o.tables === 0 && o.guards === 0, JSON.stringify(o));
ok('apply works again after a rollback', !(await tryRun(db, apply)));

// 4. a failure leaves nothing behind (the whole file is one transaction)
db = await freshDb();
await db.exec(`ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check; ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (length(type) < 50);`);
const fail = await tryRun(db, apply);
o = await objects(db);
ok('an unrecognised notifications constraint aborts the apply with a clear message', fail && /does not recognise|shape|Widen it by hand/i.test(fail), String(fail).slice(0, 120));
ok('and nothing was left behind (0 tables, 0 guards)', o.tables === 0 && o.guards === 0, JSON.stringify(o));

// 4b. a missing prerequisite function also aborts cleanly
db = await freshDb();
await db.exec("DROP FUNCTION public.is_admin_or_reviewer(uuid) CASCADE;");
const fail2 = await tryRun(db, apply);
o = await objects(db);
ok("a missing is_admin_or_reviewer aborts the apply and leaves nothing behind", !!fail2 && o.tables === 0 && o.guards === 0, JSON.stringify(o) + " " + String(fail2).slice(0, 80));

// 5. the read-only pre-check
db = await freshDb();
const stmts = precheck.split(/;\s*\n/).map((s) => s.replace(/^(\s*--.*\n)+/gm, '').trim()).filter(Boolean);
let allSelect = true; let ran = 0; let preErr = '';
for (const s of stmts) {
  if (!/^select/i.test(s)) allSelect = false;
  try { await db.query(s); ran++; } catch (x) { preErr = x.message; }
}
ok('pre-check contains only SELECT statements', allSelect && !/\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i.test(stmts.join('\n').replace(/'[^']*'/g, '')));
ok(`pre-check: all ${stmts.length} queries run (bucket query needs storage.buckets)`, ran === stmts.length, preErr);
const c1 = (await db.query(stmts[0])).rows;
ok('pre-check 1 finds the notifications constraint on a prepared database', c1.length === 1 && c1[0].has_array_shape === true, JSON.stringify(c1));
ok('pre-check 5 reports nothing before apply', (await db.query(stmts[4])).rows.length === 0);
await db.exec(apply);
ok('pre-check 5 reports the objects after apply (so a half-applied state is visible)', (await db.query(stmts[4])).rows.length >= 6);

for (const r of results) console.log(r.line);
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
