// POST /api/webhooks/identity/[provider]   (didit | veriff)
// Each provider has its own signing secret (DIDIT_WEBHOOK_SECRET, VERIFF_WEBHOOK_SECRET)
// and its own signature scheme, verified inside its provider module. Stripe keeps
// its original path (/api/webhooks/stripe-identity).

import { NextRequest, NextResponse } from 'next/server';
import { handleIdentityWebhook } from '@/lib/identity/webhook';
import { isProviderName } from '@/lib/identity/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest, { params }: { params: { provider: string } }) {
  if (!isProviderName(params.provider) || params.provider === 'stripe') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return handleIdentityWebhook(params.provider, request);
}

export async function GET(_req: NextRequest, { params }: { params: { provider: string } }) {
  if (!isProviderName(params.provider) || params.provider === 'stripe') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return NextResponse.json({ status: 'ok', service: `itutor-identity-webhook-${params.provider}` });
}
