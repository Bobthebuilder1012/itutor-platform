// POST /api/tutor/verification-v2/identity
// Step 2. Creates (or reuses) a Stripe Identity VerificationSession and returns
// Stripe's hosted-flow URL.
//
// WHAT IS STORED: the session id and the result status. Nothing else from the
// check. The session's client_secret is never returned to the browser, stored or
// logged; only `url` goes back, and the teacher opens it as a normal link.
//
// ATTEMPT CAP: 3 sessions per teacher. The idempotency key includes the attempt
// number, so a repeated or concurrent request for the same attempt gets the SAME
// Stripe session back instead of a second one. The attempt counter and the
// session id are then saved in one optimistic write through
// lib/verification/setStatus.ts, so nothing needs rolling back if Stripe fails.

import { NextRequest, NextResponse } from 'next/server';
import { getStripeClient } from '@/lib/payments/stripeClient';
import { mapIdentitySession } from '@/lib/verificationV2/identity';
import { MAX_IDENTITY_ATTEMPTS } from '@/lib/verificationV2/constants';
import { setIdentityStatus, statusErrorResponse } from '@/lib/verification/setStatus';
import {
  blocked,
  guardV2,
  hasConsent,
  isEditable,
  loadRow,
} from '@/lib/verificationV2/server';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const g = await guardV2();
  if (g.error) return g.error;
  const { db, tutorId } = g;

  try {
    const row = await loadRow(db, tutorId);
    if (!hasConsent(row)) return blocked('Please accept the notice first', 409, { code: 'consent_required' });
    if (!isEditable(row)) return blocked('Your submission is locked while it is reviewed', 409, { code: 'locked' });
    if (row!.identity_status === 'verified') return NextResponse.json({ status: 'verified' });
    if (row!.identity_status === 'consent_declined' || row!.identity_status === 'under_supported_age') {
      return blocked('Manual verification is needed', 409, { code: 'manual_verification' });
    }

    const stripe = getStripeClient();

    // Reuse an unfinished session instead of burning an attempt.
    const open = [null, 'pending', 'processing', 'requires_input'];
    if (row!.stripe_identity_session_id && open.includes(row!.identity_status)) {
      try {
        const existing = await stripe.identity.verificationSessions.retrieve(row!.stripe_identity_session_id);
        const mapped = mapIdentitySession(existing);
        if (mapped.status !== row!.identity_status || mapped.errorCode !== row!.identity_error_code) {
          const saved = await setIdentityStatus({
            tutorId,
            to: mapped.status,
            errorCode: mapped.errorCode,
            actor: 'system',
            sessionId: existing.id,
            db,
          });
          if (!saved.ok && saved.code !== 'conflict' && saved.code !== 'stale_session') {
            // A refusal (e.g. a passed check is never downgraded) means the
            // stored value stands; a database fault is returned, not hidden.
            if (saved.code === 'db_error') return statusErrorResponse(saved);
          }
        }
        if (mapped.status === 'verified' || mapped.status === 'processing') {
          return NextResponse.json({ status: mapped.status });
        }
        if (mapped.status === 'consent_declined' || mapped.status === 'under_supported_age') {
          return blocked('Manual verification is needed', 409, { code: 'manual_verification' });
        }
        if (mapped.status === 'pending' && existing.url) {
          return NextResponse.json({ url: existing.url, status: 'pending' });
        }
        // Failed or cancelled: close it out so it cannot be reopened, then retry below.
        if (existing.status === 'requires_input') {
          await stripe.identity.verificationSessions.cancel(existing.id).catch(() => undefined);
        }
      } catch (err) {
        console.warn('[verification-v2/identity] could not reuse session:', (err as Error).message);
      }
    }

    const used = row!.identity_attempts;
    if (used >= MAX_IDENTITY_ATTEMPTS) {
      return blocked('You have used all identity check attempts', 429, { code: 'attempt_limit', manual: true });
    }
    const attempt = used + 1;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;

    let session;
    try {
      session = await stripe.identity.verificationSessions.create(
        {
          type: 'document',
          options: {
            document: {
              allowed_types: ['driving_license', 'passport', 'id_card'],
              require_matching_selfie: true,
            },
          },
          // Our tutor id only. No name, email or anything else.
          metadata: { tutor_id: tutorId },
          return_url: `${appUrl}/tutor/verification-v2?identity=return`,
        },
        { idempotencyKey: `verification-v2-identity-${tutorId}-attempt-${attempt}` }
      );
    } catch (err) {
      console.error('[verification-v2/identity] Stripe create failed:', (err as Error).message);
      return NextResponse.json({ error: 'Could not start the identity check. Please try again.' }, { status: 502 });
    }
    if (!session.url) {
      return NextResponse.json({ error: 'Could not start the identity check. Please try again.' }, { status: 502 });
    }

    // Save the attempt and the session id together, only if nobody else bumped
    // the counter first.
    const started = await setIdentityStatus({
      tutorId,
      to: 'pending',
      errorCode: null,
      actor: 'tutor',
      expectAttempts: used,
      extra: { identity_attempts: attempt, stripe_identity_session_id: session.id },
      db,
    });
    if (!started.ok) {
      if (started.code === 'conflict') {
        // A concurrent identical request saved this same attempt. The idempotency
        // key means it holds the same session, so hand back the same link.
        const fresh = await loadRow(db, tutorId);
        if (fresh?.stripe_identity_session_id === session.id) {
          return NextResponse.json({ url: session.url, status: 'pending' });
        }
        return blocked('Another request is already starting your check. Please wait a moment.', 409, { code: 'in_flight' });
      }
      return statusErrorResponse(started);
    }

    return NextResponse.json({ url: session.url, status: 'pending' });
  } catch (err) {
    console.error('[verification-v2/identity] failed:', (err as Error).message);
    return NextResponse.json({ error: 'Could not start the identity check' }, { status: 500 });
  }
}
