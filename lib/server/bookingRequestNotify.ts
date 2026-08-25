// Notifying the two people a booking request concerns — handover §4.3.
//
// Two channels, and only two: email through lib/services/emailService, and
// in-app through the existing notifications table (which the bell icon and the
// Approvals badge already subscribe to in realtime).
//
// THE ONE RULE THAT SHAPES THE EMAIL
// §4.3: "Approve and Decline buttons link to the approval page; they never act
// from the email. Acting from an email link would let anyone with inbox access
// commit a payment." So every button here is a plain link to /parent/approvals.
// There is no tokenised one-click approve, and there must not be one — a
// forwarded email, a shared family tablet or a synced inbox on a lost phone
// would each become a way to spend someone else's money.
//
// Copy is looked up from the admin-editable email_templates table by name and
// only falls back to the built-in body when no record exists, per §4.3's
// "register admin-editable template records; do not hardcode strings". The
// fallback means the feature works before anyone has written a record, instead
// of silently sending nothing.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, logEmailSend } from '@/lib/services/emailService';
import { shouldNotifyForType } from '@/lib/server/notificationPreferences';

/**
 * One gate for every email in this module — §10.6.
 *
 * Only push and email are suppressible; the in-app row is always written, since
 * the design's own wording is "everything stays visible in this list either
 * way". A parent who muted approval outcomes should stop being emailed, not lose
 * the record of what happened.
 *
 * Skips are logged as 'skipped' rather than not logged at all, so a parent
 * asking "why didn't I get that" has an answer in email_send_logs.
 */
export async function sendIfAllowed(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: string;
    childId?: string | null;
    to: string;
    subject: string;
    html: string;
    emailType: string;
  }
): Promise<void> {
  const allowed = await shouldNotifyForType(admin, {
    userId: params.userId,
    type: params.type,
    channel: 'email',
    childId: params.childId ?? null,
  });

  if (!allowed) {
    await logEmailSend({
      userId: params.userId,
      emailType: params.emailType,
      recipientEmail: params.to,
      subject: params.subject,
      status: 'failed',
      errorMessage: 'skipped: muted by notification preferences',
    });
    return;
  }

  const result = await sendEmail({ to: params.to, subject: params.subject, html: params.html });
  await logEmailSend({
    userId: params.userId,
    emailType: params.emailType,
    recipientEmail: params.to,
    subject: params.subject,
    status: result.success ? 'success' : 'failed',
    errorMessage: result.error,
  });
}

export const TEMPLATE_PARENT_APPROVAL_REQUEST = 'parent_approval_request';
export const TEMPLATE_STUDENT_REQUEST_DECLINED = 'student_request_declined';
export const TEMPLATE_STUDENT_REQUEST_APPROVED = 'student_request_approved';
export const TEMPLATE_SEAT_UNAVAILABLE_REFUNDED = 'seat_unavailable_refunded';

function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '');
  return `${base}${path}`;
}

export function money(ttd: number): string {
  return `$${Number(ttd).toLocaleString('en-TT', { minimumFractionDigits: 0 })} TTD`;
}

/** Substitutes {{placeholders}}. Unknown keys are left alone, never blanked. */
function fill(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole
  );
}

async function resolveTemplate(
  admin: SupabaseClient,
  name: string,
  fallback: { subject: string; html: string },
  vars: Record<string, string>
): Promise<{ subject: string; html: string }> {
  try {
    const { data } = await admin
      .from('email_templates')
      .select('subject, html_content')
      .eq('name', name)
      .maybeSingle();

    if (data?.subject && data?.html_content) {
      return { subject: fill(data.subject, vars), html: fill(data.html_content, vars) };
    }
  } catch {
    // Table missing or unreadable — the fallback still sends.
  }
  return { subject: fill(fallback.subject, vars), html: fill(fallback.html, vars) };
}

function shell(bodyHtml: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6">${bodyHtml}</div>`;
}

function button(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;background:#199356;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
}

// ---------------------------------------------------------------------------
// In-app
// ---------------------------------------------------------------------------

export async function notifyInApp(
  admin: SupabaseClient,
  params: {
    userId: string;
    type: string;
    title: string;
    message: string;
    link?: string;
    bookingId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await admin.from('notifications').insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      link: params.link ?? null,
      related_booking_id: params.bookingId ?? null,
      is_read: false,
      metadata: params.metadata ?? null,
    });
  } catch (e) {
    // A notification must never fail the transition that produced it.
    console.error('[bookingRequestNotify] in-app insert failed:', e);
  }
}

// ---------------------------------------------------------------------------
// §4.3 — the parent is asked to decide
// ---------------------------------------------------------------------------

