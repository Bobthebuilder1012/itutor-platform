// When the teacher's verification page should keep asking for its own status.
// Client-safe, no imports beyond types. The page polls only while a change can still
// arrive from outside (a reviewer deciding, a provider reporting), and stops once the
// status is one that only the teacher or an admin can move on.

import type { VerificationV2FlowStatus, VerificationV2StateDto } from './constants';

/** Statuses that can still change by themselves. Everything else is final for polling. */
const POLL_MS: Partial<Record<VerificationV2FlowStatus, number>> = {
  IN_REVIEW: 5_000, // a reviewer may decide at any moment
  IN_PROGRESS: 8_000, // the identity check may report (and the teacher may be on another device)
};

export function pollIntervalMs(status: VerificationV2FlowStatus | null | undefined): number | null {
  return (status && POLL_MS[status]) || null;
}

export function shouldPoll(status: VerificationV2FlowStatus | null | undefined): boolean {
  return pollIntervalMs(status) !== null;
}

/**
 * The fields whose change the teacher must see. A poll result is applied only when
 * this differs, so a form the teacher is typing in is never re-rendered for nothing.
 */
export function stateSignature(s: VerificationV2StateDto): string {
  return JSON.stringify([
    s.status,
    s.identity.status,
    s.identity.reason,
    s.identity.attempts,
    s.identity.canRetry,
    s.identity.furtherRoute,
    s.decisionReason,
    s.submittedAt,
    s.editable,
    s.step,
    s.credentials.length,
    s.extras.length,
  ]);
}
