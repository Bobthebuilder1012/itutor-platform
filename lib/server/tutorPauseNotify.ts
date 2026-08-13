// The four tutor-pause emails — §9 of the pause spec.
//
// All four are a FAN-OUT: every enrolled family, parent AND student both.
// Category: subscription changes, so §10.6 preferences and per-child mutes apply.
//
// THE ONE THING EVERY VARIANT MUST DO
// Name the cause. "A pause email that doesn't will read as a payment failure" —
// a family who thinks their card was declined behaves completely differently from
// one who knows the tutor is on holiday. So every subject and first line says
// break, and every body states the four concrete facts: the window, the seat is
// held, and the date money next leaves their account.
//
// AND THE ONE THING THEY MUST NOT DO
// Show a credit balance. The spec is explicit: surface the renewal date, never a
// balance. A parent wants to know when they will next be charged, not to be
// handed an accounting artefact to interpret.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail, logEmailSend } from '@/lib/services/emailService';
import { notifyInApp } from '@/lib/server/bookingRequestNotify';
import { shouldNotify } from '@/lib/server/notificationPreferences';
import { LONG_PAUSE_WEEKS, isLongPause } from '@/lib/payments/tutorPause';

export type PauseNoticeKind = 'paused' | 'extended' | 'resuming_early';

function appUrl(path: string): string {
  return `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://myitutor.com').replace(/\/$/, '')}${path}`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return 'a date to be confirmed';
  try {
    return new Date(iso).toLocaleDateString('en-TT', {
      day: 'numeric',
      month: 'long',
      timeZone: 'America/Port_of_Spain',
    });
  } catch {
    return iso;
  }
}

function shell(body: string): string {
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#111827;line-height:1.6">${body}</div>`;
}

function button(label: string, href: string, primary = true): string {
  const bg = primary ? '#199356' : '#fff';
  const fg = primary ? '#fff' : '#111827';
  const border = primary ? '#199356' : '#d1d5db';
  return `<a href="${href}" style="display:inline-block;background:${bg};color:${fg};border:1px solid ${border};text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">${label}</a>`;
}

/**
 * The cancel option. Given EQUAL visual weight for long pauses rather than
 * buried — with no platform cap on pause length, informed family choice is the
 * only thing standing in for one.
 */
function cancelBlock(className: string): string {
  return `<div style="margin:18px 0;padding:14px;border:1px solid #e5e7eb;border-radius:10px">
    <p style="margin:0 0 10px;font-size:14px">
      This is a long break. If you would rather not wait, you can cancel
      <strong>${className}</strong> instead — your place is held either way until you decide.
    </p>
    ${button('Cancel this class', appUrl('/parent/subscriptions'), false)}
  </div>`;
}

type Recipient = { id: string; email: string | null; name: string | null; isParent: boolean };

type FamilyRow = {
  enrolmentId: string;
  studentId: string;
  adjustedRenewalDate: string | null;
  pauseStart: string | null;
  pauseEnd: string | null;
};

/**
 * Sends one notice to every family in a class that has not had it yet.
 *
 * pause_notified_at is the idempotency key: the cron re-runs this every tick, and
 * a family already told about THIS change is skipped. Every mutation in
 * tutorPause clears it, which is what makes an extension re-notify without
 * re-notifying for the original announcement.
 */
