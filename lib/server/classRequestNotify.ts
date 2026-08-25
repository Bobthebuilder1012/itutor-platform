// Emails and in-app notices for GROUP CLASS membership events.
//
// The 1:1 equivalents live in bookingRequestNotify and are reused wherever they
// fit — notifyInApp, sendIfAllowed (preferences + logging), appUrl. What is new
// here is the class-shaped versions:
//
//   parent asked to approve a class          §4.3, but for a class
//   student told the parent's answer         approved / declined
//   tutor told a student wants to join       the request email that never existed
//   parent told their child left a class     so leaving is not silent
//
// THE SAME RULE AS §4.3: no email acts. Every button is a link to a page on
// iTutor. An approve link that worked from the inbox would let anyone holding a
// forwarded email enrol someone else's child.

import type { SupabaseClient } from '@supabase/supabase-js';
import { renderEmail } from '@/lib/email/design';
import { appUrl, notifyInApp, sendIfAllowed } from '@/lib/server/bookingRequestNotify';

export const TEMPLATE_PARENT_CLASS_REQUEST = 'parent_class_join_request';
export const TEMPLATE_STUDENT_CLASS_APPROVED = 'student_class_request_approved';
export const TEMPLATE_STUDENT_CLASS_DECLINED = 'student_class_request_declined';
export const TEMPLATE_TUTOR_JOIN_REQUEST = 'tutor_class_join_request';
export const TEMPLATE_PARENT_CHILD_LEFT_CLASS = 'parent_child_left_class';

const escapeText = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** first name, or a greeting that still reads like a sentence without one. */
const first = (name: string | null | undefined) => (name ?? 'there').split(' ')[0] || 'there';

// ---------------------------------------------------------------------------
// The parent is asked to decide
// ---------------------------------------------------------------------------

export async function notifyParentOfClassRequest(
  admin: SupabaseClient,
  params: {
    parentId: string;
    parentEmail: string | null;
    parentName: string | null;
    childId: string;
    childName: string;
    className: string;
    tutorName: string;
    scheduleLabel: string | null;
    priceTtd: number;
    requiresTutorApproval: boolean;
    requestId: string;
    groupId: string;
  }
): Promise<void> {
  const isFree = params.priceTtd <= 0;
  const price = isFree ? 'Free' : `$${params.priceTtd} TTD / month`;

  await notifyInApp(admin, {
    userId: params.parentId,
    type: 'parent_approval_request',
    title: `${params.childName} wants to join ${params.className}`,
    message: [params.tutorName, params.scheduleLabel, price].filter(Boolean).join(' · '),
    link: '/parent/approvals',
    metadata: { classRequestId: params.requestId, groupId: params.groupId },
  });

  if (!params.parentEmail) return;

  // Family 05, warning tone. Nothing is held while the parent decides — the
  // same truth as the 1:1 request, and for the same reason it is said here
  // rather than assumed: a class that fills while a parent thinks it over reads
  // as a bug unless the email said so.
  const { subject, html, text } = renderEmail({
    family: 'booking-confirmation',
    subject: `${params.childName} needs your approval to join ${params.className}`,
    heading: `${params.childName} needs your approval`,
    intro: `Hi ${first(params.parentName)}, a class is waiting on you.`,
    eyebrow: 'Approval needed',
    tone: 'warning',
    badge: '!',
    blocks: [
      {
        kind: 'paragraph',
        text: `${escapeText(params.childName)} has asked to join ${escapeText(
          params.className
        )} with ${escapeText(params.tutorName)}.`,
      },
      {
        kind: 'details',
        tone: 'neutral',
        rows: [
          { label: 'Class', value: escapeText(params.className), strong: true },
          { label: 'Tutor', value: escapeText(params.tutorName) },
          ...(params.scheduleLabel
            ? [{ label: 'Meets', value: escapeText(params.scheduleLabel) }]
            : []),
          { label: 'Price as listed', value: price, strong: true },
        ],
      },
      {
        kind: 'notice',
        tone: 'warning',
        title: 'This place is not being held',
        body: 'Another student can take the last place while this sits here.',
      },
      {
        kind: 'paragraph',
        text: isFree
          ? 'This class is free, so there is nothing to pay — you are approving the enrolment itself.'
          : 'Approving takes you to the payment step; nothing is charged until you finish it.',
      },
      ...(params.requiresTutorApproval
        ? [
            {
              kind: 'paragraph' as const,
              text: 'The tutor also approves who joins this class, so your approval sends the request on to them.',
            },
          ]
        : []),
    ],
    cta: { label: 'Review this request', href: appUrl('/parent/approvals') },
    closing: 'For your security, approving happens on iTutor and never from this email.',
  });

  await sendIfAllowed(admin, {
    userId: params.parentId,
    type: 'parent_approval_request',
    childId: params.childId,
    to: params.parentEmail,
    subject,
    html,
    text,
    emailType: TEMPLATE_PARENT_CLASS_REQUEST,
  });
}

