import { readFileSync } from 'fs';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeDb } from '../helpers/fakeDb';

const h = vi.hoisted(() => ({ service: null as any }));

// A stand-in for the Stripe SDK's verifier: the signature "good" passes, and the
// signing secret is checked so a wrong secret fails like the real thing.
vi.mock('@/lib/payments/stripeClient', () => ({
  getStripeClient: () => ({
    webhooks: {
      constructEvent: (body: string, signature: string, secret: string) => {
        if (signature !== 'good' || secret !== 'whsec_identity') throw new Error('bad signature');
        return JSON.parse(body);
      },
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ getServiceClient: () => h.service }));

import { GET, POST } from '@/app/api/webhooks/stripe-identity/route';

function event(over: Record<string, any> = {}, sessionOver: Record<string, any> = {}) {
  return {
    id: 'evt_1',
    type: 'identity.verification_session.verified',
    livemode: false,
    data: {
      object: {
        id: 'vs_current',
        status: 'verified',
        last_error: null,
        metadata: { tutor_id: 'tutor-A' },
        client_secret: 'vs_secret_DO_NOT_STORE',
        url: 'https://verify.stripe.com/start/secret-link',
        ...sessionOver,
      },
    },
    ...over,
  };
}

function post(body: any, signature = 'good') {
  return POST(
    new NextRequest('http://localhost/api/webhooks/stripe-identity', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'stripe-signature': signature },
    })
  );
}

function seed() {
  h.service = makeFakeDb({
    tutor_verification_v2: [
      {
        tutor_id: 'tutor-A', status: 'IN_PROGRESS', identity_status: 'pending', identity_error_code: null,
        stripe_identity_session_id: 'vs_current', identity_attempts: 1,
      },
    ],
    identity_webhook_events: [],
  });
}
const row = () => h.service.tables.tutor_verification_v2[0];
const events = () => h.service.tables.identity_webhook_events;

beforeEach(() => {
  process.env.STRIPE_IDENTITY_WEBHOOK_SECRET = 'whsec_identity';
  process.env.VERIFICATION_V2_ENABLED = 'true';
  seed();
});

describe('POST /api/webhooks/stripe-identity', () => {
  it('500 when its signing secret is not configured', async () => {
    delete process.env.STRIPE_IDENTITY_WEBHOOK_SECRET;
    expect((await post(event())).status).toBe(500);
    expect(h.service.calls).toHaveLength(0);
  });

  it('400 on a bad signature, before anything touches the database', async () => {
    const res = await post(event(), 'forged');
    expect(res.status).toBe(400);
    expect(h.service.calls).toHaveLength(0);
    expect(row().identity_status).toBe('pending');
  });

  it('400 when the signature header is missing', async () => {
    const res = await POST(
      new NextRequest('http://localhost/x', { method: 'POST', body: JSON.stringify(event()) })
    );
    expect(res.status).toBe(400);
  });

  it('a verified event updates the teacher and is recorded as processed', async () => {
    const res = await post(event());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true, status: 'applied' });
    expect(row().identity_status).toBe('verified');
    expect(row().identity_verified_at).toBeTruthy();
    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({ event_id: 'evt_1', processing_status: 'processed', session_id: 'vs_current' });
  });

  it('a requires_input event becomes a neutral retryable_failure and keeps the raw code separately', async () => {
    const res = await post(
      event(
        { id: 'evt_2', type: 'identity.verification_session.requires_input' },
        { status: 'requires_input', last_error: { code: 'document_expired', reason: 'expired' } }
      )
    );
    expect(res.status).toBe(200);
    expect(row()).toMatchObject({
      identity_status: 'retryable_failure',
      identity_error_code: 'document_expired', // the neutral reason
      identity_provider_code: 'document_expired', // Stripe's own code, for coverage testing
    });
  });

  it('is idempotent: a replayed event is a duplicate and changes nothing', async () => {
    await post(event());
    row().identity_status = 'requires_input'; // would be overwritten if it re-applied
    const res = await post(event());
    expect(await res.json()).toMatchObject({ status: 'duplicate' });
    expect(row().identity_status).toBe('requires_input');
    expect(events()).toHaveLength(1);
  });

  it('ignores an event for a session that was replaced by a newer attempt', async () => {
    row().stripe_identity_session_id = 'vs_newer';
    const res = await post(event());
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(row().identity_status).toBe('pending');
    expect(events()[0].processing_status).toBe('skipped');
  });

  it('never downgrades a passed check on a late requires_input event', async () => {
    row().identity_status = 'verified';
    const res = await post(
      event(
        { id: 'evt_3', type: 'identity.verification_session.requires_input' },
        { status: 'requires_input', last_error: { code: 'selfie_face_mismatch' } }
      )
    );
    expect(res.status).toBe(200);
    expect(row().identity_status).toBe('verified');
  });

  it('stores no client secret, URL or payload anywhere', async () => {
    await post(event());
    const everything = JSON.stringify(h.service.tables);
    expect(everything).not.toContain('vs_secret_DO_NOT_STORE');
    expect(everything).not.toContain('verify.stripe.com');
    expect(Object.keys(events()[0]).sort()).toEqual(
      ['attempts', 'error_message', 'event_id', 'event_type', 'livemode', 'processed_at', 'processing_status', 'provider', 'session_id'].sort()
    );
  });

  it('answers 500 (so Stripe retries) when the database fails, and does not mark it processed', async () => {
    h.service.failOn.update = true;
    const res = await post(event());
    expect(res.status).toBe(500);
    expect(events().find((e: any) => e.processing_status === 'processed')).toBeUndefined();
    expect(events()[0]).toMatchObject({ processing_status: 'failed', attempts: 1 });
  });

  it('abandons an event after too many failed deliveries', async () => {
    events().push({ event_id: 'evt_1', processing_status: 'failed', attempts: 5 });
    const res = await post(event());
    expect(await res.json()).toMatchObject({ status: 'abandoned' });
    expect(row().identity_status).toBe('pending');
  });

  it('acknowledges and ignores unrelated event types without touching the database', async () => {
    const res = await post(event({ type: 'payment_intent.succeeded' }));
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(h.service.calls).toHaveLength(0);
  });

  it('does nothing and touches no database when the flag is off', async () => {
    process.env.VERIFICATION_V2_ENABLED = 'false';
    const res = await post(event());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ignored' });
    expect(h.service.calls).toHaveLength(0);
    expect(row().identity_status).toBe('pending');
  });

  it('GET is a health check', async () => {
    expect((await GET()).status).toBe(200);
  });
});

describe('the payment webhook is separate and untouched', () => {
  it('mentions neither identity events nor the identity module', () => {
    const src = readFileSync(
      path.resolve(__dirname, '../../app/api/payments/stripe/webhook/route.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/identity/i);
    expect(src).not.toMatch(/verificationV2/);
  });
});
