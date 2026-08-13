// Writing and delivering feedback — handover §8.2.
//
// Two things here are easy to get wrong and matter a great deal.
//
// 1. THE ATTENDANCE SNAPSHOT IS BUILT HERE, NOT SUPPLIED
//    §8.2: auto-generated from actual figures, read-only. It comes from the §6
//    helper so the numbers in a report and the numbers on screen cannot
//    disagree, and migration 222's trigger refuses a client-supplied one.
//
// 2. PARENT AND STUDENT GET DIFFERENT BODIES
//    §8.2: "two separate emails with different bodies — the parent's version
//    references the child in the third person, the student's cannot." Sending
//    one email to both addresses would mean either writing to a student about
//    themselves in the third person, or writing to a parent as though they were
//    the child. Where no parent is linked, the student only (decision 14/15).

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  attendanceRate,
  buildAttendanceOutcomes,
  formatAttendanceRate,
  tallyOutcomes,
  type OccurrenceInput,
} from '@/lib/server/attendance';
import { sendEmail, logEmailSend } from '@/lib/services/emailService';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';
import { shouldNotifyForType } from '@/lib/server/notificationPreferences';

export type Participation = 'yes' | 'occasionally' | 'not_often' | 'never_recall';

export const PARTICIPATION_VALUES: Participation[] = [
  'yes',
  'occasionally',
  'not_often',
  'never_recall',
];

/** §8.2's exact wording, kept in one place so no surface paraphrases it. */
export const PARTICIPATION_LABELS: Record<Participation, string> = {
  yes: 'Yes',
  occasionally: 'Occasionally',
  not_often: 'Not often',
  never_recall: 'I can’t recall the student ever participating',
};

export type FeedbackSection = { key: string; label: string; body: string };

export type AttendanceSnapshot = {
  attended: number;
  late: number;
  absent: number;
  cancelled: number;
  /** Sessions the tutor never opened — excluded from the rate entirely (§6). */
  excluded: number;
  rate: number | null;
  counted: number;
  /** Never shown without its denominator. */
  rateLabel: string;
  takenAt: string;
};

/**
 * The child's record with THIS tutor, frozen now.
 *
 * Scoped to the pair, not the platform: a report from one tutor should describe
 * the classes that tutor actually taught. A platform-wide figure would let a
 * child's absences from an unrelated class colour a report about this one.
 */
