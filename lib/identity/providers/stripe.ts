// Stripe Identity behind the provider interface. This is the code that used to
// live in the identity route and the webhook handler, moved here with no change
// in behaviour: same session options, same idempotency key, same signature
// check, same redaction call.
//
// Env: STRIPE_SECRET_KEY (shared with payments, sk_test_ in test mode) and
// STRIPE_IDENTITY_WEBHOOK_SECRET (this endpoint's own signing secret).

import { getStripeClient } from '@/lib/payments/stripeClient';
import { mapStripeSession } from '../mapping';
import {
  WebhookSignatureError,
  type CreatedSession,
  type CreateSessionInput,
  type HeaderReader,
  type IdentityProvider,
  type ProviderOutcome,
  type ProviderWebhookEvent,
  type RedactReason,
  type RedactResult,
} from '../types';

const HANDLED_EVENTS = new Set([
  'identity.verification_session.verified',
  'identity.verification_session.requires_input',
]);

export const stripeProvider: IdentityProvider = {
  name: 'stripe',

  isConfigured: () => !!process.env.STRIPE_SECRET_KEY,
  webhookConfigured: () => !!process.env.STRIPE_IDENTITY_WEBHOOK_SECRET,

  async createSession(input: CreateSessionInput): Promise<CreatedSession> {
    const session = await getStripeClient().identity.verificationSessions.create(
      {
        type: 'document',
        options: {
          document: {
            allowed_types: ['driving_license', 'passport', 'id_card'],
            require_matching_selfie: true,
          },
        },
        // Our tutor id only. No name, email or anything else.
        metadata: { tutor_id: input.tutorId },
        return_url: input.returnUrl,
      },
      // The attempt number makes a repeated request for the same attempt return
      // the same session instead of a second one.
      { idempotencyKey: `verification-v2-identity-${input.tutorId}-attempt-${input.attempt}` }
    );
    if (!session.url) throw new Error('Stripe returned no hosted URL');
    return { sessionRef: session.id, url: session.url };
  },

  async verifyWebhook(rawBody: string, headers: HeaderReader): Promise<ProviderWebhookEvent> {
    const secret = process.env.STRIPE_IDENTITY_WEBHOOK_SECRET ?? '';
    let event;
    try {
      event = getStripeClient().webhooks.constructEvent(rawBody, headers.get('stripe-signature') ?? '', secret);
    } catch (err) {
      throw new WebhookSignatureError((err as Error).message);
    }

    const session = event.data.object as { id?: string; status?: string; last_error?: any; metadata?: Record<string, string> };
    const handled = HANDLED_EVENTS.has(event.type);
    return {
      eventId: event.id,
      sessionRef: session?.id ?? null,
      tutorId: session?.metadata?.tutor_id ?? null,
      ignore: !handled,
      // Stripe signs the payload, so its outcome is authoritative as delivered.
      outcome: handled ? mapStripeSession({ status: session.status ?? '', last_error: session.last_error }) : null,
      livemode: event.livemode,
    };
  },

  async getOutcome(sessionRef: string): Promise<ProviderOutcome> {
    const session = await getStripeClient().identity.verificationSessions.retrieve(sessionRef);
    return { ...mapStripeSession(session), resumeUrl: session.url ?? null };
  },

  async cancelSession(sessionRef: string): Promise<void> {
    await getStripeClient().identity.verificationSessions.cancel(sessionRef).catch(() => undefined);
  },

  async redact(sessionRef: string, _reason: RedactReason): Promise<RedactResult> {
    try {
      await getStripeClient().identity.verificationSessions.redact(sessionRef);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message ?? 'redact failed' };
    }
  },
};
