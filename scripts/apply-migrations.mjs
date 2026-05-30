// Applies pending Supabase migrations via the Management API (bypasses CLI pgx multi-statement limit)
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PROJECT_REF = 'thjsdcbzlvjradczhgso';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const API_BASE = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

if (!ACCESS_TOKEN) {
  console.error('Set SUPABASE_ACCESS_TOKEN env var');
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API error ${res.status}: ${text}`);
  return JSON.parse(text);
}

// Migrations to apply in order
const PENDING = [
  '154_payout_batch_atomic.sql',
  '155_booking_slot_exclusion.sql',
  '156_reliability_and_disputes.sql',
  '157_noshow_evidence_bucket.sql',
  '158_deprecate_legacy_student_cancel_rpc.sql',
  '160_groups_subscription_foundation.sql',
  '159_group_subscription_billing.sql',
  '161_group_members_extended_status.sql',
  '162_groups_class_settings_columns.sql',
  '163_ledger_consolidation.sql',
  '164_ratings_reply_and_recurring_lessons.sql',
  '165_groups_meeting_link.sql',
  '166_group_promotions.sql',
  '167_strikes_appeals_and_evidence_storage.sql',
];

// Check which are already applied
async function getApplied() {
  const rows = await query('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
  return new Set(rows.map(r => String(r.version)));
}

async function markApplied(version, name, sql) {
  const escaped = sql.replace(/'/g, "''");
  await query(
    `INSERT INTO supabase_migrations.schema_migrations(version, name, statements)
     VALUES ('${version}', '${name}', ARRAY['${escaped}']::text[])
     ON CONFLICT (version) DO NOTHING`
  );
}

async function main() {
  console.log('Fetching applied migrations...');
  const applied = await getApplied();
  console.log(`${applied.size} migrations already applied.\n`);

  for (const filename of PENDING) {
    const namePart = filename.replace('.sql', '');
    const version = namePart.match(/^(\d+)/)[1];

    if (applied.has(version)) {
      console.log(`  SKIP  ${filename} (already applied)`);
      continue;
    }

    const filePath = join(ROOT, 'supabase', 'migrations', filename);
    let sql;
    try {
      sql = readFileSync(filePath, 'utf8');
    } catch {
      console.error(`  ERROR Cannot read ${filePath}`);
      process.exit(1);
    }

    // 159 is superseded by 160 (which was applied first); just register it as applied
    const skipExecution = new Set(['159']);
    process.stdout.write(`  APPLY ${filename} ... `);
    try {
      if (!skipExecution.has(version)) {
        await query(sql);
      }
      await markApplied(version, namePart, sql);
      console.log(skipExecution.has(version) ? 'REGISTERED (superseded by 160)' : 'OK');
    } catch (err) {
      console.log('FAILED');
      console.error(`         ${err.message}`);
      console.error('Stopping. Fix the error above and re-run.');
      process.exit(1);
    }
  }

  console.log('\nAll done.');
}

main();
