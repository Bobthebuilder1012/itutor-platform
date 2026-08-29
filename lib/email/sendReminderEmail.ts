/**
 * Session reminder emails.
 *
 * Four lead times — the morning-of batch, 24 hours, 1 hour and a 10-minute
 * nudge — all queued as rows in `session_reminders` with an absolute `send_at`
 * and sent by /api/cron/send-reminders.
 *
 * TWO BUGS THIS FILE HAS ALREADY HAD, both worth keeping in mind before
 * changing it:
 *
 * It used to pass `react: <Component />` to sendEmail(), whose contract is
 * `html: string` and which ignores every other key — so `html` arrived
 * undefined and every reminder failed at the Resend call.
 *
 * And there was a `sendReminderEmail.ts` stub beside the `.tsx` implementation
 * that logged "[EMAIL BLOCKED]" and returned success. TypeScript resolves `.ts`
 * before `.tsx` while Next's webpack resolves `.tsx` first, so type-checking and
 * runtime disagreed about which module was in play. There is now one file, and
 * it is this one — do not add a second with the other extension.
 *
 * The body is built by lib/email/design, in the session-reminder family; the
 * react-email component this used to render was the last thing on the platform
 * with its own private email styling.
 */

import { renderEmail } from '@/lib/email/design';
import { sendEmail } from '@/lib/services/emailService';

export type SessionReminderRecipientType = 'student' | 'tutor';

/**
 * 'today' is the morning-of batch (08:00 Trinidad time); '10m' is the final
 * nudge just before the session starts. Both are queued exactly like 24h/1h.
 */
export type SessionReminderType = '24h' | '1h' | 'today' | '10m';

export interface ReminderEmailPayload {
  recipientEmail: string;
  recipientType: SessionReminderRecipientType;
  reminderType: SessionReminderType;
  sessionStartAt: string;
  durationMinutes: number;
  subjectName: string;
  tutorName: string;
  studentName: string;
  joinUrl: string;
  cancelOrRescheduleUrl: string;
}

export interface ReminderEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function leadTime(reminderType: SessionReminderType): string {
  switch (reminderType) {
    case '24h':
      return '24 hours';
    case '1h':
      return '1 hour';
    case '10m':
      return '10 minutes';
    case 'today':
    default:
      return 'today';
  }
}

/** Headline copy, since "coming up in today" does not read. */
export function reminderHeadline(reminderType: SessionReminderType): string {
  switch (reminderType) {
    case 'today':
      return 'Your session is today';
    case '10m':
      return 'Your session starts in 10 minutes';
    case '24h':
      return 'Your session starts in 24 hours';
    case '1h':
    default:
      return 'Your session starts in 1 hour';
  }
}

/** The glyph in the badge: the lead time, which is the whole point of the email. */
function badgeFor(reminderType: SessionReminderType): string {
  switch (reminderType) {
    case '24h':
      return '24h';
    case '1h':
      return '1h';
    case '10m':
      return '10m';
    case 'today':
    default:
      return 'Today';
  }
}

function buildSubject(payload: ReminderEmailPayload): string {
  switch (payload.reminderType) {
    case 'today':
      return `Today: your ${payload.subjectName} session`;
    case '10m':
      return `Starting soon: your ${payload.subjectName} session begins in 10 minutes`;
    case '24h':
      return `Reminder: your ${payload.subjectName} session starts in 24 hours`;
    case '1h':
    default:
      return `Reminder: your ${payload.subjectName} session starts in 1 hour`;
  }
}

/**
 * Trinidad wall-clock, always.
 *
 * This string is built server-side, so without the explicit zone a UTC host
 * prints every time four hours off for every recipient.
 */
function formatSessionDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Port_of_Spain',
    timeZoneName: 'short',
  }).format(new Date(date));
}

/** Sends a session reminder through Resend. */
export async function sendReminderEmail(
  payload: ReminderEmailPayload
): Promise<ReminderEmailResult> {
  const forStudent = payload.recipientType === 'student';
  const counterpartLabel = forStudent ? 'Tutor' : 'Student';
  const counterpartName = forStudent ? payload.tutorName : payload.studentName;
  const lead = leadTime(payload.reminderType);

  const { subject, html, text } = renderEmail({
    family: 'session-reminder',
    subject: buildSubject(payload),
    preheader:
      payload.reminderType === 'today'
        ? `Your iTutor ${payload.subjectName} session is today.`
        : `Your iTutor ${payload.subjectName} session starts in ${lead}.`,
    heading: reminderHeadline(payload.reminderType),
    intro: forStudent
      ? `Get ready for ${payload.subjectName} with ${payload.tutorName}.`
      : `${payload.studentName} is expecting you for ${payload.subjectName}.`,
    badge: badgeFor(payload.reminderType),
    blocks: [
      {
        kind: 'card',
        title: payload.subjectName,
        lines: [
          `${formatSessionDate(payload.sessionStartAt)} · ${payload.durationMinutes} minutes`,
          `${counterpartLabel}: ${counterpartName}`,
        ],
      },
    ],
    cta: { label: 'Join session', href: payload.joinUrl },
    secondary: { label: 'Cancel or reschedule', href: payload.cancelOrRescheduleUrl },
  });

  const result = await sendEmail({ to: payload.recipientEmail, subject, html, text });

  return { success: result.success, messageId: result.messageId, error: result.error };
}
