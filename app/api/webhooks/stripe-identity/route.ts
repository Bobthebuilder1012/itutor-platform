// =====================================================
// STRIPE IDENTITY WEBHOOK
// =====================================================
// POST /api/webhooks/stripe-identity
//
// The original Stripe endpoint, kept at its path so it does not have to be
// re-registered. All the logic is the shared provider-agnostic handler
// (lib/identity/webhook.ts); Stripe's part (signature, event types, mapping to
// neutral outcomes) is lib/identity/providers/stripe.ts.
//
// Its own signing secret (STRIPE_IDENTITY_WEBHOOK_SECRET), deliberately NOT part
// of the payment webhook, so a change here cannot affect payments.

import { NextRequest, NextResponse } from 'next/server';
import { handleIdentityWebhook } from '@/lib/identity/webhook';

export const dynamic = 'force-dynamic';
// MUST be nodejs: signature verification needs the raw body bytes and Node crypto.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  return handleIdentityWebhook('stripe', request);
}

export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'itutor-stripe-identity-webhook' });
}
