/**
 * =====================================================
 * CUSTOMER.IO BACKFILL
 * =====================================================
 * One-time bulk import of existing profiles into Customer.io.
 *
 * Preferred over the CSV route in Customer.io's UI because it reuses the exact
 * same attribute mapping as the ongoing sync (lib/customerio/attributes.ts). A
 * hand-built CSV would drift from that mapping immediately, leaving imported
 * customers with a different attribute shape from everyone who signs up after —
 * and every segment then has to account for both.
 *
 * Usage:
 *   npx ts-node scripts/customerio-backfill.ts --dry-run
 *   npx ts-node scripts/customerio-backfill.ts --limit 50
 *   npx ts-node scripts/customerio-backfill.ts
 *
 * Flags:
 *   --dry-run   Print what would be sent; makes no Customer.io calls.
 *   --limit N   Stop after N profiles. Use for a small live smoke test first.
 *   --role R    Only profiles with this role.
 *   --force     Re-send profiles already recorded as synced.
 *
 * Requires in the environment: NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY, CUSTOMERIO_ENABLED=true, CUSTOMERIO_SITE_ID,
 * CUSTOMERIO_API_KEY.
 *
 * READ THIS FIRST: this platform's staging database contains real customer
 * email addresses. Run --dry-run before anything else, and set
 * CUSTOMERIO_ALLOWED_EMAILS to your own address for the first live run.
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load .env.local by hand — this repo has no dotenv dependency, and the other
// scripts read it the same way. Values go into process.env rather than a local
// map because lib/customerio/config.ts reads process.env directly; loading into
// a map would leave the integration looking permanently disabled here.
//
// Must run before the lib imports below execute anything at module scope.
(function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^["']|["']$/g, '');
    // A real environment variable wins, so a one-off override on the command
    // line is not silently reverted by the file.
    if (process.env[key] === undefined) process.env[key] = value;
  }
})();

import { getCustomerIoConfig, isProfileSyncable } from '../lib/customerio/config';
import { identify } from '../lib/customerio/client';
import {
  buildCustomerAttributes,
  hashAttributes,
  PROFILE_SYNC_COLUMNS,
  subjectNamesFrom,
  type SyncableProfile,
} from '../lib/customerio/attributes';

/** Rows read from Postgres per page. */
const PAGE_SIZE = 500;

/**
 * Pause between Customer.io calls. The Track API permits far more than this;
 * the throttle exists so an accidental full-table run is slow enough that an
 * operator can still Ctrl-C it before it finishes.
 */
const THROTTLE_MS = 60;

