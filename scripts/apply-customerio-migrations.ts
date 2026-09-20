/**
 * Applies the Customer.io activation migrations (257–259) to staging.
 *
 * Run: SUPABASE_ACCESS_TOKEN=sbp_... npm run customerio:migrate
 *
 * Sibling of scripts/apply-finder-migrations.ts — same .env.local parser, same
 * ref derivation, same refusal to touch production. It uses ONLY the Management
 * API, because that is the only transport that reaches a Supabase branch:
 * db.<ref>.supabase.co resolves IPv6-only, and the pooler does not register a
 * branch as its own tenant. (See the long note in the finder script.)
 *
 * The token is read from the environment and never written anywhere, so it
 * cannot end up committed.
 *
 * Safe to re-run. Every statement across the three files is idempotent —
 * ADD COLUMN IF NOT EXISTS, DROP TRIGGER IF EXISTS before each CREATE TRIGGER,
 * CREATE INDEX IF NOT EXISTS, DROP VIEW IF EXISTS before the view, and
 * CREATE OR REPLACE for the watermark view and the RPC. 259 runs inside a
 * single transaction and ends with an assertion, so a partial apply rolls back
 * rather than leaving a half-built contract behind.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Tiny .env.local parser so we don't need dotenv as a dep.
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

/** The production ref. Never a valid target for this script. */
const PRODUCTION_REF = 'nfkrfciozjxrodkusrhh';

if (!PROJECT_REF) {
  console.error('Could not derive a project ref from NEXT_PUBLIC_SUPABASE_URL in .env.local.');
  process.exit(1);
}

if (PROJECT_REF === PRODUCTION_REF) {
  console.error(
    `Refusing to run: NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION ref (${PRODUCTION_REF}).\n` +
      'Staging is a BRANCH of prod, so the two refs live in the same project and a\n' +
      'mistyped env var is the whole distance between them. Production additionally\n' +
      'needs migration 246 first, which has never been applied there.'
  );
  process.exit(1);
}

const MIGRATIONS = [
  '257_marketing_consent.sql',
  '258_group_members_audit_columns.sql',
  '259_customerio_activation_view.sql',
];

/**
 * The proof that the contract exists — not merely that the statements were
 * accepted. The row-count equality is the brief's first non-negotiable ("exactly
 * one row per customer_id"), and anon_privs is the one that matters for privacy:
 * a view in `public` inherits Supabase's default GRANT ALL, and this one carries
 * email addresses and phone numbers.
 */
const VERIFY_SQL = `
  SELECT
    (SELECT count(*) FROM public.customerio_profiles_v1)                AS view_rows,
    (SELECT count(DISTINCT customer_id) FROM public.customerio_profiles_v1) AS distinct_customers,
    (SELECT count(*) FROM public.profiles)                              AS profiles,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='profiles'
        AND column_name IN ('marketing_consent','marketing_consent_at','marketing_consent_source')
    )                                                                   AS consent_columns_3,
    (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='group_members'
        AND column_name IN ('parent_id','initiated_by','status_changed_at','status_changed_by',
                            'status_reason','action_reason','actioned_at','actioned_by',
                            'suspended_until','updated_at')
    )                                                                   AS group_member_columns_10,
    (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
      WHERE NOT t.tgisinternal AND t.tgname IN
        ('groups_updated_at','group_enrollments_updated_at','group_members_updated_at')
    )                                                                   AS updated_at_triggers_3,
    (SELECT to_regclass('public.customerio_activation_watermarks') IS NOT NULL) AS watermarks_view,
    (SELECT count(*) FROM information_schema.role_table_grants
      WHERE table_schema='public'
        AND table_name IN ('customerio_profiles_v1','customerio_activation_watermarks')
        AND grantee IN ('anon','authenticated')
    )                                                                   AS anon_privs_must_be_0,
    (SELECT count(*) FROM pg_indexes
      WHERE schemaname='public' AND indexname='idx_product_events_class_viewed'
    )                                                                   AS class_viewed_index
`;

async function main(): Promise<void> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) {
    console.error(
      'No SUPABASE_ACCESS_TOKEN set.\n' +
        'The Management API is the only transport that reaches a Supabase branch.\n' +
        'Re-run as:  SUPABASE_ACCESS_TOKEN=sbp_... npm run customerio:migrate'
    );
    process.exitCode = 1;
    return;
  }

  const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
  const post = async (sql: string) =>
    fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });

  console.log(`Applying Customer.io activation migrations to ${PROJECT_REF}.`);

  for (const file of MIGRATIONS) {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations', file), 'utf8');
    console.log(`\n=== Applying ${file} (${sql.length} bytes) ===`);
    const res = await post(sql);
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error(`FAILED ${file}: HTTP ${res.status} ${detail.slice(0, 800)}`);
      process.exit(1);
    }
    console.log(`OK  ${file} applied.`);
  }

  const res = await post(VERIFY_SQL);
  if (!res.ok) {
    console.error(`Verification query failed: HTTP ${res.status}`);
    process.exit(1);
  }
  const rows = (await res.json()) as Record<string, unknown>[];
  console.log('\n=== Verification ===');
  console.table(rows);

  const row = rows?.[0] ?? {};
  const n = (k: string) => Number(row[k] ?? -1);

  const problems: string[] = [];
  if (n('view_rows') !== n('profiles') || n('distinct_customers') !== n('profiles')) {
    problems.push(
      `the view does not return exactly one row per profile ` +
        `(${n('view_rows')} rows, ${n('distinct_customers')} distinct, ${n('profiles')} profiles)`
    );
  }
  if (n('consent_columns_3') !== 3) problems.push('marketing consent columns missing');
  if (n('group_member_columns_10') !== 10) problems.push('group_members columns missing');
  if (n('updated_at_triggers_3') !== 3) problems.push('updated_at triggers missing — the activation watermark will not see edits');
  if (row.watermarks_view !== true) problems.push('customerio_activation_watermarks missing');
  if (n('anon_privs_must_be_0') !== 0) problems.push('anon/authenticated hold privileges on a view carrying emails');
  if (n('class_viewed_index') !== 1) problems.push('class_viewed index missing');

  if (problems.length > 0) {
    console.error('\nVerification FAILED:');
    for (const p of problems) console.error(`  - `);
    process.exitCode = 1;
    return;
  }

  console.log('\nAll three migrations applied and verified.');
  console.log(
    'Reminder: this does NOT enable anything. CUSTOMERIO_ENABLED stays false until\n' +
      'CUSTOMERIO_ALLOWED_EMAILS is set to a single inbox — staging holds real\n' +
      'customer addresses.'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
