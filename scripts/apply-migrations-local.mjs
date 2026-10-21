// Applies EVERY file in supabase/migrations to a LOCAL or your OWN EMPTY Supabase
// project, in order, stopping at the first failure so it can be fixed.
//
//   node scripts/apply-migrations-local.mjs [--confirm-ref <ref>] [--from 120]
//
// Reads DATABASE_URL from .env.local (the project's "Connection string" in the
// Supabase dashboard, Settings > Database; use the direct or the session pooler).
//
// SAFETY (it refuses otherwise, before connecting):
//   - the database must be localhost / 127.0.0.1, or a Supabase project whose ref
//     equals SEED_ALLOWED_PROJECT_REF, repeated on the command line with
//     --confirm-ref <ref>
//   - never a known production or staging ref
//   - the database must be EMPTY (no tables in the public schema). The first
//     migration drops everything, so this is not run on a database with data.
//
// It records what it applied in a small table (_local_applied_migrations), so a
// failed run can be resumed after you fix the file: just run it again.

import { readFileSync, readdirSync, existsSync } from 'fs';
import pg from 'pg';

const envPath = new URL('../.env.local', import.meta.url);
const env = { ...process.env };
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const KNOWN_REMOTE_REFS = ['nfkrfciozjxrodkusrhh', 'lhxlhzgisrauqipuxaxh', 'thjsdcbzlvjradczhgso'];
const args = process.argv.slice(2);
const argAfter = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const confirmRef = argAfter('--confirm-ref');
const fromN = argAfter('--from') ? Number(argAfter('--from')) : 0;

const refuse = (why) => {
  console.error(`\nREFUSING TO APPLY MIGRATIONS: ${why}\n`);
  process.exit(1);
};

const dbUrl = env.DATABASE_URL;
if (!dbUrl) refuse('DATABASE_URL is not set in .env.local.');
let u;
try { u = new URL(dbUrl); } catch { refuse('DATABASE_URL is not a valid URL.'); }

const host = u.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
// ref from db.<ref>.supabase.co, or from the pooler user name postgres.<ref>
const ref = /^db\.([a-z0-9]+)\.supabase\.co$/.exec(host)?.[1] ?? /^postgres\.([a-z0-9]+)$/.exec(decodeURIComponent(u.username))?.[1] ?? null;

if (ref && KNOWN_REMOTE_REFS.includes(ref)) refuse(`${ref} is a known production or staging project.`);
if (!isLocal) {
  if (!ref) refuse(`cannot tell which Supabase project ${host} belongs to.`);
  if (!env.SEED_ALLOWED_PROJECT_REF) refuse('set SEED_ALLOWED_PROJECT_REF in .env.local to YOUR OWN empty project ref.');
  if (env.SEED_ALLOWED_PROJECT_REF !== ref) refuse(`SEED_ALLOWED_PROJECT_REF (${env.SEED_ALLOWED_PROJECT_REF}) does not match this database (${ref}).`);
  if (confirmRef !== ref) refuse(`repeat the ref on the command line: --confirm-ref ${ref}`);
}

const dir = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.sql'))
  .sort((a, b) => (parseInt(a, 10) - parseInt(b, 10)) || a.localeCompare(b))
  .filter((f) => parseInt(f, 10) >= fromN);

const client = new pg.Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query('CREATE TABLE IF NOT EXISTS public._local_applied_migrations (file text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  const done = new Set((await client.query('SELECT file FROM public._local_applied_migrations')).rows.map((r) => r.file));

  if (done.size === 0) {
    const tables = await client.query(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name <> '_local_applied_migrations'`
    );
    if (tables.rows[0].n > 0) {
      console.error(`\nREFUSING: the public schema already has ${tables.rows[0].n} tables. This script only starts on an EMPTY database (migration 000 drops everything).\n`);
      process.exit(1);
    }
  }

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const sql = readFileSync(new URL(f, dir), 'utf8');
    process.stdout.write(`applying ${f} ... `);
    try {
      await client.query(sql);
      await client.query('INSERT INTO public._local_applied_migrations (file) VALUES ($1)', [f]);
      console.log('ok');
      applied++;
    } catch (e) {
      console.log('FAILED');
      console.error(`\n${f}\n  ${e.message}${e.detail ? `\n  detail: ${e.detail}` : ''}${e.hint ? `\n  hint: ${e.hint}` : ''}${e.position ? `\n  position: ${e.position}` : ''}`);
      console.error('\nFix that file (or the database), then run this command again: it resumes after the last file that worked.\n');
      process.exit(1);
    }
  }
  console.log(`\nDone. ${applied} migration(s) applied (${done.size} had been applied before).`);
} finally {
  await client.end();
}
