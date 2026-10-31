// The ONLY reasons a teacher is ever shown for a rejection, a revocation or a request for
// more information. Plain words, never a Didit code and never a fraud signal. Client-safe.
//
// An admin picks one of these; anything else is refused by the routes. Free text can be added
// as an internal note: it goes to the admin-only audit table and is never shown to the teacher.

export const DECISION_REASONS = [
  'ID could not be read',
  'ID details did not match your profile name',
  'Credentials unclear or incomplete',
  'Credentials could not be confirmed',
  'Other',
] as const;

export type DecisionReason = (typeof DECISION_REASONS)[number];

export function isDecisionReason(value: unknown): value is DecisionReason {
  return typeof value === 'string' && (DECISION_REASONS as readonly string[]).includes(value);
}

/** The audit text: the reason the teacher sees, plus the internal note if there is one. */
export function auditReason(reason: string, note?: string | null): string {
  const n = (note ?? '').trim().slice(0, 500);
  return n ? `${reason} (internal note: ${n})` : reason;
}