export async function buildAttendanceSnapshot(
  admin: SupabaseClient,
  params: { childId: string; tutorId: string }
): Promise<AttendanceSnapshot> {
  const nowIso = new Date().toISOString();
  const occurrences: OccurrenceInput[] = [];

  const { data: sessions } = await admin
    .from('sessions')
    .select('id, scheduled_start_at, scheduled_end_at, cancelled_at')
    .eq('student_id', params.childId)
    .eq('tutor_id', params.tutorId)
    .lt('scheduled_start_at', nowIso)
    .order('scheduled_start_at', { ascending: false })
    .limit(120);

  for (const s of (sessions ?? []) as unknown as Array<{
    id: string;
    scheduled_start_at: string;
    scheduled_end_at: string | null;
    cancelled_at: string | null;
  }>) {
    occurrences.push({
      occurrenceType: 'session',
      occurrenceId: s.id,
      scheduledStart: s.scheduled_start_at,
      scheduledEnd: s.scheduled_end_at,
      cancelled: Boolean(s.cancelled_at),
    });
  }

  // Group classes this tutor runs that the child is on.
  const { data: groups } = await admin
    .from('groups')
    .select('id')
    .eq('tutor_id', params.tutorId)
    .limit(200);

  const groupIds = ((groups ?? []) as unknown as Array<{ id: string }>).map((g) => g.id);

  if (groupIds.length > 0) {
    const [{ data: enrolments }, { data: members }] = await Promise.all([
      admin
        .from('group_enrollments')
        .select('group_id')
        .eq('student_id', params.childId)
        .in('group_id', groupIds),
      admin
        .from('group_members')
        .select('group_id')
        .eq('user_id', params.childId)
        .in('group_id', groupIds),
    ]);

    const childGroupIds = Array.from(
      new Set(
        [
          ...((enrolments ?? []) as unknown as Array<{ group_id: string }>),
          ...((members ?? []) as unknown as Array<{ group_id: string }>),
        ].map((r) => r.group_id)
      )
    );

    if (childGroupIds.length > 0) {
      const { data: gsRows } = await admin
        .from('group_sessions')
        .select('id')
        .in('group_id', childGroupIds);

      const gsIds = ((gsRows ?? []) as unknown as Array<{ id: string }>).map((g) => g.id);

      if (gsIds.length > 0) {
        const { data: occ } = await admin
          .from('group_session_occurrences')
          .select('id, scheduled_start_at, scheduled_end_at, cancelled_at')
          .in('group_session_id', gsIds)
          .lt('scheduled_start_at', nowIso)
          .order('scheduled_start_at', { ascending: false })
          .limit(200);

        for (const o of (occ ?? []) as unknown as Array<{
          id: string;
          scheduled_start_at: string;
          scheduled_end_at: string | null;
          cancelled_at: string | null;
        }>) {
          occurrences.push({
            occurrenceType: 'group_occurrence',
            occurrenceId: o.id,
            scheduledStart: o.scheduled_start_at,
            scheduledEnd: o.scheduled_end_at,
            cancelled: Boolean(o.cancelled_at),
          });
        }
      }
    }
  }

  const outcomes = await buildAttendanceOutcomes(admin, {
    studentId: params.childId,
    occurrences,
  });

  const tally = tallyOutcomes(outcomes);
  const { rate, counted } = attendanceRate(tally);

  return {
    attended: tally.attended,
    late: tally.late,
    absent: tally.absent,
    cancelled: tally.cancelled,
    excluded: outcomes.filter((o) => o.outcome === 'excluded').length,
    rate,
    counted,
    rateLabel: formatAttendanceRate(tally),
    takenAt: nowIso,
  };
}

// ---------------------------------------------------------------------------
// Delivery — §8.2, two bodies
// ---------------------------------------------------------------------------

function shell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6">${body}</div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sectionsHtml(sections: FeedbackSection[]): string {
  if (sections.length === 0) return '';
  return sections
    .map(
      (s) => `<div style="padding:10px 0;border-top:1px solid #f3f4f6">
        <p style="margin:0 0 3px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#9ca3af">${esc(s.label)}</p>
        <p style="margin:0;font-size:14px;color:#374151">${esc(s.body)}</p>
      </div>`
    )
    .join('');
}

function attendanceHtml(snapshot: AttendanceSnapshot): string {
  return `<div style="background:#f9fafb;border-radius:10px;padding:14px;margin:14px 0">
    <p style="margin:0 0 6px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#6b7280">Attendance · recorded automatically</p>
    <p style="margin:0;font-size:18px;font-weight:800;color:#111827">${esc(snapshot.rateLabel)}</p>
    <p style="margin:4px 0 0;font-size:12px;color:#6b7280">
      ${snapshot.attended} attended · ${snapshot.late} late · ${snapshot.absent} absent${
        snapshot.cancelled ? ` · ${snapshot.cancelled} cancelled` : ''
      }
    </p>
  </div>`;
}

/**
 * Delivers one report to both audiences, in their own words.
 *
 * §8.2 and decision 14. In-app first so the record exists even when email is
 * disabled (staging has no key), then the two emails.
 */
