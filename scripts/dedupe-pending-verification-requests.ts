/**
 * Retire duplicate pending tutor verification requests.
 *
 * Why this exists: POST /api/verification/request never refused a second
 * submission, so a tutor who uploaded again while waiting on a reviewer ended up
 * with several rows sitting in SUBMITTED / PROCESSING / READY_FOR_REVIEW at
 * once. That is not just untidy — it is a live hazard. Once any one of them is
 * approved, rejecting a sibling runs the "was previously verified" branch in
 * app/api/admin/verification/requests/[id]/reject, which nulls
 * tutor_verification_status and unpublishes every row in
 * tutor_verified_subjects. A tutor loses the badge they already earned.
 *
 * The app now supersedes earlier requests automatically once a newer document
 * finishes processing, but that only fires on the NEXT upload. This script
 * applies the same rule to the backlog: for each tutor, keep the most recent
 * pending request and retire the older ones.
 *
 * Dry run by default. Pass --apply to write.
 *
 *   npx ts-node scripts/dedupe-pending-verification-requests.ts
 *   npx ts-node scripts/dedupe-pending-verification-requests.ts --apply
 */

import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');
const PENDING = ['SUBMITTED', 'PROCESSING', 'READY_FOR_REVIEW'];
const SUPERSEDE_REASON =
  'Superseded — the tutor uploaded a newer document before this one was reviewed.';

const admin = createClient(url, key);

async function main() {
  console.log(`🔎  ${APPLY ? 'APPLY' : 'DRY RUN'} — scanning for duplicate pending verification requests`);
  console.log(`    project: ${url}\n`);

  const { data: rows, error } = await admin
    .from('tutor_verification_requests')
    .select('id, tutor_id, status, created_at')
    .in('status', PENDING)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌  Could not read verification requests:', error.message);
    process.exit(1);
  }

  // Rows arrive newest-first, so the first per tutor is the keeper.
  const keeper = new Map<string, string>();
  const stale: { id: string; tutorId: string; status: string; createdAt: string }[] = [];

  for (const row of rows ?? []) {
    if (!keeper.has(row.tutor_id)) {
      keeper.set(row.tutor_id, row.id);
      continue;
    }
    stale.push({ id: row.id, tutorId: row.tutor_id, status: row.status, createdAt: row.created_at });
  }

  console.log(`    ${rows?.length ?? 0} pending request(s) across ${keeper.size} tutor(s)`);

  if (stale.length === 0) {
    console.log('✅  No duplicates. Nothing to do.');
    return;
  }

  const affectedTutors = new Set(stale.map((s) => s.tutorId));
  console.log(`⚠️   ${stale.length} duplicate(s) across ${affectedTutors.size} tutor(s):\n`);
  for (const s of stale) {
    console.log(`    tutor ${s.tutorId}  keep ${keeper.get(s.tutorId)}  retire ${s.id}  (${s.status}, ${s.createdAt})`);
  }

  if (!APPLY) {
    console.log('\n💡  Dry run — re-run with --apply to retire the duplicates listed above.');
    return;
  }

  // Updated in one statement so a partial failure can't leave half a tutor's
  // duplicates retired.
  const { data: updated, error: updateError } = await admin
    .from('tutor_verification_requests')
    .update({
      status: 'REJECTED',
      reviewer_reason: SUPERSEDE_REASON,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in('id', stale.map((s) => s.id))
    .select('id');

  if (updateError) {
    console.error('\n❌  Update failed:', updateError.message);
    process.exit(1);
  }

  console.log(`\n✅  Retired ${updated?.length ?? 0} duplicate request(s).`);
  console.log('    Each affected tutor keeps exactly one request awaiting review.');
}

main().catch((err) => {
  console.error('❌  Unexpected error:', err);
  process.exit(1);
});