// ---------------------------------------------------------------------------
// The answer goes back to the student
// ---------------------------------------------------------------------------

export async function notifyStudentOfClassDecision(
  admin: SupabaseClient,
  params: {
    studentId: string;
    studentEmail: string | null;
    studentName: string | null;
    parentName: string;
    className: string;
    groupId: string;
    approved: boolean;
    /** Only for a decline; sent verbatim, escaped, never softened. */
    reason?: string | null;
    /** Approved into the tutor's queue rather than straight into the class. */
    awaitingTutor?: boolean;
  }
): Promise<void> {
  const reason = params.reason?.trim() || null;

  await notifyInApp(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    title: params.approved
      ? `${params.parentName} approved ${params.className}`
      : `${params.parentName} declined ${params.className}`,
    message: params.approved
      ? params.awaitingTutor
        ? 'The tutor now needs to accept your request.'
        : 'You are in the class.'
      : reason
        ? `"${reason}"`
        : 'No reason was given.',
    link: params.approved ? `/student/classes` : '/student/explore',
    metadata: { groupId: params.groupId },
  });

  if (!params.studentEmail) return;

  const rendered = params.approved
    ? renderEmail({
        family: 'booking-confirmation',
        subject: `${params.parentName} approved ${params.className}`,
        heading: params.awaitingTutor ? 'Approved — now with the tutor' : "You're in",
        intro: `Hi ${first(params.studentName)},`,
        blocks: [
          {
            kind: 'paragraph',
            text: params.awaitingTutor
              ? `${escapeText(params.parentName)} approved your request to join ${escapeText(
                  params.className
                )}. The tutor accepts who joins this class, so it is with them now.`
              : `${escapeText(params.parentName)} approved your request, and you are now in ${escapeText(
                  params.className
                )}.`,
          },
        ],
        cta: params.awaitingTutor
          ? { label: 'View the class', href: appUrl(`/student/explore/${params.groupId}`) }
          : { label: 'Go to your classes', href: appUrl('/student/classes') },
      })
    : renderEmail({
        family: 'refund-cancellation',
        subject: `Your request to join ${params.className} was declined`,
        heading: 'Your request was declined',
        intro: `Hi ${first(params.studentName)},`,
        eyebrow: 'Request declined',
        blocks: [
          {
            kind: 'paragraph',
            text: `${escapeText(params.parentName)} declined your request to join ${escapeText(
              params.className
            )}.`,
          },
          reason
            ? { kind: 'notice' as const, tone: 'neutral' as const, title: 'What they said', body: escapeText(reason) }
            : { kind: 'paragraph' as const, text: 'No reason was given.' },
          {
            kind: 'paragraph',
            text: 'Asking again after a conversation is completely normal, and there are other classes in the same subject.',
          },
        ],
        cta: { label: 'Find another class', href: appUrl('/student/explore') },
      });

  await sendIfAllowed(admin, {
    userId: params.studentId,
    type: 'parent_approval_outcome',
    to: params.studentEmail,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    emailType: params.approved
      ? TEMPLATE_STUDENT_CLASS_APPROVED
      : TEMPLATE_STUDENT_CLASS_DECLINED,
  });
}

// ---------------------------------------------------------------------------
// The tutor is told someone asked to join
// ---------------------------------------------------------------------------

/**
 * The in-app notice for this already existed; the email did not. A tutor who
 * gates their class on approval is the only person who can unblock a waiting
 * student, and until now nothing reached them outside the app.
 */
export async function notifyTutorOfJoinRequest(
  admin: SupabaseClient,
  params: {
    tutorId: string;
    className: string;
    groupId: string;
    studentName: string;
    /** False for an instant join — the email then just says who joined. */
    isRequest: boolean;
  }
): Promise<void> {
  const { data } = await admin
    .from('profiles')
    .select('email, full_name, display_name')
    .eq('id', params.tutorId)
    .maybeSingle();

  const tutor = data as {
    email: string | null;
    full_name: string | null;
    display_name: string | null;
  } | null;
  if (!tutor?.email) return;

  const rosterUrl = appUrl(`/tutor/classes/${params.groupId}?tab=roster`);

  const rendered = params.isRequest
    ? renderEmail({
        family: 'booking-confirmation',
        subject: `${params.studentName} wants to join ${params.className}`,
        heading: 'A student is waiting on you',
        intro: `Hi ${first(tutor.display_name || tutor.full_name)},`,
        eyebrow: 'Join request',
        tone: 'warning',
        blocks: [
          {
            kind: 'paragraph',
            text: `${escapeText(params.studentName)} has asked to join ${escapeText(
              params.className
            )}. They cannot attend until you accept.`,
          },
          {
            kind: 'paragraph',
            text: 'You approve or decline from the class roster.',
          },
        ],
        cta: { label: 'Open the roster', href: rosterUrl },
      })
    : renderEmail({
        family: 'booking-confirmation',
        subject: `${params.studentName} joined ${params.className}`,
        heading: 'A new student joined',
        intro: `Hi ${first(tutor.display_name || tutor.full_name)},`,
        blocks: [
          {
            kind: 'paragraph',
            text: `${escapeText(params.studentName)} has joined ${escapeText(params.className)}.`,
          },
        ],
        cta: { label: 'Open the roster', href: rosterUrl },
      });

  await sendIfAllowed(admin, {
    userId: params.tutorId,
    type: params.isRequest ? 'join_request' : 'new_class_member',
    to: tutor.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    emailType: TEMPLATE_TUTOR_JOIN_REQUEST,
  });
}

