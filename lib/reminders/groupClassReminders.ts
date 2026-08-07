// =====================================================
// Group-class session reminders
// =====================================================
// Two reminders, both riding on the existing session_reminders queue rather
// than a second reminder system:
//
//   'today'  the day a class's SCHEDULE begins — the first occurrence of a
//            recurrence row, not every Tuesday of a weekly series.
//   '10m'    every occurrence, the final nudge with the join link.
//
// Unlike 1:1 reminders these are NOT queued ahead. A class roster changes
// between an occurrence being generated and it happening, so recipients are
// resolved when the reminder is due and the queue row is written as the claim:
// the unique index on (group_occurrence_id, recipient_email, reminder_type)
// makes that atomic, so a re-run or two overlapping polls cannot double-send.

import { type SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/services/emailService';

/** Trinidad & Tobago is UTC-4 year round (no DST). */
const TT_OFFSET_MS = 4 * 60 * 60 * 1000;

export type GroupReminderType = 'today' | '10m';

export interface GroupReminderResult {
  claimed: number;
  sent: number;
  failed: number;
}

interface Recipient {
  userId: string;
  email: string;
  name: string | null;
  type: 'student' | 'tutor';
}

/**
 * Everyone who should hear about a class session: approved members plus the
 * tutor. Resolved now, not when the occurrence was created.
 */
async function resolveRecipients(
  admin: SupabaseClient,
  groupId: string,
  tutorId: string | null
): Promise<Recipient[]> {
  const out: Recipient[] = [];

  const { data: members } = await admin
    .from('group_members')
    .select('user_id, profile:profiles!group_members_user_id_fkey(id, full_name, email)')
    .eq('group_id', groupId)
    .in('status', ['approved', 'active']);

  for (const m of members ?? []) {
    const p = (m as any).profile;
    if (p?.email) out.push({ userId: p.id, email: p.email, name: p.full_name, type: 'student' });
  }

  if (tutorId) {
    const { data: tutor } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', tutorId)
      .maybeSingle();
    if ((tutor as any)?.email) {
      out.push({
        userId: (tutor as any).id,
        email: (tutor as any).email,
        name: (tutor as any).full_name,
        type: 'tutor',
      });
    }
  }

  return out;
}

/**
 * Claims one reminder for one recipient.
 *
 * Returns false when the row already exists — someone else (a concurrent run,
 * or this cron an hour ago) has it. The insert IS the lock; checking first and
 * inserting after would leave a window between the two.
 */
async function claim(
  admin: SupabaseClient,
  occurrenceId: string,
  recipient: Recipient,
  reminderType: GroupReminderType,
  sendAt: string
): Promise<boolean> {
  const { error } = await admin.from('session_reminders').insert({
    group_occurrence_id: occurrenceId,
    session_id: null,
    recipient_email: recipient.email,
    recipient_type: recipient.type,
    reminder_type: reminderType,
    send_at: sendAt,
    status: 'sent',
  });

  // 23505 = unique violation: already claimed. Any other error is real.
  if (error) {
    if (error.code === '23505') return false;
    console.error('[groupReminders] claim failed:', error.message);
    return false;
  }
  return true;
}

function fmtTime(d: Date): string {
  return new Date(d.getTime() - TT_OFFSET_MS).toISOString().slice(11, 16) + ' AST';
}

function fmtDate(d: Date): string {
  const tt = new Date(d.getTime() - TT_OFFSET_MS);
  return tt.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Sends one reminder to everyone who should get it.
 *
 * Per-recipient isolation: each claim and send is independent, so a bounce or
 * a duplicate on one address cannot suppress anybody else's.
 */
export async function sendGroupOccurrenceReminder(args: {
  admin: SupabaseClient;
  occurrenceId: string;
  groupId: string;
  groupName: string;
  tutorId: string | null;
  startAt: Date;
  reminderType: GroupReminderType;
  joinUrl: string | null;
  appUrl: string;
}): Promise<GroupReminderResult> {
  const { admin, occurrenceId, groupId, groupName, tutorId, startAt, reminderType, joinUrl, appUrl } = args;
  const result: GroupReminderResult = { claimed: 0, sent: 0, failed: 0 };

  const recipients = await resolveRecipients(admin, groupId, tutorId);
  if (recipients.length === 0) return result;

  const classLink = `${appUrl}/student/classes/${groupId}`;
  const link = joinUrl || classLink;

  for (const r of recipients) {
    const got = await claim(admin, occurrenceId, r, reminderType, new Date().toISOString());
    if (!got) continue;
    result.claimed += 1;

    try {
      const subject =
        reminderType === 'today'
          ? `${groupName} starts today`
          : `${groupName} starts in 10 minutes`;

      const html =
        reminderType === 'today'
          ? `
            <p>Hi ${r.name ?? 'there'},</p>
            <p><strong>${groupName}</strong> starts today at <strong>${fmtTime(startAt)}</strong>.</p>
            ${r.type === 'tutor'
              ? `<p>This is the first session of the schedule you set. Your students have been told too.</p>`
              : `<p>This is the first session of the class. See you there.</p>`}
            <p><a href="${link}">Open the class</a></p>
          `
          : `
            <p>Hi ${r.name ?? 'there'},</p>
            <p><strong>${groupName}</strong> starts in about 10 minutes
               (${fmtTime(startAt)}, ${fmtDate(startAt)}).</p>
            <p><a href="${link}">Join now</a></p>
          `;

      await sendEmail({ to: r.email, subject, html: html.trim() });
      result.sent += 1;

      await admin.from('notifications').insert({
        user_id: r.userId,
        type: 'SESSION_REMINDER',
        title: reminderType === 'today' ? `${groupName} starts today` : `${groupName} starts in 10 minutes`,
        message:
          reminderType === 'today'
            ? `Your first session is today at ${fmtTime(startAt)}.`
            : `Starting at ${fmtTime(startAt)}. Tap to join.`,
        group_id: groupId,
        metadata: { groupId, occurrenceId, reminderType },
      });
    } catch (err) {
      // The claim stands even though the send failed — retrying would risk a
      // duplicate for everyone whose send DID work, and this is a reminder,
      // not a payment.
      result.failed += 1;
      console.error('[groupReminders] send failed', { occurrenceId, to: r.email, err });
    }
  }

  return result;
}
