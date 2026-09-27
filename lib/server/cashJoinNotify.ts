// Emails and in-app notices for cash join requests.
//
// Same rule as classRequestNotify: no email acts. Every button is a link to a
// page on iTutor, so a forwarded email cannot admit anyone to a class.
//
// Notification types are existing ones on purpose — an unlisted
// notifications.type throws, and the insert sits inside a try/catch, so a new
// type without a CHECK migration would fail silently. `join_request` for the
// tutor; `join_request_approved` / `booking_declined` for the student, which
// is what the ordinary join-request approve route already sends.

import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmail } from '@/lib/email/design';
import { appUrl, money, notifyInApp, sendIfAllowed } from '@/lib/server/bookingRequestNotify';

export const TEMPLATE_TUTOR_CASH_REQUEST = 'tutor_cash_join_request';
export const TEMPLATE_STUDENT_CASH_APPROVED = 'student_cash_request_approved';
export const TEMPLATE_STUDENT_CASH_DECLINED = 'student_cash_request_declined';

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const first = (name: string | null | undefined) => (name ?? 'there').split(' ')[0] || 'there';

type Person = { email: string | null; full_name: string | null; display_name: string | null };

async function person(admin: SupabaseClient, id: string): Promise<Person | null> {
  const { data } = await admin
    .from('profiles')
    .select('email, full_name, display_name')
    .eq('id', id)
    .maybeSingle();
  return (data as Person | null) ?? null;
}

export async function notifyTutorOfCashRequest(
  admin: SupabaseClient,
  params: {
    tutorId: string;
    groupId: string;
    className: string;
    studentName: string;
    seatType: 'online' | 'physical';
    priceTtd: number;
    note: string | null;
    requestId: string;
  }
): Promise<void> {
  const link = `/tutor/classes/${params.groupId}?tab=payments&pay=cash`;
  const seat = params.seatType === 'physical' ? 'In person' : 'Online';

  await notifyInApp(admin, {
    userId: params.tutorId,
    type: 'join_request',
    title: `${params.studentName} wants to join ${params.className} paying cash`,
    message: `${seat} · ${money(params.priceTtd)} / month, paid to you directly. Accept or decline.`,
    link,
    metadata: { cashJoinRequestId: params.requestId, groupId: params.groupId },
  });

  const tutor = await person(admin, params.tutorId);
  if (!tutor?.email) return;

  const { subject, html, text } = renderEmail({
    family: 'booking-confirmation',
    subject: `${params.studentName} wants to join ${params.className} — paying cash`,
    heading: 'A student wants to pay you in cash',
    intro: `Hi ${first(tutor.display_name || tutor.full_name)},`,
    eyebrow: 'Cash join request',
    tone: 'warning',
    blocks: [
      {
        kind: 'paragraph',
        text: `${escapeText(params.studentName)} has asked to join ${escapeText(
          params.className
        )} and pay you in cash. They are not in the class until you accept.`,
      },
      {
        kind: 'details',
        tone: 'neutral',
        rows: [
          { label: 'Class', value: escapeText(params.className), strong: true },
          { label: 'Seat', value: seat },
          { label: 'Monthly fee', value: money(params.priceTtd), strong: true },
          ...(params.note ? [{ label: 'Their note', value: escapeText(params.note) }] : []),
        ],
      },
      {
        kind: 'paragraph',
        text: 'Once accepted, you mark each month paid or missed on the class Cash payments tab. iTutor does not collect this money.',
      },
    ],
    cta: { label: 'Review the request', href: appUrl(link) },
    closing: 'Accepting happens on iTutor, never from this email.',
  });

  await sendIfAllowed(admin, {
    userId: params.tutorId,
    type: 'join_request',
    to: tutor.email,
    subject,
    html,
    text,
    emailType: TEMPLATE_TUTOR_CASH_REQUEST,
  });
}

export async function notifyStudentOfCashDecision(
  admin: SupabaseClient,
  params: {
    studentId: string;
    groupId: string;
    className: string;
    tutorName: string;
    priceTtd: number;
    approved: boolean;
    reason?: string | null;
  }
): Promise<void> {
  const reason = params.reason?.trim() || null;

  await notifyInApp(admin, {
    userId: params.studentId,
    type: params.approved ? 'join_request_approved' : 'booking_declined',
    title: params.approved
      ? `You're in ${params.className}`
      : `Your cash request for ${params.className} was declined`,
    message: params.approved
      ? `Pay ${params.tutorName} ${money(params.priceTtd)} in cash each month.`
      : reason
        ? `"${reason}"`
        : 'No reason was given.',
    link: params.approved ? '/student/classes' : `/student/explore/${params.groupId}`,
    metadata: { groupId: params.groupId },
  });

  const student = await person(admin, params.studentId);
  if (!student?.email) return;
  const hi = `Hi ${first(student.display_name || student.full_name)},`;

  const rendered = params.approved
    ? renderEmail({
        family: 'booking-confirmation',
        subject: `You're in ${params.className}`,
        heading: "You're in",
        intro: hi,
        eyebrow: 'Accepted',
        blocks: [
          {
            kind: 'paragraph',
            text: `${escapeText(params.tutorName)} accepted your request to join ${escapeText(
              params.className
            )} paying cash.`,
          },
          {
            kind: 'details',
            rows: [
              { label: 'Class', value: escapeText(params.className), strong: true },
              { label: 'Pay', value: `${money(params.priceTtd)} / month, in cash to your tutor`, strong: true },
            ],
          },
          {
            kind: 'paragraph',
            text: 'Hand the fee to your tutor directly. They keep track of who has paid each month.',
          },
        ],
        cta: { label: 'Go to your classes', href: appUrl('/student/classes') },
      })
    : renderEmail({
        family: 'refund-cancellation',
        subject: `Your cash request for ${params.className} was declined`,
        heading: 'Your request was declined',
        intro: hi,
        eyebrow: 'Request declined',
        blocks: [
          {
            kind: 'paragraph',
            text: `${escapeText(params.tutorName)} declined your request to join ${escapeText(
              params.className
            )} paying cash.`,
          },
          reason
            ? { kind: 'notice' as const, tone: 'neutral' as const, title: 'What they said', body: escapeText(reason) }
            : { kind: 'paragraph' as const, text: 'No reason was given.' },
          {
            kind: 'paragraph',
            text: 'You can still join by card from the class page, if the class takes card payments.',
          },
        ],
        cta: { label: 'Back to the class', href: appUrl(`/student/explore/${params.groupId}`) },
      });

  await sendIfAllowed(admin, {
    userId: params.studentId,
    type: params.approved ? 'join_request_approved' : 'booking_declined',
    to: student.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    emailType: params.approved ? TEMPLATE_STUDENT_CASH_APPROVED : TEMPLATE_STUDENT_CASH_DECLINED,
  });
}
