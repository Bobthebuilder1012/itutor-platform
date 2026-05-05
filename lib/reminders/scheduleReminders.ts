import { getServiceClient } from '@/lib/supabase/server';

type ReminderRecipientType = 'student' | 'tutor';
type ReminderType = '24h' | '1h';

export interface ReminderSession {
  id: string;
  student_id: string;
  tutor_id: string;
  scheduled_start_at: string;
}

interface ProfileEmailRow {
  id: string;
  email: string | null;
}

function buildReminderSendAt(startAt: string, reminderType: ReminderType): string {
  const base = new Date(startAt);
  const offsetHours = reminderType === '24h' ? 24 : 1;
  return new Date(base.getTime() - offsetHours * 60 * 60 * 1000).toISOString();
}

/**
 * Schedules 24-hour and 1-hour reminders for both the student and tutor.
 */
export async function scheduleSessionReminders(session: ReminderSession): Promise<void> {
  const supabase = getServiceClient();

  await cancelSessionReminders(session.id);

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', [session.student_id, session.tutor_id]);

  if (profilesError) {
    throw new Error(`Failed to load session reminder recipients: ${profilesError.message}`);
  }

  const profileMap = new Map((profiles as ProfileEmailRow[] | null)?.map((profile) => [profile.id, profile]) ?? []);
  const now = Date.now();
  const rows: Array<{
    session_id: string;
    recipient_email: string;
    recipient_type: ReminderRecipientType;
    reminder_type: ReminderType;
    send_at: string;
  }> = [];

  const recipients: Array<{ type: ReminderRecipientType; profile: ProfileEmailRow | undefined }> = [
    { type: 'student', profile: profileMap.get(session.student_id) },
    { type: 'tutor', profile: profileMap.get(session.tutor_id) },
  ];

  for (const recipient of recipients) {
    if (!recipient.profile?.email) {
      continue;
    }

    for (const reminderType of ['24h', '1h'] as ReminderType[]) {
      const sendAt = buildReminderSendAt(session.scheduled_start_at, reminderType);
      if (new Date(sendAt).getTime() <= now) {
        continue;
      }

      rows.push({
        session_id: session.id,
        recipient_email: recipient.profile.email,
        recipient_type: recipient.type,
        reminder_type: reminderType,
        send_at: sendAt,
      });
    }
  }

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from('session_reminders').insert(rows);
  if (insertError) {
    throw new Error(`Failed to schedule session reminders: ${insertError.message}`);
  }
}

/**
 * Cancels all pending reminders for a session.
 */
export async function cancelSessionReminders(sessionId: string): Promise<void> {
  const supabase = getServiceClient();
  const { error } = await supabase
    .from('session_reminders')
    .update({ status: 'cancelled' })
    .eq('session_id', sessionId)
    .eq('status', 'pending');

  if (error) {
    throw new Error(`Failed to cancel session reminders: ${error.message}`);
  }
}

/**
 * Rebuilds reminders after a session start time changes.
 */
export async function rescheduleSessionReminders(session: ReminderSession): Promise<void> {
  await cancelSessionReminders(session.id);
  await scheduleSessionReminders(session);
}
