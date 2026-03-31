import * as React from 'react';
import { Resend } from 'resend';
import SessionReminderEmail, {
  SessionReminderRecipientType,
  SessionReminderType,
} from '@/emails/SessionReminderEmail';

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

let resendClient: Resend | null = null;

function getResendClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not configured');
  }

  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }

  return resendClient;
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
  try {
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'iTutor <hello@myitutor.com>',
      to: payload.recipientEmail,
      subject: buildSubject(payload),
      react: React.createElement(SessionReminderEmail, payload),
    });

    if (error) {
      return {
        success: false,
        error: error.message || 'Failed to send reminder email',
      };
    }

    return {
      success: true,
      messageId: data?.id,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown reminder email error',
    };
  }
}
