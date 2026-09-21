// When a reminder is allowed, and what to say when it is not.
//
// Shared by the single-invite route and the bulk one so that one press and
// fifty behave identically. It lives here rather than being exported from a
// route file because Next.js App Router route modules may only export HTTP
// handlers and a fixed set of config keys — an extra export there fails the
// build, which is not a failure this project can see locally.
//
// The reasons are written as sentences a teacher can act on. A bare 429
// becomes "Failed" in a toast, and then the teacher retries, and nothing ever
// explains why.

import {
  MIN_RESEND_INTERVAL_MS,
  MAX_RESENDS_PER_INVITE,
} from './limits';
import type { ClassInviteRow } from './types';

export function resendBlockedReason(
  invite: ClassInviteRow,
  now: number = Date.now()
): string | null {
  if (invite.status === 'joined') return 'They have already joined';
  if (invite.status === 'revoked') return 'That invitation was withdrawn';

  if (invite.send_count > MAX_RESENDS_PER_INVITE) {
    return `Already reminded ${MAX_RESENDS_PER_INVITE} times — try a different address`;
  }

  if (invite.last_sent_at) {
    const next = Date.parse(invite.last_sent_at) + MIN_RESEND_INTERVAL_MS;
    if (next > now) {
      const hours = Math.max(1, Math.ceil((next - now) / 3_600_000));
      return `Reminded recently — you can remind again in about ${hours} hour${hours === 1 ? '' : 's'}`;
    }
  }

  return null;
}
