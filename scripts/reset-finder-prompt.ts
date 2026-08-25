/**
 * Clears the Finder's one-shot flags for one account, so the forced
 * post-login interstitial can be tested again.
 *
 * Run: SUPABASE_ACCESS_TOKEN=sbp_... npx ts-node scripts/reset-finder-prompt.ts <email>
 *
 * WHY THIS EXISTS. `finder_prompted_at` is deliberately write-once: it is what
 * stops a family who abandoned the wizard being re-forced into it on every
 * login. That is correct in production and inconvenient in testing, because the
 * first person to try the flow burns the flag and can never see the forced path
 * again on that account. Rather than loosening the rule, this reverses it for a
 * named account on purpose.
 *
 * WHAT IT DOES NOT TOUCH: `finder_requests` and `demand_signals`. Those are the
 * demand ledger — an append-only record of what families asked for — and
 * deleting them to tidy up a test would destroy exactly the data the feature
 * exists to collect. A reset account simply gets another run appended, with an
 * incremented run_number, which is also how preference drift is meant to look.
 *
 * STAGING ONLY, like the migration runner: it refuses the production ref.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadDotEnv(path: string) {
  try {
    const raw = readFileSync(path, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* no-op */
  }
}
loadDotEnv(resolve(process.cwd(), '.env.local'));

const PROJECT_REF = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
  .replace(/^https?:\/\//, '')
  .split('.')[0];
const PRODUCTION_REF = 'nfkrfciozjxrodkusrhh';

const email = process.argv[2];
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!email) {
  console.error('Usage: npx ts-node scripts/reset-finder-prompt.ts <email>');
  process.exit(1);
}
if (!token) {
  console.error('Set SUPABASE_ACCESS_TOKEN (an sbp_… personal token).');
  process.exit(1);
}
if (!PROJECT_REF || PROJECT_REF === PRODUCTION_REF) {
  console.error(`Refusing to run against ${PROJECT_REF || '(no ref)'} — staging only.`);
  process.exit(1);
}

/**
 * Single-quotes are doubled rather than stripped: the address is an argv value,
 * and this is string-interpolated into SQL because the Management API takes a
 * query rather than parameters.
 */
const safeEmail = email.replace(/'/g, "''");

const SQL = `
  UPDATE public.profiles
     SET finder_prompted_at = NULL,
         finder_completed_at = NULL
   WHERE lower(email) = lower('${safeEmail}')
  RETURNING email, role, form_level, finder_prompted_at, finder_completed_at;
`;

async function main() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SQL }),
    }
  );

  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${(await res.text().catch(() => '')).slice(0, 500)}`);
    process.exit(1);
  }

  const rows = (await res.json()) as unknown[];
  if (!Array.isArray(rows) || rows.length === 0) {
    console.error(`No profile found for ${email} on ${PROJECT_REF}.`);
    process.exit(1);
  }

  console.log(`Reset on ${PROJECT_REF}:`);
  console.table(rows);
  console.log(
    '\nNext login as this account is routed to /find?trigger=login_backfill,\n' +
      'provided FINDER_GATE_MODE admits them (default `internal` = staff domains only).'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