interface Args {
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  role: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, force: false, limit: null, role: null };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--force') args.force = true;
    else if (arg === '--limit') {
      const value = Number(argv[++i]);
      if (!Number.isFinite(value) || value <= 0) throw new Error('--limit needs a positive number');
      args.limit = value;
    } else if (arg === '--role') {
      const value = argv[++i];
      if (!value) throw new Error('--role needs a value');
      args.role = value;
    } else throw new Error(`Unknown flag: ${arg}`);
  }

  return args;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  // A dry run should work with no Customer.io credentials at all — that is the
  // whole point of being able to inspect the payload before committing to it.
  const cioConfig = getCustomerIoConfig();
  if (!cioConfig && !args.dryRun) {
    throw new Error(
      'Customer.io is not configured. Set CUSTOMERIO_ENABLED=true, CUSTOMERIO_SITE_ID and ' +
        'CUSTOMERIO_API_KEY, or pass --dry-run.'
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  console.log(
    `[backfill] mode=${args.dryRun ? 'DRY RUN' : 'LIVE'}` +
      `${args.role ? ` role=${args.role}` : ''}` +
      `${args.limit ? ` limit=${args.limit}` : ''}` +
      `${args.force ? ' force' : ''}`
  );

  if (cioConfig && cioConfig.allowedEmails.size > 0) {
    console.log(
      `[backfill] allowlist active — only ${cioConfig.allowedEmails.size} address(es) can be sent`
    );
  } else if (!args.dryRun) {
    console.log('[backfill] NO allowlist set — every matching profile will be sent to Customer.io');
  }

  const stats = { seen: 0, sent: 0, skipped: 0, unchanged: 0, failed: 0 };
  let page = 0;

  // Keyset pagination on a stable key. A plain .range() offset would re-read or
  // skip rows as the table changes under a long-running import.
  let cursor: string | null = null;

  for (;;) {
    let query = supabase
      .from('profiles')
      .select(PROFILE_SYNC_COLUMNS)
      .order('id', { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) query = query.gt('id', cursor);
    if (args.role) query = query.eq('role', args.role);

    const { data, error } = await query;
    if (error) throw new Error(`profile read failed: ${error.message}`);

    const rows = (data ?? []) as unknown as SyncableProfile[];
    if (rows.length === 0) break;

    page += 1;
    console.log(`[backfill] page ${page}: ${rows.length} profiles`);

    // Subject names for every tutor on this page in one query. The per-profile
    // lookup the sync service uses is fine for a handful of rows, but at 500 a
    // page it would triple the runtime of the import for no benefit.
    const tutorIds = rows.filter(r => r.role === 'tutor').map(r => r.id);
    const subjectsByTutor = new Map<string, string[]>();

    if (tutorIds.length > 0) {
      const { data: subjectRows, error: subjectError } = await supabase
        .from('tutor_subjects')
        .select('tutor_id, subjects(name)')
        .in('tutor_id', tutorIds);

      if (subjectError) {
        // Non-fatal: tutors just sync without a subjects attribute this pass.
        console.error(`[backfill] tutor subject read failed: ${subjectError.message}`);
      } else {
        for (const row of (subjectRows ?? []) as unknown as Array<{
          tutor_id: string;
          subjects: unknown;
        }>) {
          for (const name of subjectNamesFrom(row.subjects)) {
            const list = subjectsByTutor.get(row.tutor_id);
            if (list) {
              if (!list.includes(name)) list.push(name);
            } else {
              subjectsByTutor.set(row.tutor_id, [name]);
            }
          }
        }
      }
    }

    for (const profile of rows) {
      if (args.limit !== null && stats.seen >= args.limit) {
        console.log(`[backfill] reached --limit ${args.limit}`);
        report(stats);
        return;
      }

      stats.seen += 1;
      cursor = profile.id;

      const attributes = buildCustomerAttributes(profile, {
        tutorSubjects: subjectsByTutor.get(profile.id) ?? null,
      });
      const hash = hashAttributes(attributes);

      // Dry run reports the gate verdict too, so you can see who the allowlist
      // and dev-account filters would exclude before going live.
      const gate = cioConfig
        ? isProfileSyncable(cioConfig, profile)
        : { allowed: true as boolean, reason: undefined as string | undefined };

      if (!gate.allowed) {
        stats.skipped += 1;
        console.log(`  skip ${profile.email ?? profile.id} (${gate.reason})`);
        continue;
      }

      if (args.dryRun) {
        console.log(`  would send ${profile.email} -> ${JSON.stringify(attributes)}`);
        stats.sent += 1;
        continue;
      }

      if (!args.force) {
        const { data: state } = await supabase
          .from('customerio_sync_state')
          .select('attributes_hash')
          .eq('user_id', profile.id)
          .maybeSingle();

        if (state?.attributes_hash === hash) {
          stats.unchanged += 1;
          continue;
        }
      }

      const result = await identify(profile.id, attributes);
      const now = new Date().toISOString();

      if (result.ok) {
        stats.sent += 1;
        // Written so the reconciler inherits this run's progress instead of
        // re-sending everything on its next pass.
        await supabase.from('customerio_sync_state').upsert(
          {
            user_id: profile.id,
            synced_updated_at: profile.updated_at ?? now,
            attributes_hash: hash,
            synced_at: now,
            last_attempt_at: now,
            failure_count: 0,
            last_error: null,
          },
          { onConflict: 'user_id' }
        );
      } else {
        stats.failed += 1;
        console.error(`  FAIL ${profile.email}: ${result.error ?? result.skipped}`);
        // No state write on failure: leaving the row absent means the reconciler
        // treats it as pending and retries it.
      }

      await sleep(THROTTLE_MS);
    }

    if (rows.length < PAGE_SIZE) break;
  }

  report(stats);
}

function report(stats: Record<string, number>): void {
  console.log('[backfill] done:', JSON.stringify(stats));
  if (stats.failed > 0) {
    console.log('[backfill] failures are left unmarked and the sync cron will retry them.');
  }
}

main().catch(err => {
  console.error('[backfill] fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
