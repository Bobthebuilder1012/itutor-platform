import * as React from 'react';
import SessionReminderEmail, {
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
  return `Reminder: your ${payload.subjectName} session starts in ${payload.reminderType === '24h' ? '24 hours' : '1 hour'}`;
}

/**
 * Sends a session reminder email through Resend.
 */
export async function sendReminderEmail(
  payload: ReminderEmailPayload
): Promise<ReminderEmailResult> {
  const subject = buildSubject(payload);
  const result = await sendEmail({
    to: payload.recipientEmail,
    subject,
    react: (
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
    ),
  });

  return {
    success: result.success,
    messageId: result.messageId,
    error: result.error,
  };
}
