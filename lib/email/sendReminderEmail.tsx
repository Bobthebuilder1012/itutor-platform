import * as React from 'react';
import { render } from '@react-email/components';
import SessionReminderEmail, {
  reminderHeadline,
  SessionReminderRecipientType,
  SessionReminderType,
} from '@/emails/SessionReminderEmail';
import { sendEmail } from '@/lib/services/emailService';

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
 * Sends a session reminder email through Resend.
 *
 * NOTE ON A PREVIOUS BUG: this used to pass `react: <Component />` to
 * sendEmail(), but sendEmail's contract is `html: string` and it ignores
 * any other key — so `html` arrived undefined and every reminder failed at
 * the Resend call. The component is now rendered to HTML here.
 *
 * There was also a `sendReminderEmail.ts` stub alongside this file that
 * merely logged "[EMAIL BLOCKED]" and returned success. Because TypeScript
 * resolves `.ts` before `.tsx` while Next's webpack resolves `.tsx` first,
 * type-checking and runtime disagreed about which module was in play. The
 * stub has been deleted; this is the only implementation.
 */
export async function sendReminderEmail(
  payload: ReminderEmailPayload
): Promise<ReminderEmailResult> {
  const subject = buildSubject(payload);

  let html: string;
  try {
    html = await render(
      <SessionReminderEmail
        recipientType={payload.recipientType}
        reminderType={payload.reminderType}
        subjectName={payload.subjectName}
        tutorName={payload.tutorName}
        studentName={payload.studentName}
        sessionStartAt={payload.sessionStartAt}
        durationMinutes={payload.durationMinutes}
        joinUrl={payload.joinUrl}
        cancelOrRescheduleUrl={payload.cancelOrRescheduleUrl}
      />
    );
  } catch (err) {
    // Rendering failing would otherwise send an empty email body.
    return {
      success: false,
      error: `Failed to render reminder email: ${(err as Error).message}`,
    };
  }

  const result = await sendEmail({
    to: payload.recipientEmail,
    subject,
    html,
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}

/** Exported for tests/diagnostics — the headline used in the body. */
export { reminderHeadline };
