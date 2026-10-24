// The retention sweep: applies config/verificationRetention.ts.
//
//   1. v2 applications REJECTED longer ago than rejectedDays   -> delete their v2 proof files
//   2. v2 teachers REVOKED longer ago than revokedDays         -> delete ALL their verification files
//   3. old-flow requests REJECTED longer ago than rejectedDays -> delete that request's file and OCR text
//   4. any decided v2 record whose Stripe session is not yet redacted -> redact it (retry)
//
// Scheduled daily by vercel.json (/api/cron/verification-cleanup?apply=1), which does
// nothing while VERIFICATION_V2_ENABLED is off. Also exposed through an admin-only
// route. Called by hand it is a dry run unless apply is set. See docs/staging-handoff.md.
//
// Limit: old-flow REVOKED teachers have no decision date (the old revoke clears
// tutor_verified_at and writes no audit), so step 2 covers v2 records only.

import { getServiceClient } from '@/lib/supabase/server';
import { retentionPolicy, type RetentionPolicy } from '@/config/verificationRetention';
import type { Db } from '@/lib/verification/setStatus';
import { redactIdentitySessions } from './redaction';
import { deleteRequestFile, deleteVerificationFiles } from './fileDeletion';

export interface CleanupReport {
  dryRun: boolean;
  v2RejectedFiles: { due: number; done: number };
  v2RevokedFiles: { due: number; done: number };
  oldRejectedRequests: { due: number; done: number };
  redactions: { due: number; done: number };
  errors: string[];
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

export async function runVerificationCleanup(opts: {
  dryRun?: boolean;
  now?: Date;
  limit?: number;
  policy?: RetentionPolicy;
  db?: Db;
} = {}): Promise<CleanupReport> {
  const dryRun = opts.dryRun !== false;
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? 100;
  const policy = opts.policy ?? retentionPolicy;
  const db = opts.db ?? (getServiceClient() as Db);

  const report: CleanupReport = {
    dryRun,
    v2RejectedFiles: { due: 0, done: 0 },
    v2RevokedFiles: { due: 0, done: 0 },
    oldRejectedRequests: { due: 0, done: 0 },
    redactions: { due: 0, done: 0 },
    errors: [],
  };

  // 1 and 2: v2 files, by decision date.
  for (const [status, days, key, scope, reason] of [
    ['REJECTED', policy.rejectedDays, 'v2RejectedFiles', 'v2', 'retention'],
    ['REVOKED', policy.revokedDays, 'v2RevokedFiles', 'all', 'retention'],
  ] as const) {
    const { data, error } = await db
      .from('tutor_verification_v2')
      .select('tutor_id')
      .eq('status', status)
      .is('files_deleted_at', null)
      .lt('decided_at', daysAgo(now, days))
      .limit(limit);
    if (error) {
      report.errors.push(`${status} files: ${error.message}`);
      continue;
    }
    report[key].due = (data ?? []).length;
    if (dryRun) continue;
    for (const r of data ?? []) {
      const res = await deleteVerificationFiles({ tutorId: r.tutor_id, scope, reason, db });
      if (res.ok) report[key].done++;
      else report.errors.push(`${status} ${r.tutor_id}: ${res.errors.join('; ')}`);
    }
  }

  // 3: old-flow rejected requests.
  {
    const { data, error } = await db
      .from('tutor_verification_requests')
      .select('id, file_path')
      .eq('status', 'REJECTED')
      .neq('file_path', '')
      .lt('reviewed_at', daysAgo(now, policy.rejectedDays))
      .limit(limit);
    if (error) report.errors.push(`old rejected requests: ${error.message}`);
    else {
      report.oldRejectedRequests.due = (data ?? []).length;
      if (!dryRun) {
        for (const r of data ?? []) {
          const res = await deleteRequestFile({ requestId: r.id, filePath: r.file_path, db });
          if (res.ok) report.oldRejectedRequests.done++;
          else report.errors.push(`request ${r.id}: ${res.error}`);
        }
      }
    }
  }

  // 4: redaction retries, for any decided record.
  if (policy.redactStripeSessionAfterDecision) {
    const { data, error } = await db
      .from('tutor_verification_v2')
      .select('tutor_id')
      .in('status', ['VERIFIED', 'REJECTED', 'REVOKED'])
      .is('identity_redacted_at', null)
      .not('stripe_identity_session_id', 'is', null)
      .limit(limit);
    if (error) report.errors.push(`redactions: ${error.message}`);
    else {
      report.redactions.due = (data ?? []).length;
      if (!dryRun) {
        for (const r of data ?? []) {
          const res = await redactIdentitySessions({ tutorId: r.tutor_id, db });
          if (res.ok) report.redactions.done++;
          else report.errors.push(`redact ${r.tutor_id}: ${res.error}`);
        }
      }
    }
  }

  return report;
}