export async function deliverFeedback(
  admin: SupabaseClient,
  params: {
    feedbackId: string;
    childId: string;
    tutorId: string;
    tutorName: string;
    childName: string;
    snapshot: AttendanceSnapshot;
    participation: Participation;
    attendanceNote: string | null;
    sections: FeedbackSection[];
    answeringRequest: boolean;
    isEdit: boolean;
  }
): Promise<void> {
  const childFirst = params.childName.split(' ')[0];

  const { data: parentLink } = await admin
    .from('parent_child_links')
    .select('parent_id')
    .eq('child_id', params.childId)
    .limit(1)
    .maybeSingle();

  const parentId = (parentLink as { parent_id: string } | null)?.parent_id ?? null;

  const ids = [params.childId, ...(parentId ? [parentId] : [])];
  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, display_name, email')
    .in('id', ids);

  const rows = (people ?? []) as unknown as Array<{
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  }>;
  const child = rows.find((p) => p.id === params.childId);
  const parent = parentId ? rows.find((p) => p.id === parentId) : null;

  const editedNote = params.isEdit
    ? '<p style="margin:0 0 10px;font-size:12px;color:#b45309">This feedback was edited after it was first sent.</p>'
    : '';

  const common = `
    ${attendanceHtml(params.snapshot)}
    ${
      params.attendanceNote
        ? `<p style="margin:0 0 12px;font-size:13px;color:#374151"><span style="color:#9ca3af">Tutor’s note: </span>${esc(params.attendanceNote)}</p>`
        : ''
    }
    ${sectionsHtml(params.sections)}
  `;

  // ---- in-app, both parties ------------------------------------------------
  await notifyInApp(admin, {
    userId: params.childId,
    type: 'new_feedback',
    title: `${params.tutorName} ${params.isEdit ? 'updated your feedback' : 'sent you feedback'}`,
    message: params.snapshot.rateLabel,
    link: '/student/classes',
    metadata: { feedback_id: params.feedbackId },
  });

  if (parentId) {
    await notifyInApp(admin, {
      userId: parentId,
      type: 'new_feedback',
      title: `${params.tutorName} ${params.isEdit ? 'updated feedback' : 'filed feedback'} for ${childFirst}`,
      message: params.snapshot.rateLabel,
      link: '/parent/dashboard',
      metadata: { feedback_id: params.feedbackId, child_id: params.childId },
    });
  }

  // ---- the student's own copy: second person, never about "the student" ----
  if (child?.email) {
    const subject = params.isEdit
      ? `${params.tutorName} updated your feedback`
      : `Feedback from ${params.tutorName}`;
    const html = shell(`
      <p>Hi ${esc(childFirst)},</p>
      ${editedNote}
      <p>${esc(params.tutorName)} wrote this about how you are getting on.</p>
      ${common}
      <p style="margin:14px 0 0;font-size:12px;color:#9ca3af">
        ${parentId ? 'A copy has gone to your parent as well.' : 'This was sent to you.'}
      </p>
    `);
    // §10.6 — the in-app row above is always written; only the email is muted.
    const allowed = await shouldNotifyForType(admin, {
      userId: params.childId,
      type: 'new_feedback',
      channel: 'email',
    });
    if (allowed) {
      const result = await sendEmail({ to: child.email, subject, html });
      await logEmailSend({
        userId: params.childId,
        emailType: 'feedback_delivered_student',
        recipientEmail: child.email,
        subject,
        status: result.success ? 'success' : 'failed',
        errorMessage: result.error,
      });
    }
  }

  // ---- the parent's copy: third person, about their child ------------------
  if (parent?.email) {
    const parentFirst = (parent.display_name || parent.full_name || 'there').split(' ')[0];
    const subject = params.isEdit
      ? `${params.tutorName} updated feedback for ${childFirst}`
      : `${params.tutorName} filed feedback for ${childFirst}`;
    const html = shell(`
      <p>Hi ${esc(parentFirst)},</p>
      ${editedNote}
      <p>${esc(params.tutorName)} has ${params.isEdit ? 'updated their' : 'written'} feedback for
         <strong>${esc(childFirst)}</strong>${
           params.answeringRequest ? ', answering the request from your household' : ''
         }.</p>
      ${common}
      <p style="margin:14px 0 0;font-size:12px;color:#9ca3af">
        ${esc(childFirst)} received their own copy of this.
      </p>
    `);
    // Per-child mute applies here: a parent with two children may want feedback
    // email for one and not the other.
    const allowed = await shouldNotifyForType(admin, {
      userId: parentId!,
      type: 'new_feedback',
      channel: 'email',
      childId: params.childId,
    });
    if (allowed) {
      const result = await sendEmail({ to: parent.email, subject, html });
      await logEmailSend({
        userId: parentId!,
        emailType: 'feedback_delivered_parent',
        recipientEmail: parent.email,
        subject,
        status: result.success ? 'success' : 'failed',
        errorMessage: result.error,
      });
    }
  }
}
