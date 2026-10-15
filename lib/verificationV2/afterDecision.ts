// What happens to a teacher's ID data and files once a decision is saved.
// Best effort by design: a failure here is returned to be reported, and never
// undoes or blocks the decision. The retention sweep (cleanup.ts) retries.

import { retentionPolicy } from '@/config/verificationRetention';
import type { Db } from '@/lib/verification/setStatus';
import { redactIdentitySessions, type RedactResult } from './redaction';
import { deleteVerificationFiles, type DeletionResult } from './fileDeletion';

export interface AfterDecision {
  redaction: RedactResult;
  /** Present only when the retention period is 0, i.e. delete straight away. */
  files?: DeletionResult;
}

export async function afterRejection(tutorId: string, db?: Db): Promise<AfterDecision> {
  const redaction = await redactIdentitySessions({ tutorId, db });
  const files =
    retentionPolicy.rejectedDays === 0
      ? await deleteVerificationFiles({ tutorId, scope: 'v2', reason: 'rejection', db })
      : undefined;
  return { redaction, files };
}

export async function afterRevocation(tutorId: string, db?: Db): Promise<AfterDecision> {
  const redaction = await redactIdentitySessions({ tutorId, db });
  const files =
    retentionPolicy.revokedDays === 0
      ? await deleteVerificationFiles({ tutorId, scope: 'all', reason: 'revocation', db })
      : undefined;
  return { redaction, files };
}

/** An approval keeps the files (they were the evidence) but ID data leaves Stripe. */
export async function afterApproval(tutorId: string, db?: Db): Promise<AfterDecision> {
  return { redaction: await redactIdentitySessions({ tutorId, db }) };
}