export async function fanOutPauseNotice(
  admin: SupabaseClient,
  params: {
    groupId: string;
    kind: PauseNoticeKind;
    /** Only for 'extended' and 'resuming_early' — the date families were told before. */
    previousEnd?: string | null;
  }
): Promise<{ notified: number }> {
  const { data: group } = await admin
    .from('groups')
    .select('id, name, subject, tutor_id')
    .eq('id', params.groupId)
    .maybeSingle();

  const g = group as {
    id: string;
    name: string | null;
    subject: string | null;
    tutor_id: string;
  } | null;
  if (!g) return { notified: 0 };

  const className = g.name || g.subject || 'Your class';

  const { data: tutor } = await admin
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', g.tutor_id)
    .maybeSingle();
  const t = tutor as { full_name: string | null; display_name: string | null } | null;
  const tutorFirst = (t?.display_name || t?.full_name || 'Your tutor').split(' ')[0];

  const { data: rows } = await admin
    .from('group_enrollments')
    .select('id, student_id, adjusted_renewal_date, pause_start, pause_end')
    .eq('group_id', params.groupId)
    .eq('pause_reason', 'tutor_break')
    .is('pause_notified_at', null)
    .in('status', ['ACTIVE', 'GRACE'])
    .limit(500);

  const families: FamilyRow[] = ((rows ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    adjusted_renewal_date: string | null;
    pause_start: string | null;
    pause_end: string | null;
  }>).map((r) => ({
    enrolmentId: r.id,
    studentId: r.student_id,
    adjustedRenewalDate: r.adjusted_renewal_date,
    pauseStart: r.pause_start,
    pauseEnd: r.pause_end,
  }));

  if (families.length === 0) return { notified: 0 };

  let notified = 0;

  for (const family of families) {
    const recipients = await resolveFamily(admin, family.studentId);

    const long =
      family.pauseStart && family.pauseEnd
        ? isLongPause(family.pauseStart, family.pauseEnd)
        : false;

    for (const r of recipients) {
      const { subject, html, inAppTitle, inAppBody } = compose({
        kind: params.kind,
        className,
        tutorFirst,
        pauseStart: family.pauseStart,
        pauseEnd: family.pauseEnd,
        previousEnd: params.previousEnd ?? null,
        renewal: family.adjustedRenewalDate,
        long,
        forParent: r.isParent,
        firstName: (r.name ?? 'there').split(' ')[0],
      });

      // In-app always; it is the record.
      await notifyInApp(admin, {
        userId: r.id,
        type: 'subscription_reactivation',
        title: inAppTitle,
        message: inAppBody,
        link: r.isParent ? '/parent/subscriptions' : '/student/classes',
      });

      if (!r.email) continue;

      const allowed = await shouldNotify(admin, {
        userId: r.id,
        category: 'subscription',
        channel: 'email',
        // Per-child mute applies on the parent's side.
        childId: r.isParent ? family.studentId : null,
      });

      if (!allowed) {
        await logEmailSend({
          userId: r.id,
          emailType: `tutor_pause_${params.kind}`,
          recipientEmail: r.email,
          subject,
          status: 'failed',
          errorMessage: 'skipped: muted by notification preferences',
        });
        continue;
      }

      const result = await sendEmail({ to: r.email, subject, html });
      await logEmailSend({
        userId: r.id,
        emailType: `tutor_pause_${params.kind}`,
        recipientEmail: r.email,
        subject,
        status: result.success ? 'success' : 'failed',
        errorMessage: result.error,
      });
    }

    // Stamped once per family, after both recipients, so a mid-family crash
    // retries the whole household rather than half of it.
    await admin
      .from('group_enrollments')
      .update({ pause_notified_at: new Date().toISOString() })
      .eq('id', family.enrolmentId);

    notified += 1;
  }

  return { notified };
}

