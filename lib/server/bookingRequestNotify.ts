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
import { renderEmail, type RenderedEmail } from '@/lib/email/design';
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
    /** The plain-text alternative, when the body came from the design system. */
    text?: string;
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

  const result = await sendEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
  });
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

/** Absolute URL for an email link. Exported — the other notifiers need it too. */
export function appUrl(path: string): string {
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
  fallback: RenderedEmail,
  vars: Record<string, string>
): Promise<{ subject: string; html: string; text?: string }> {
  try {
    const { data } = await admin
      .from('email_templates')
      .select('subject, html_content')
      .eq('name', name)
      .maybeSingle();

    if (data?.subject && data?.html_content) {
      // An admin override has no text part of its own — the stored row is HTML
      // only. Better none than the fallback's, which would describe a different
      // email from the one being sent.
      return { subject: fill(data.subject, vars), html: fill(data.html_content, vars) };
    }
  } catch {
    // Table missing or unreadable — the fallback still sends.
  }
  return {
    subject: fill(fallback.subject, vars),
    html: fill(fallback.html, vars),
    text: fill(fallback.text, vars),
  };
}

/**
 * The email bodies below are built with lib/email/design.
 *
 * They used to use a local `shell()` — one bare div with a max-width and no
 * header, footer or branding of any kind — and a local `button()` with its own
 * green and radius. These are the parent approval flow, which is the most
 * consequential mail the platform sends to someone who may never have seen it
 * before: a request to approve a payment for their child. Looking like it came
 * from the same product as everything else is not cosmetic there.
 *
 * `{{placeholders}}` survive rendering — escapeHtml does not touch braces, and
 * `fill()` matches `{{word}}`, which nothing in the generated chrome contains.
 */

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
  // at a stated time — travel together on every surface, email included. It is
  // a warning-toned notice for the same reason.
  const seatWarning = params.closesAtLabel
    ? `Another student can take the last place while this sits here. The request closes ${params.closesAtLabel}, two hours before the class starts.`
    : 'Another student can take the last place while this sits here.';

  // Family 05. An approval request is not itself a confirmation, but it is a
  // booking notice about a specific class at a specific time, and it is the
  // email that leads to the booking — so it carries the booking shape, in the
  // warning tone, because nothing is held yet and the window closes.
  const fallback = renderEmail({
    family: 'booking-confirmation',
    subject: `{{childName}} needs your approval to join ${params.subjectLabel}`,
    heading: '{{childName}} needs your approval',
    intro: 'Hi {{firstName}}, a class is waiting on you.',
    eyebrow: 'Approval needed',
    tone: 'warning',
    badge: '!',
    blocks: [
      {
        kind: 'paragraph',
        text: '{{childName}} has asked to join {{subject}} with {{tutorName}}, {{when}}.',
      },
      {
        kind: 'details',
        tone: 'neutral',
        rows: [
          { label: 'Class', value: '{{subject}}', strong: true },
          { label: 'Tutor', value: '{{tutorName}}' },
          { label: 'When', value: '{{when}}' },
          { label: 'Price as listed when asked', value: '{{price}}', strong: true },
        ],
      },
      { kind: 'notice', tone: 'warning', title: 'This spot is not reserved', body: seatWarning },
      {
        kind: 'paragraph',
        text: isFree
          ? 'This class is free, so no payment is involved — you are approving the enrolment itself.'
          : 'You will finish on Stripe\u2019s secure payment page. iTutor never sees your card details.',
      },
    ],
    cta: { label: 'Review this request', href: '{{approvalsUrl}}' },
    closing: 'For your security, approving happens on iTutor and never from this email.',
  });

  const { subject, html, text } = await resolveTemplate(
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
    text,
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

  // Family 09. Nothing was paid, so there is no refund to report — but this is
  // the email that says a thing you asked for is not happening, which is the
  // shape it shares with a cancellation.
  const fallback = renderEmail({
    family: 'refund-cancellation',
    subject: `Your request for ${params.subjectLabel} was declined`,
    heading: 'Your request was declined',
    intro: 'Hi {{firstName}},',
    eyebrow: 'Request declined',
    blocks: [
      { kind: 'paragraph', text: '{{parentName}} declined your request to join {{subject}}.' },
      escaped
        ? { kind: 'notice' as const, tone: 'neutral' as const, title: 'What they said', body: escaped }
        : { kind: 'paragraph' as const, text: 'No reason was given.' },
      {
        kind: 'paragraph',
        text: 'There are other classes in the same subject, and asking again after a conversation is completely normal.',
      },
    ],
    cta: { label: 'Find another class', href: appUrl('/student/explore') },
  });

  const { subject, html, text } = await resolveTemplate(
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
    text,
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

  const fallback = renderEmail({
    family: 'booking-confirmation',
    subject: `You are enrolled in ${params.subjectLabel}`,
    heading: "You're enrolled",
    intro: 'Hi {{firstName}}, your place is confirmed.',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Class', value: '{{subject}}', strong: true },
          { label: 'Tutor', value: '{{tutorName}}' },
          { label: 'When', value: '{{when}}' },
        ],
      },
      {
        kind: 'paragraph',
        text: 'We will remind you before it starts. Everything about the class lives on your classes page.',
      },
    ],
    cta: { label: 'View your classes', href: appUrl('/student/classes') },
  });

  const { subject, html, text } = await resolveTemplate(
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
    text,
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

  const fallback = renderEmail({
    family: 'refund-cancellation',
    subject: `Refunded — ${params.subjectLabel} filled during checkout`,
    heading: 'The class filled, and you have been refunded',
    intro: 'Hi {{firstName}},',
    eyebrow: 'Refund issued',
    blocks: [
      {
        kind: 'paragraph',
        text: '{{subject}} filled before your payment finished, so {{childName}} could not be enrolled.',
      },
      {
        kind: 'details',
        rows: [
          { label: 'Class', value: '{{subject}}' },
          { label: 'Refund', value: '{{amount}}', strong: true },
          { label: 'Usually lands within', value: 'Five working days' },
        ],
      },
      {
        kind: 'notice',
        title: 'There is nothing for you to do',
        body: 'The refund is automatic and goes back to the card you paid with.',
      },
    ],
    cta: { label: 'Find another class', href: appUrl('/parent/dashboard') },
  });

  const { subject, html, text } = await resolveTemplate(
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
    text,
    emailType: TEMPLATE_SEAT_UNAVAILABLE_REFUNDED,
  });
}
