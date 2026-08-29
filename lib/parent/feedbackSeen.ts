'use client';

// Marking parent feedback as seen, and telling the shell it happened.
//
// The badge and the dashboard attention card both count feedback created after
// `profiles.feedback_seen_at` (migration 236). Opening /parent/feedback stamps
// it — that stamp is what gives "Read feedback" something to do, since before
// it existed both counters ran on age alone and could not be cleared.
//
// The event exists because the stamp and the badge live on opposite sides of
// the tree: the page renders as ParentShell's `children`, so it cannot call
// back into the shell. Without it the shell's counts, fetched once per profile,
// would keep showing the old number for the rest of the session even though the
// server had recorded the visit — the fix would look like it had not worked.

export const FEEDBACK_SEEN_EVENT = 'parent-feedback-seen';

/**
 * Stamp the parent's feedback high-water mark and clear the badge.
 *
 * Safe to call more than once: the endpoint only ever moves the mark forward.
 * Failure is deliberately silent — the visit not being recorded means the badge
 * lingers, which is the state the parent was already in, and an error toast on
 * a page they opened to *read* something would be noise.
 */
export async function markFeedbackSeen(): Promise<void> {
  try {
    const res = await fetch('/api/parent/feedback/seen', {
      method: 'POST',
      cache: 'no-store',
    });
    if (!res.ok) return;
    window.dispatchEvent(new CustomEvent(FEEDBACK_SEEN_EVENT));
  } catch {
    /* see above — a failed stamp is a lingering badge, not an error worth showing */
  }
}
