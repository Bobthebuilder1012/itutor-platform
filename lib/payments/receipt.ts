// =====================================================
// PAYMENT RECEIPT — shared data + rendering
// =====================================================
// Single source of truth for receipt content, used by BOTH:
//   * the emailed receipt sent from the Stripe webhook
//   * GET /api/payments/stripe/[paymentId]/receipt (print-to-PDF)
//
// Deliberately one module: the fields and the markup are defined once,
// so the emailed copy and the downloadable copy cannot drift apart.
// If you add a line to the receipt, both get it.
//
// buildReceiptData() re-reads the payment by id rather than taking
// pre-loaded objects. That's one extra query in the webhook, traded for
// a guarantee that the email and the PDF are rendered from identical
// data — which matters more than the query, since these are the numbers
// a customer keeps.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';

type AdminClient = SupabaseClient<any, 'public', 'public', any, any>;

const BRAND_GREEN = '#199356';

export interface ReceiptData {
  paymentId: string;
  /** Stripe PaymentIntent id — what the customer quotes in a dispute. */
  transactionId: string;
  paidAt: string | null;
  currency: string;
  /** Tutor's rate for the session, before the processing fee. */
  amount: number;
  processingFee: number;
  total: number;
  studentName: string;
  payerName: string;
  payerEmail: string | null;
  /** True when a parent paid for a child (billing_mode='parent_required'). */
  payerIsNotStudent: boolean;
  tutorName: string;
  subject: string;
  sessionStartAt: string | null;
  durationMinutes: number | null;
  bookingId: string | null;
}

/**
 * Assembles receipt data for a payment. Returns null if the payment
 * doesn't exist or has no booking attached (e.g. an orphaned
 * slot-conflict refund row), in which case there is nothing to receipt.
 */
export async function buildReceiptData(
  admin: AdminClient,
  paymentId: string
): Promise<ReceiptData | null> {
  const { data: payment, error } = await admin
    .from('payments')
    .select(
      'id, booking_id, payer_id, amount_ttd, charged_processing_fee_ttd, paid_at, stripe_payment_intent_id, provider_reference, status'
    )
    .eq('id', paymentId)
    .maybeSingle();

  if (error || !payment || !payment.booking_id) return null;

  const { data: booking } = await admin
    .from('bookings')
    .select(
      'id, student_id, tutor_id, subject_id, duration_minutes, price_ttd, currency, requested_start_at, confirmed_start_at'
    )
    .eq('id', payment.booking_id)
    .maybeSingle();

  if (!booking) return null;

  const ids = Array.from(
    new Set([booking.student_id, booking.tutor_id, payment.payer_id].filter(Boolean))
  );

  const [{ data: people }, { data: subject }] = await Promise.all([
    admin.from('profiles').select('id, full_name, display_name, email').in('id', ids),
    admin.from('subjects').select('name, label').eq('id', booking.subject_id).maybeSingle(),
  ]);

  const find = (id: string | null) =>
    (people ?? []).find((p: any) => p.id === id) as
      | { full_name?: string; display_name?: string; email?: string }
      | undefined;

  const student = find(booking.student_id);
  const tutor = find(booking.tutor_id);
  const payer = find(payment.payer_id);

  const total = Number(payment.amount_ttd ?? 0);
  // Prefer the fee we actually charged (recorded at initiate time). Falling
  // back to total - price keeps older rows renderable rather than showing 0.
  const processingFee =
    payment.charged_processing_fee_ttd != null
      ? Number(payment.charged_processing_fee_ttd)
      : Math.max(0, Math.round((total - Number(booking.price_ttd ?? 0)) * 100) / 100);

  return {
    paymentId: payment.id,
    transactionId:
      payment.stripe_payment_intent_id || payment.provider_reference || payment.id,
    paidAt: payment.paid_at ?? null,
    currency: booking.currency || 'TTD',
    amount: Number(booking.price_ttd ?? 0),
    processingFee,
    total,
    studentName: student?.display_name || student?.full_name || 'Student',
    payerName: payer?.display_name || payer?.full_name || 'Payer',
    payerEmail: payer?.email ?? null,
    payerIsNotStudent: payment.payer_id !== booking.student_id,
    tutorName: tutor?.display_name || tutor?.full_name || 'Tutor',
    subject: subject?.label || subject?.name || 'Tutoring session',
    sessionStartAt: booking.confirmed_start_at || booking.requested_start_at || null,
    durationMinutes: booking.duration_minutes ?? null,
    bookingId: booking.id,
  };
}

function fmtMoney(n: number, currency: string) {
  return `$${n.toFixed(2)} ${currency}`;
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Port_of_Spain',
    timeZoneName: 'short',
  });
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Port_of_Spain',
  });
}

