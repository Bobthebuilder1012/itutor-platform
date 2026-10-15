// Applies identity.verification_session.verified / .requires_input to the v2 row.
// Called by app/api/webhooks/stripe-identity/route.ts after that route has
// verified the Stripe signature and de-duplicated the event.
//
// The change goes through lib/verification/setStatus.ts, so:
//   - an event for a session we replaced (an earlier attempt) is ignored,
//   - a passed check is never downgraded by a late or replayed event,
//   - everything is written by the service client.

import type Stripe from 'stripe';
import { mapIdentitySession } from './identity';
import { isRuleRefusal, setIdentityStatus, type Db } from '@/lib/verification/setStatus';

/**
 * 'applied' = the row changed (or already held this result).
 * 'ignored' = nothing to do: no tutor id, an old session, or a refused rule.
 * Throws on a database fault, so the webhook leaves the event retryable.
 */
export async function applyIdentityEvent(
  event: Stripe.Event,
  db?: Db
): Promise<'applied' | 'ignored'> {
  const session = event.data.object as Stripe.Identity.VerificationSession;
  const tutorId = session.metadata?.tutor_id;
  if (!tutorId) return 'ignored';

  const mapped = mapIdentitySession(session);
  const result = await setIdentityStatus({
    tutorId,
    to: mapped.status,
    errorCode: mapped.errorCode,
    actor: 'system',
    sessionId: session.id,
    db,
  });

  if (result.ok) return 'applied';
  if (isRuleRefusal(result) || result.code === 'stale_session' || result.code === 'not_found') {
    return 'ignored';
  }
  // conflict (a concurrent change) and db_error are retried by Stripe.
  throw new Error(result.message);
}
