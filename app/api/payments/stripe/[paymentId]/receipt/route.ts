// =====================================================
// DOWNLOADABLE RECEIPT
// =====================================================
// GET /api/payments/stripe/[paymentId]/receipt[?print=1]
//
// Returns a print-styled standalone HTML receipt. The confirmation
// page's download button opens it with ?print=1, which auto-opens the
// browser print dialog so the user can "Save as PDF" — no PDF library
// needed, and the markup is the SAME renderer used for the emailed
// receipt (lib/payments/receipt.ts), so the two cannot drift.
//
// Generated on demand from the payment/booking rows; nothing is stored.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { buildReceiptData, renderReceiptHtml } from '@/lib/payments/receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paymentId: string }> }
) {
  try {
    const { paymentId } = await params;

    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Authorization gate: read the payment through the USER's client so RLS
    // decides visibility. The policies on `payments` already cover the payer,
    // the student, a linked parent, and the tutor — so if a row comes back,
    // this caller is entitled to the receipt. (Same reasoning as the status
    // route: do NOT re-check payer_id here, that breaks parent-paid bookings.)
    const isIntentId = paymentId.startsWith('pi_');
    const gate = userClient.from('payments').select('id, status');
    const { data: visible } = await (isIntentId
      ? gate.eq('stripe_payment_intent_id', paymentId)
      : gate.eq('id', paymentId)
    ).maybeSingle();

    if (!visible) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    if (visible.status !== 'succeeded' && visible.status !== 'partially_refunded') {
      return NextResponse.json(
        { error: 'No receipt available — this payment has not completed.' },
        { status: 409 }
      );
    }

    // Build with the service client: the receipt joins tutor and payer
    // profiles, which the requesting user may not be able to read directly.
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const data = await buildReceiptData(admin, visible.id);
    if (!data) {
      return NextResponse.json({ error: 'Receipt not available' }, { status: 404 });
    }

    const html = renderReceiptHtml(data, {
      forPrint: true,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        // Never cache: receipts are per-user and authorization-gated.
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (err) {
    console.error('[stripe/receipt] Unhandled error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