// ---------------------------------------------------------------------------
// A child left a class
// ---------------------------------------------------------------------------

/**
 * Told to every linked parent, whoever ended the membership.
 *
 * A parent finding out weeks later that their child dropped a class — or was
 * removed from one — is the failure this exists to prevent, so it is sent for
 * the child's own leave AND for a tutor removal, with the wording saying which.
 * It is not gated on approval settings: a parent who lets their child book
 * freely still gets told when a class ends.
 */
export async function notifyParentsChildLeftClass(
  admin: SupabaseClient,
  params: {
    studentId: string;
    className: string;
    groupId: string;
    /** 'left' — the child ended it. 'removed' — the tutor did. */
    how: 'left' | 'removed';
    /** Paid classes can keep access to a date; free ones end at once. */
    accessUntil?: string | null;
  }
): Promise<void> {
  const { data: links } = await admin
    .from('parent_child_links')
    .select('parent_id')
    .eq('child_id', params.studentId);

  const parentIds = ((links ?? []) as Array<{ parent_id: string }>).map((l) => l.parent_id);
  if (parentIds.length === 0) return;

  const { data: people } = await admin
    .from('profiles')
    .select('id, email, full_name, display_name')
    .in('id', [...parentIds, params.studentId]);

  const byId = new Map(
    ((people ?? []) as Array<{
      id: string;
      email: string | null;
      full_name: string | null;
      display_name: string | null;
    }>).map((p) => [p.id, p])
  );

  const child = byId.get(params.studentId);
  const childName = child?.display_name || child?.full_name || 'Your child';
  const removed = params.how === 'removed';

  for (const parentId of parentIds) {
    const parent = byId.get(parentId);

    await notifyInApp(admin, {
      userId: parentId,
      type: 'child_left_class',
      title: removed
        ? `${childName} was removed from ${params.className}`
        : `${childName} left ${params.className}`,
      message: params.accessUntil
        ? `Access continues until ${params.accessUntil}.`
        : 'They are no longer enrolled.',
      link: '/parent/children',
      metadata: { groupId: params.groupId, childId: params.studentId, how: params.how },
    });

    if (!parent?.email) continue;

    // Family 09: something that was happening has stopped. Neutral in tone —
    // a child leaving a class is news, not an alarm, and the email that treats
    // it as an emergency is the one a parent learns to ignore.
    const { subject, html, text } = renderEmail({
      family: 'refund-cancellation',
      subject: removed
        ? `${childName} was removed from ${params.className}`
        : `${childName} left ${params.className}`,
      heading: removed ? 'A class has ended for them' : 'They left a class',
      intro: `Hi ${first(parent.display_name || parent.full_name)},`,
      eyebrow: removed ? 'Removed from class' : 'Left a class',
      blocks: [
        {
          kind: 'paragraph',
          text: removed
            ? `${escapeText(childName)} was removed from ${escapeText(
                params.className
              )} by the tutor.`
            : `${escapeText(childName)} left ${escapeText(params.className)}.`,
        },
        {
          kind: 'details',
          rows: [
            { label: 'Class', value: escapeText(params.className), strong: true },
            { label: 'Student', value: escapeText(childName) },
            {
              label: 'Access',
              value: params.accessUntil
                ? `Continues until ${escapeText(params.accessUntil)}`
                : 'Ended',
            },
          ],
        },
        {
          kind: 'paragraph',
          text: 'Nothing else changes on their account, and they can join another class at any time.',
        },
      ],
      cta: { label: 'See their classes', href: appUrl('/parent/children') },
    });

    await sendIfAllowed(admin, {
      userId: parentId,
      type: 'child_left_class',
      childId: params.studentId,
      to: parent.email,
      subject,
      html,
      text,
      emailType: TEMPLATE_PARENT_CHILD_LEFT_CLASS,
    });
  }
}
