export interface ReminderEmailPayload {
  recipientEmail: string;
  recipientType: string;
  reminderType: string;
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

export async function sendReminderEmail(
  payload: ReminderEmailPayload
): Promise<ReminderEmailResult> {
  console.log(`[EMAIL BLOCKED] reminder to=${payload.recipientEmail}`);
  return { success: true, messageId: 'disabled' };
}