async function resolveFamily(
  admin: SupabaseClient,
  studentId: string
): Promise<Recipient[]> {
  const out: Recipient[] = [];

  const { data: student } = await admin
    .from('profiles')
    .select('id, full_name, display_name, email')
    .eq('id', studentId)
    .maybeSingle();

  const s = student as {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;

  if (s) {
    out.push({
      id: s.id,
      email: s.email,
      name: s.display_name || s.full_name,
      isParent: false,
    });
  }

  const { data: link } = await admin
    .from('parent_child_links')
    .select('parent_id')
    .eq('child_id', studentId)
    .limit(1)
    .maybeSingle();

  const parentId = (link as { parent_id: string } | null)?.parent_id ?? null;
  if (!parentId) return out;

  const { data: parent } = await admin
    .from('profiles')
    .select('id, full_name, display_name, email')
    .eq('id', parentId)
    .maybeSingle();

  const p = parent as {
    id: string;
    full_name: string | null;
    display_name: string | null;
    email: string | null;
  } | null;

  if (p) {
    out.push({
      id: p.id,
      email: p.email,
      name: p.display_name || p.full_name,
      isParent: true,
    });
  }

  return out;
}

function compose(params: {
  kind: PauseNoticeKind;
  className: string;
  tutorFirst: string;
  pauseStart: string | null;
  pauseEnd: string | null;
  previousEnd: string | null;
  renewal: string | null;
  long: boolean;
  forParent: boolean;
  firstName: string;
}): { subject: string; html: string; inAppTitle: string; inAppBody: string } {
  const { className, tutorFirst, pauseStart, pauseEnd, renewal, long } = params;
  const from = fmtDate(pauseStart);
  const until = fmtDate(pauseEnd);
  const charge = fmtDate(renewal);

  // The charge sentence differs for a student, who is not the one being charged.
  const chargeLine = params.forParent
    ? `your next charge moves to <strong>${charge}</strong>`
    : `the next payment moves to <strong>${charge}</strong>`;

  const seatLine = '<strong>Your place is held</strong>';

  if (params.kind === 'resuming_early') {
    // §9.4 — the whole purpose is preventing an unexpected charge.
    const subject = `${className} resumes on ${until}`;
    return {
      subject,
      inAppTitle: `${className} resumes on ${until}`,
      inAppBody: `Earlier than previously advised. Billing restarts ${charge}.`,
      html: shell(`
        <p>Hi ${params.firstName},</p>
        <p><strong>${className}</strong> is coming back <strong>earlier than previously advised</strong> —
           it resumes on <strong>${until}</strong>.</p>
        <p>Because the break is shorter, ${chargeLine}.</p>
        <p>${button('View class', appUrl('/student/classes'))}</p>
      `),
    };
  }

  if (params.kind === 'extended') {
    // §9.3
    const subject = `${className} break has been extended`;
    return {
      subject,
      inAppTitle: `${className} break extended to ${until}`,
      inAppBody: `Your place is held. Next charge ${charge}.`,
      html: shell(`
        <p>Hi ${params.firstName},</p>
        <p>${tutorFirst} has <strong>extended the break</strong> on <strong>${className}</strong>.</p>
        <p>It was due to resume on <strong>${fmtDate(params.previousEnd)}</strong>; it will now resume on
           <strong>${until}</strong>.</p>
        <p>${seatLine}, no payment is taken during the break, and ${chargeLine}.</p>
        ${long && params.forParent ? cancelBlock(className) : ''}
        <p>${button('View class', appUrl('/student/classes'))}</p>
      `),
    };
  }

  // §9.1 / §9.2 — the four facts, cause named first.
  const subject = `${className} is on break`;
  return {
    subject,
    inAppTitle: `${className} is on break until ${until}`,
    inAppBody: `Your place is held. Next charge ${charge}.`,
    html: shell(`
      <p>Hi ${params.firstName},</p>
      <p><strong>${className}</strong> is on break from <strong>${from}</strong> until
         <strong>${until}</strong>. ${tutorFirst} has paused the class.</p>
      <p>${seatLine}, no payment will be taken during the break, and ${chargeLine}.</p>
      <p style="color:#4b5563;font-size:14px">
        You are not losing the sessions — the dates move. Nothing is being refunded because nothing
        has been taken for teaching you have not had.
      </p>
      ${long && params.forParent ? cancelBlock(className) : ''}
      <p>${button('View class', appUrl('/student/classes'))}</p>
      ${
        long
          ? ''
          : `<p style="color:#9ca3af;font-size:12px">You can cancel at any time from your subscriptions page.</p>`
      }
    `),
  };
}

export { LONG_PAUSE_WEEKS };