/** Escapes user-supplied values before they land in the HTML. */
function esc(s: string | null | undefined) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function receiptSubject(d: ReceiptData) {
  return `Your iTutor receipt — ${d.subject} with ${d.tutorName}`;
}

/**
 * Renders the receipt.
 *
 * `forPrint` wraps it as a standalone document with print styles and
 * triggers the browser print dialog, which is how the download button
 * produces a PDF without pulling in a PDF library. Without it, the
 * markup is a self-contained email body (inline styles, table layout —
 * no external CSS, since mail clients drop it).
 */
export function renderReceiptHtml(
  d: ReceiptData,
  opts: { forPrint?: boolean; appUrl?: string } = {}
): string {
  const { forPrint = false, appUrl } = opts;

  const rows: Array<[string, string]> = [
    ['Receipt / Transaction ID', d.transactionId],
    ['Date of payment', fmtDate(d.paidAt)],
    ['Student', d.studentName],
    ...(d.payerIsNotStudent
      ? ([['Paid by', d.payerName]] as Array<[string, string]>)
      : []),
    ['Tutor', d.tutorName],
    ['Subject', d.subject],
    ['Session date & time', fmtDateTime(d.sessionStartAt)],
    ['Duration', d.durationMinutes ? `${d.durationMinutes} minutes` : '—'],
  ];

  const detailRows = rows
    .map(
      ([k, v]) => `
      <tr>
        <td style="padding:8px 0;color:#6b7280;font-size:14px;">${esc(k)}</td>
        <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-align:right;">${esc(v)}</td>
      </tr>`
    )
    .join('');

  const body = `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#ffffff;color:#111827;max-width:560px;margin:0 auto;padding:24px;">
    <div style="border-bottom:3px solid ${BRAND_GREEN};padding-bottom:16px;margin-bottom:24px;">
      <div style="font-size:22px;font-weight:800;color:${BRAND_GREEN};">iTutor</div>
      <div style="font-size:13px;color:#6b7280;margin-top:2px;">Payment receipt</div>
    </div>

    <p style="font-size:15px;line-height:1.6;margin:0 0 20px;">
      Hi ${esc(d.payerName)}, thanks for your payment. Your session is confirmed.
    </p>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      ${detailRows}
    </table>

    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;margin-top:16px;">
      <tr>
        <td style="padding:10px 0 4px;color:#6b7280;font-size:14px;">Session price</td>
        <td style="padding:10px 0 4px;color:#111827;font-size:14px;text-align:right;">${fmtMoney(d.amount, d.currency)}</td>
      </tr>
      <tr>
        <td style="padding:4px 0;color:#6b7280;font-size:14px;">Processing fee</td>
        <td style="padding:4px 0;color:#111827;font-size:14px;text-align:right;">${fmtMoney(d.processingFee, d.currency)}</td>
      </tr>
      <tr>
        <td style="padding:12px 0 0;border-top:1px solid #e5e7eb;font-size:17px;font-weight:800;">Total charged</td>
        <td style="padding:12px 0 0;border-top:1px solid #e5e7eb;font-size:17px;font-weight:800;text-align:right;color:${BRAND_GREEN};">${fmtMoney(d.total, d.currency)}</td>
      </tr>
    </table>

    ${
      appUrl
        ? `<div style="margin-top:28px;">
             <a href="${esc(appUrl)}/student/bookings"
                style="display:inline-block;background:${BRAND_GREEN};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px;">
               View my bookings
             </a>
           </div>`
        : ''
    }

    <p style="font-size:12px;color:#9ca3af;line-height:1.6;margin:28px 0 0;border-top:1px solid #e5e7eb;padding-top:16px;">
      Keep this receipt for your records. Quote the transaction ID above in any
      billing query. Payments are processed securely by Stripe.<br />
      iTutor · Trinidad &amp; Tobago
    </p>
  </div>`;

  if (!forPrint) return body;

  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>iTutor receipt ${esc(d.transactionId)}</title>
<style>
  @media print {
    .no-print { display: none !important; }
    @page { margin: 16mm; }
  }
  body { margin: 0; background: #f9fafb; }
</style>
</head><body>
  <div class="no-print" style="max-width:560px;margin:16px auto 0;padding:0 24px;font-family:system-ui,sans-serif;">
    <button onclick="window.print()"
      style="background:${BRAND_GREEN};color:#fff;border:0;padding:10px 18px;border-radius:10px;font-weight:700;cursor:pointer;">
      Save as PDF / Print
    </button>
  </div>
  ${body}
  <script>
    // Auto-open the print dialog when opened via the download button
    // (?print=1). Without the flag the page is just viewable.
    if (new URLSearchParams(location.search).get('print') === '1') {
      window.addEventListener('load', function () { setTimeout(function(){ window.print(); }, 350); });
    }
  </script>
</body></html>`;
}