export async function notifyParentOfRequest(
  admin: SupabaseClient,
  params: {
    parentId: string;
    parentEmail: string | null;
    parentName: string | null;
    /** Needed so a per-child mute can apply (§10.6). */
    childId: string;
    childName: string;
    tutorName: string;
    subjectLabel: string;
    whenLabel: string;
    priceTtd: number;
    closesAtLabel: string | null;
    bookingId: string;
  }
): Promise<void> {
  const isFree = params.priceTtd <= 0;
  const approvalsUrl = appUrl('/parent/approvals');

  await notifyInApp(admin, {
    userId: params.parentId,
    type: 'parent_approval_request',
    title: `${params.childName} asked to join a class with ${params.tutorName}`,
    message: [
      params.subjectLabel,
      params.whenLabel,
      isFree ? 'Free class' : money(params.priceTtd),
      params.closesAtLabel ? `Closes ${params.closesAtLabel}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
    link: '/parent/approvals',
    bookingId: params.bookingId,
  });

  if (!params.parentEmail) return;

  const vars: Record<string, string> = {
    firstName: params.parentName?.split(' ')[0] ?? 'there',
    childName: params.childName,
    tutorName: params.tutorName,
    subject: params.subjectLabel,
    when: params.whenLabel,
    price: isFree ? 'Free' : money(params.priceTtd),
    closesAt: params.closesAtLabel ?? '',
    approvalsUrl,
  };

  // The seat warning is not decoration. A parent who assumes the place is held
  // and loses it reads that as a bug, so both halves — not reserved, and closes
  // at a stated time — travel together on every surface, email included.
  const seatWarning = params.closesAtLabel
    ? `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;color:#78350f;margin:18px 0">
         <strong>This spot is not reserved.</strong> Another student can take the last place while this sits here.
         The request closes ${params.closesAtLabel}, two hours before the class starts.
       </p>`
    : `<p style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:12px 14px;color:#78350f;margin:18px 0">
         <strong>This spot is not reserved.</strong> Another student can take the last place while this sits here.
       </p>`;

  const fallback = {
    subject: `{{childName}} needs your approval to join ${params.subjectLabel}`,
    html: shell(`
      <p>Hi {{firstName}},</p>
      <p><strong>{{childName}}</strong> has asked to join <strong>{{subject}}</strong>
         with {{tutorName}}, {{when}}.</p>
      <table style="width:100%;border-collapse:collapse;background:#f9fafb;border-radius:10px;margin:16px 0">
        <tr><td style="padding:10px 14px;color:#6b7280">Class</td><td style="padding:10px 14px;text-align:right"><strong>{{subject}}</strong></td></tr>
        <tr><td style="padding:10px 14px;color:#6b7280">Tutor</td><td style="padding:10px 14px;text-align:right">{{tutorName}}</td></tr>
        <tr><td style="padding:10px 14px;color:#6b7280">When</td><td style="padding:10px 14px;text-align:right">{{when}}</td></tr>
        <tr><td style="padding:10px 14px;color:#6b7280">Price as listed when asked</td><td style="padding:10px 14px;text-align:right"><strong>{{price}}</strong></td></tr>
      </table>
      ${seatWarning}
      <p>${button('Review this request', '{{approvalsUrl}}')}</p>
      <p style="color:#6b7280;font-size:13px">
        ${
          isFree
            ? 'This class is free, so no payment is involved — you are approving the enrolment itself.'
            : 'You will finish on Stripe&rsquo;s secure payment page. iTutor never sees your card details.'
        }
      </p>
      <p style="color:#9ca3af;font-size:12px">
        For your security, approving happens on iTutor and never from this email.
      </p>
    `),
  };

  const { subject, html } = await resolveTemplate(
    admin,
    TEMPLATE_PARENT_APPROVAL_REQUEST,
    fallback,
    vars
  );

  await sendIfAllowed(admin, {
    userId: params.parentId,
    type: 'parent_approval_request',
    // Named so a per-child mute applies: "two children means twice the
    // notifications" is the reason that axis exists.
    childId: params.childId,
    to: params.parentEmail,
    subject,
    html,
    emailType: TEMPLATE_PARENT_APPROVAL_REQUEST,
  });
}

// ---------------------------------------------------------------------------
// Outcome back to the student
// ---------------------------------------------------------------------------

/**
 * Decline. Decision: the reason is sent to the student verbatim — so it is
 * escaped, not interpolated raw, and never summarised or softened.
 */
export async function notifyStudentOfDecline(
  admin: SupabaseClient,
  params: {
    studentId: string;
    studentEmail: string | null;
    studentName: string | null;
    parentName: string;
    subjectLabel: string;
    reason: string | null;
    bookingId: string;
  }
): Promise<void> {
  const reason = params.reason?.trim() || null;

  await notifyInApp(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    title: `${params.parentName} declined your request`,
    message: reason
      ? `${params.subjectLabel} — "${reason}"`
      : `${params.subjectLabel}. No reason was given.`,
    link: '/student/classes',
    bookingId: params.bookingId,
  });

  if (!params.studentEmail) return;

  const escaped = reason
    ? reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    : null;

  const fallback = {
    subject: `Your request for ${params.subjectLabel} was declined`,
    html: shell(`
      <p>Hi {{firstName}},</p>
      <p>{{parentName}} declined your request to join <strong>{{subject}}</strong>.</p>
      ${
        escaped
          ? `<p style="background:#f9fafb;border-left:3px solid #d1d5db;padding:12px 14px;margin:16px 0">${escaped}</p>`
          : '<p style="color:#6b7280">No reason was given.</p>'
      }
      <p>${button('Find another class', appUrl('/student/explore'))}</p>
    `),
  };

  const { subject, html } = await resolveTemplate(
    admin,
    TEMPLATE_STUDENT_REQUEST_DECLINED,
    fallback,
    {
      firstName: params.studentName?.split(' ')[0] ?? 'there',
      parentName: params.parentName,
      subject: params.subjectLabel,
    }
  );

  await sendIfAllowed(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    to: params.studentEmail,
    subject,
    html,
    emailType: TEMPLATE_STUDENT_REQUEST_DECLINED,
  });
}

/**
 * Approval, sent from the webhook — §4.6: "on payment clearing, not on the
 * approve click". Telling a student they are enrolled while the card is still
 * being authorised is how they turn up to a class they have no place in.
 */
export async function notifyStudentOfApproval(
  admin: SupabaseClient,
  params: {
    studentId: string;
    studentEmail: string | null;
    studentName: string | null;
    subjectLabel: string;
    tutorName: string;
    whenLabel: string;
    bookingId: string;
  }
): Promise<void> {
  await notifyInApp(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    title: `You are enrolled in ${params.subjectLabel}`,
    message: `${params.tutorName} · ${params.whenLabel}`,
    link: '/student/classes',
    bookingId: params.bookingId,
  });

  if (!params.studentEmail) return;

  const fallback = {
    subject: `You are enrolled in ${params.subjectLabel}`,
    html: shell(`
      <p>Hi {{firstName}},</p>
      <p>Your place in <strong>{{subject}}</strong> with {{tutorName}} is confirmed, {{when}}.</p>
      <p>${button('View your classes', appUrl('/student/classes'))}</p>
    `),
  };

  const { subject, html } = await resolveTemplate(
    admin,
    TEMPLATE_STUDENT_REQUEST_APPROVED,
    fallback,
    {
      firstName: params.studentName?.split(' ')[0] ?? 'there',
      subject: params.subjectLabel,
      tutorName: params.tutorName,
      when: params.whenLabel,
    }
  );

  await sendIfAllowed(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    to: params.studentEmail,
    subject,
    html,
    emailType: TEMPLATE_STUDENT_REQUEST_APPROVED,
  });
}

/**
 * §4.5: the place went while the parent was paying, and the money is already
 * on its way back. "There is nothing for you to do" is the whole point of the
 * message — this is the one failure the platform caused, so it must not read
 * like a task.
 */
export async function notifySeatUnavailableRefunded(
  admin: SupabaseClient,
  params: {
    parentId: string;
    parentEmail: string | null;
    parentName: string | null;
    studentId: string;
    childName: string;
    subjectLabel: string;
    amountTtd: number;
    bookingId: string;
  }
): Promise<void> {
  const amount = money(params.amountTtd);

  await notifyInApp(admin, {
    userId: params.parentId,
    type: 'seat_unavailable_refunded',
    title: 'The last place went while you were paying',
    message: `${params.subjectLabel} — ${amount} is being refunded automatically.`,
    link: '/parent/approvals',
    bookingId: params.bookingId,
  });

  await notifyInApp(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    title: `${params.subjectLabel} filled before payment finished`,
    message: 'You were not enrolled, and the payment is being refunded.',
    link: '/student/classes',
    bookingId: params.bookingId,
  });

  if (!params.parentEmail) return;

  const fallback = {
    subject: `Refunded — ${params.subjectLabel} filled during checkout`,
    html: shell(`
      <p>Hi {{firstName}},</p>
      <p><strong>{{subject}}</strong> filled before your payment finished, so {{childName}}
         could not be enrolled.</p>
      <p>The {{amount}} is being refunded automatically. It usually lands within five
         working days. <strong>There is nothing for you to do.</strong></p>
      <p>${button('Find another class', appUrl('/parent/dashboard'))}</p>
    `),
  };

  const { subject, html } = await resolveTemplate(
    admin,
    TEMPLATE_SEAT_UNAVAILABLE_REFUNDED,
    fallback,
    {
      firstName: params.parentName?.split(' ')[0] ?? 'there',
      childName: params.childName,
      subject: params.subjectLabel,
      amount,
    }
  );

  await sendIfAllowed(admin, {
    userId: params.parentId,
    type: 'seat_unavailable_refunded',
    childId: params.studentId,
    to: params.parentEmail,
    subject,
    html,
    emailType: TEMPLATE_SEAT_UNAVAILABLE_REFUNDED,
  });
}
