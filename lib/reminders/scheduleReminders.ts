import { getServiceClient } from '@/lib/supabase/server';

type ReminderRecipientType = 'student' | 'tutor';
type ReminderType = '24h' | '1h' | 'today' | '10m';

const REMINDER_TYPES: ReminderType[] = ['24h', '1h', 'today', '10m'];

/** Trinidad & Tobago is UTC-4 year round (no DST). */
const TT_OFFSET_MS = 4 * 60 * 60 * 1000;
/** Hour of day, Trinidad time, for the morning-of "session is today" batch. */
const TODAY_REMINDER_HOUR_TT = 8;

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

/**
 * Absolute instant at which a reminder should be sent.
 *
 * Everything is resolved to a fixed timestamp HERE, at scheduling time,
 * which is why the sender needs no timezone or date-window logic: the cron
 * just asks for rows where `send_at <= now`. Nothing can fall through a gap
 * between polls, and "today" can't drift across a UTC date boundary.
 */
function buildReminderSendAt(startAt: string, reminderType: ReminderType): string {
  const base = new Date(startAt);

  if (reminderType === 'today') {
    // 08:00 Trinidad time on the session's LOCAL calendar date. Shifting into
    // TT before reading the date is what stops a 9pm-local session (which is
    // already "tomorrow" in UTC) being announced on the wrong morning.
    const tt = new Date(base.getTime() - TT_OFFSET_MS);
    const y = tt.getUTCFullYear();
    const m = tt.getUTCMonth();
    const d = tt.getUTCDate();
    // 08:00 TT === 12:00 UTC
    return new Date(
      Date.UTC(y, m, d, TODAY_REMINDER_HOUR_TT + TT_OFFSET_MS / 3_600_000, 0, 0, 0)
    ).toISOString();
  }

  const offsetMs =
    reminderType === '24h'
      ? 24 * 60 * 60 * 1000
      : reminderType === '1h'
        ? 60 * 60 * 1000
        : 10 * 60 * 1000; // '10m'

  return new Date(base.getTime() - offsetMs).toISOString();
}

// PostgREST PGRST205 / Postgres 42P01 both signal "relation missing".
// If the session_reminders table hasn't been migrated into this database
// yet, we don't want to block bookings, cancellations, or reschedules —
// reminders are a cron-driven nicety, not a transactional dependency.
function isMissingRemindersTable(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  return /session_reminders/i.test(error.message ?? '') && /(not exist|schema cache)/i.test(error.message ?? '');
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

    for (const reminderType of REMINDER_TYPES) {
      let sendAt = buildReminderSendAt(session.scheduled_start_at, reminderType);
      const sendAtMs = new Date(sendAt).getTime();
      const startMs = new Date(session.scheduled_start_at).getTime();

      if (sendAtMs <= now) {
        // The 10-minute nudge is the one reminder worth salvaging when its
        // moment has already passed: a same-day booking made 5 minutes before
        // the session would otherwise get no "starting now" email at all,
        // while push notifications DO send one (the session-reminder-10-min
        // Edge Function has a catch-up window for exactly this). Clamp to now
        // so the next poll picks it up, keeping email and push consistent.
        //
        // Every other type is genuinely stale and is skipped: nobody wants a
        // "starts in 24 hours" email for a session starting in ten minutes.
        if (reminderType === '10m' && startMs > now) {
          sendAt = new Date(now).toISOString();
        } else {
          continue;
        }
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
    if (isMissingRemindersTable(insertError)) {
      console.warn('[scheduleSessionReminders] session_reminders table missing — skipping');
      return;
    }
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
    if (isMissingRemindersTable(error)) {
      console.warn('[cancelSessionReminders] session_reminders table missing — skipping');
      return;
    }
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
