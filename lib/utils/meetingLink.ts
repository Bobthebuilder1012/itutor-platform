/**
 * Shared meeting-link validity helper.
 *
 * A generated Zoom / Google Meet link is reused for 30 days from the moment it
 * was generated. After that it is considered stale and the next request
 * regenerates a fresh link. There is intentionally NO join-window / time-of-
 * session gating anywhere — a present, non-stale link is joinable at any time.
 *
 * Pure + deterministic (accepts `now`) so it can be unit-tested.
 */
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isLinkStillValid(
  generatedAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!generatedAt) return false;
  const ts = generatedAt instanceof Date ? generatedAt.getTime() : new Date(generatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < THIRTY_DAYS_MS;
}
