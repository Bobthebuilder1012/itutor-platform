// =====================================================
// SEND PAYMENT RECEIPT EMAIL
// =====================================================
// Triggered by a Postgres trigger (via pg_net) after payments.status
// is updated to 'succeeded'. Sends a receipt email to the payer
// via Resend from receipt@myitutor.com.

import { createClient } from 'npm:@supabase/supabase-js@2.89.0';

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-TT', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Port_of_Spain',
  }).format(new Date(dateStr));
}

function buildReceiptHtml(d: {
  payerName: string;
  payerEmail: string;
  tutorName: string;
  subjectName: string;
  durationMinutes: number;
  sessionDate: string;
  amountTTD: number;
  platformFeeTTD: number;
  tutorPayoutTTD: number;
  platformFeePct: number;
  currency: string;
  transactionId: string;
  paymentDate: string;
  receiptUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:24px 12px;background:#f4f7fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #dce6f2;border-radius:16px;overflow:hidden;">

    <!-- Header -->
    <div style="background:#000000;padding:28px 32px 24px;color:#fff;">
      <img src="https://nfkrfciozjxrodkusrhh.supabase.co/storage/v1/object/public/assets/logo/itutor-logo-light.png" alt="iTutor" style="height:36px;width:auto;display:block;margin-bottom:20px;" />
      <h1 style="margin:0 0 4px;font-size:26px;font-weight:700;">Payment Receipt</h1>
      <p style="margin:0;font-size:13px;color:rgba(255,255,255,0.6);">Transaction ID: ${d.transactionId}</p>
    </div>

    <!-- Body -->
    <div style="padding:28px 32px;">
      <p style="margin:0 0 24px;font-size:15px;color:#475569;">
        Hi ${d.payerName}, your payment was successful. Here&rsquo;s your receipt.
      </p>

      <!-- Session Details -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;">Session Details</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;width:38%;">Subject</td>
            <td style="padding:5px 0;font-size:14px;font-weight:600;color:#0f172a;">${d.subjectName}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Tutor</td>
            <td style="padding:5px 0;font-size:14px;font-weight:600;color:#0f172a;">${d.tutorName}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Duration</td>
            <td style="padding:5px 0;font-size:14px;font-weight:600;color:#0f172a;">${d.durationMinutes} minutes</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Scheduled</td>
            <td style="padding:5px 0;font-size:14px;font-weight:600;color:#0f172a;">${d.sessionDate}</td>
          </tr>
        </table>
      </div>

      <!-- Payment Breakdown -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:20px;">
        <p style="margin:0 0 12px;font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;">Payment Breakdown</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Session Price</td>
            <td style="padding:5px 0;font-size:14px;font-weight:600;color:#0f172a;text-align:right;">$${d.amountTTD.toFixed(2)} ${d.currency}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Platform Fee (${d.platformFeePct}%)</td>
            <td style="padding:5px 0;font-size:13px;color:#475569;text-align:right;">$${d.platformFeeTTD.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding:5px 0;font-size:13px;color:#64748b;">Tutor Receives</td>
            <td style="padding:5px 0;font-size:13px;color:#475569;text-align:right;">$${d.tutorPayoutTTD.toFixed(2)}</td>
          </tr>
          <tr><td colspan="2" style="padding-top:12px;border-top:2px solid #e2e8f0;"></td></tr>
          <tr>
            <td style="padding:8px 0 0;font-size:16px;font-weight:700;color:#0f172a;">Total Paid</td>
            <td style="padding:8px 0 0;font-size:16px;font-weight:700;color:#199356;text-align:right;">$${d.amountTTD.toFixed(2)} ${d.currency}</td>
          </tr>
        </table>
      </div>

      <!-- Paid By -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px;margin-bottom:28px;">
        <p style="margin:0 0 10px;font-size:12px;font-weight:700;color:#64748b;letter-spacing:0.05em;text-transform:uppercase;">Paid By</p>
        <p style="margin:0 0 3px;font-size:14px;font-weight:600;color:#0f172a;">${d.payerName}</p>
        <p style="margin:0 0 3px;font-size:13px;color:#475569;">${d.payerEmail}</p>
        <p style="margin:0;font-size:12px;color:#94a3b8;">${d.paymentDate}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-bottom:24px;">
        <a href="${d.receiptUrl}"
           style="display:inline-block;background:#199356;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-size:15px;font-weight:700;">
          View Receipt
        </a>
      </div>

      <!-- What's next -->
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:18px;">
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#1e40af;">What happens next?</p>
        <p style="margin:0 0 5px;font-size:13px;color:#1d4ed8;">&#10003; Your iTutor will review and confirm your session</p>
        <p style="margin:0 0 5px;font-size:13px;color:#1d4ed8;">&#10003; You&rsquo;ll be notified once it&rsquo;s confirmed</p>
        <p style="margin:0;font-size:13px;color:#1d4ed8;">&#10003; The meeting link will be available before your session</p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">
        &copy; iTutor &mdash; <a href="https://myitutor.com" style="color:#199356;text-decoration:none;">myitutor.com</a><br>
        Questions? <a href="mailto:support@myitutor.com" style="color:#199356;text-decoration:none;">support@myitutor.com</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  const startedAt = Date.now();
  try {
    const SUPABASE_URL = env('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = env('SUPABASE_SERVICE_ROLE_KEY');
    const RESEND_API_KEY = 're_ekFA52Sn_HzPNUmK24YFDuBRCKumPnced';
    const APP_URL = 'https://myitutor.com';

    const body = await req.json().catch(() => ({}));
    const payment_id: string | undefined = body?.payment_id;
    if (!payment_id) {
      return Response.json({ ok: false, error: 'missing payment_id' }, { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: payment, error } = await supabase
      .from('payments')
      .select(`
        id, amount_ttd, currency, provider_reference, status, created_at,
        bookings (
          id, duration_minutes, requested_start_at,
          platform_fee_ttd, tutor_payout_ttd, platform_fee_pct,
          payer:profiles!bookings_payer_id_fkey(full_name, email),
          tutor:profiles!bookings_tutor_id_fkey(full_name, display_name),
          subjects(name, label)
        )
      `)
      .eq('id', payment_id)
      .single();

    if (error || !payment) {
      console.error('[send-payment-receipt] payment not found:', payment_id, error);
      return Response.json({ ok: false, error: 'payment not found' }, { status: 404 });
    }

    const booking = (payment as any).bookings;
    const payer   = booking?.payer;
    const tutor   = booking?.tutor;
    const subject = booking?.subjects;

    if (!payer?.email) {
      return Response.json({ ok: false, error: 'no payer email on record' }, { status: 400 });
    }

    const tutorName   = tutor?.display_name || tutor?.full_name || 'Your Tutor';
    const subjectName = subject?.label || subject?.name || 'Session';

    const html = buildReceiptHtml({
      payerName:      payer.full_name || 'Student',
      payerEmail:     payer.email,
      tutorName,
      subjectName,
      durationMinutes: booking.duration_minutes,
      sessionDate:    formatDate(booking.requested_start_at),
      amountTTD:      payment.amount_ttd,
      platformFeeTTD: booking.platform_fee_ttd,
      tutorPayoutTTD: booking.tutor_payout_ttd,
      platformFeePct: booking.platform_fee_pct,
      currency:       payment.currency || 'TTD',
      transactionId:  payment.provider_reference || payment.id,
      paymentDate:    formatDate(payment.created_at),
      receiptUrl:     `${APP_URL}/payments/success?bookingId=${booking.id}`,
    });

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'iTutor Receipts <receipt@myitutor.com>',
        to:      payer.email,
        subject: `Payment Receipt – ${subjectName} with ${tutorName}`,
        html,
      }),
    });

    if (!resendRes.ok) {
      const errText = await resendRes.text();
      console.error('[send-payment-receipt] Resend error:', errText);
      return Response.json({ ok: false, error: errText }, { status: 500 });
    }

    const resendData = await resendRes.json();
    console.log('[send-payment-receipt] sent to', payer.email, 'id:', resendData.id);
    return Response.json({ ok: true, email_id: resendData.id, durationMs: Date.now() - startedAt });

  } catch (e) {
    console.error('[send-payment-receipt] unhandled error:', e);
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : 'unknown_error', durationMs: Date.now() - startedAt },
      { status: 200 },
    );
  }
});
