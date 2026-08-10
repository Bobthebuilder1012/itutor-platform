// =====================================================
// SUBSCRIPTION RECEIPT (downloadable)
// =====================================================
// GET /api/payments/stripe/subscription/[paymentId]/receipt[?print=1]
//
// Print-styled HTML for a paid subscription cycle. Separate from the
// booking receipt route because the money lives in a different table
// (subscription_payments, not payments) — but it renders through the
// same module, so the emailed and downloaded copies can't drift.
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import {
  buildSubscriptionReceiptData,
  renderSubscriptionReceiptHtml,
} from '@/lib/payments/receipt';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
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

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: sp } = await admin
      .from('subscription_payments')
      .select('id, student_id, status, group_id')
      .eq('id', paymentId)
      .maybeSingle();

    if (!sp) {
      return NextResponse.json({ error: 'Receipt not found' }, { status: 404 });
    }

    // The student, or a parent linked to them, may download it.
    let allowed = sp.student_id === user.id;
    if (!allowed) {
      const { data: link } = await admin
        .from('parent_child_links')
        .select('id')
        .eq('parent_id', user.id)
        .eq('child_id', sp.student_id)
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (sp.status !== 'PAID') {
      return NextResponse.json(
        { error: 'No receipt available — this payment has not completed.' },
        { status: 409 }
      );
    }

    const data = await buildSubscriptionReceiptData(admin, sp.id);
    if (!data) {
      return NextResponse.json({ error: 'Receipt not available' }, { status: 404 });
    }

    const body = renderSubscriptionReceiptHtml(data, {
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
    });

    const html = `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>iTutor receipt ${data.transactionId}</title>
<style>
  @media print { .no-print { display:none !important; } @page { margin: 16mm; } }
  body { margin: 0; background: #f9fafb; }
</style>
</head><body>
  <div class="no-print" style="max-width:560px;margin:16px auto 0;padding:0 24px;font-family:system-ui,sans-serif;">
    <button onclick="window.print()" style="background:#199356;color:#fff;border:0;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">
      Save as PDF / Print
    </button>
  </div>
  ${body}
  <script>
    if (new URLSearchParams(location.search).get('print') === '1') {
      window.addEventListener('load', function () { setTimeout(function(){ window.print(); }, 350); });
    }
  </script>
</body></html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store, private',
      },
    });
  } catch (err) {
    console.error('[stripe/subscription-receipt] Unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
