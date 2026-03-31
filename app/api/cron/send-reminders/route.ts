import { NextRequest, NextResponse } from 'next/server';
import { sendReminderEmail } from '@/lib/email/sendReminderEmail';
import { getServiceClient } from '@/lib/supabase/server';

type ReminderStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

interface SessionRow {
  id: string;
  booking_id: string;
  student_id: string;
  tutor_id: string;
  join_url: string | null;
  scheduled_start_at: string;
  duration_minutes: number;
  status: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
  full_name: string | null;
}

interface BookingSubjectRow {
  id: string;
  subject_id: string | null;
  subjects: {
    name?: string | null;
    label?: string | null;
  } | null;
}

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

function getAppUrl(request: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin ||
    'http://localhost:3000'
  );
}

function getFailureStatus(attempts: number): ReminderStatus {
  return attempts >= 3 ? 'failed' : 'pending';
}

async function processDueReminders(request: NextRequest) {
  const supabase = getServiceClient();
  const now = new Date().toISOString();
  const appUrl = getAppUrl(request);

  const { data: reminders, error: remindersError } = await supabase
    .from('session_reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .lt('attempts', 3)
    .order('send_at', { ascending: true })
    .limit(100);

  if (remindersError) {
    throw new Error(`Failed to load due reminders: ${remindersError.message}`);
  }

  if (!reminders || reminders.length === 0) {
    return { processed: 0, sent: 0, failed: 0, cancelled: 0 };
  }

  const sessionCache = new Map<string, SessionRow | null>();
  const bookingCache = new Map<string, BookingSubjectRow | null>();
  const profileCache = new Map<string, ProfileRow | null>();
  let sent = 0;
  let failed = 0;
  let cancelled = 0;

  for (const reminder of reminders) {
    try {
      let session = sessionCache.get(reminder.session_id);
      if (session === undefined) {
        const { data, error } = await supabase
          .from('sessions')
          .select('id, booking_id, student_id, tutor_id, join_url, scheduled_start_at, duration_minutes, status')
          .eq('id', reminder.session_id)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        session = (data as SessionRow | null) ?? null;
        sessionCache.set(reminder.session_id, session);
      }

      if (!session || session.status === 'CANCELLED') {
        await supabase
          .from('session_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id);
        cancelled += 1;
        continue;
      }

      let booking = bookingCache.get(session.booking_id);
      if (booking === undefined) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, subject_id, subjects:subject_id(name, label)')
          .eq('id', session.booking_id)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        booking = (data as BookingSubjectRow | null) ?? null;
        bookingCache.set(session.booking_id, booking);
      }

      const recipientId = reminder.recipient_type === 'student' ? session.student_id : session.tutor_id;
      const counterpartId = reminder.recipient_type === 'student' ? session.tutor_id : session.student_id;

      const profileIds = [recipientId, counterpartId];
      for (const profileId of profileIds) {
        if (profileCache.has(profileId)) {
          continue;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .eq('id', profileId)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        profileCache.set(profileId, (data as ProfileRow | null) ?? null);
      }

      const recipient = profileCache.get(recipientId);
      const counterpart = profileCache.get(counterpartId);
      const nextAttempts = reminder.attempts + 1;

      if (!recipient?.email || !counterpart?.full_name) {
        await supabase
          .from('session_reminders')
          .update({
            attempts: nextAttempts,
            status: getFailureStatus(nextAttempts),
          })
          .eq('id', reminder.id);
        failed += 1;
        continue;
      }

      const result = await sendReminderEmail({
        recipientEmail: recipient.email,
        recipientType: reminder.recipient_type,
        reminderType: reminder.reminder_type,
        sessionStartAt: session.scheduled_start_at,
        durationMinutes: session.duration_minutes,
        subjectName: booking?.subjects?.name || booking?.subjects?.label || 'Tutoring Session',
        tutorName:
          reminder.recipient_type === 'student'
            ? counterpart.full_name
            : recipient.full_name || 'Tutor',
        studentName:
          reminder.recipient_type === 'tutor'
            ? counterpart.full_name
            : recipient.full_name || 'Student',
        joinUrl: session.join_url || `${appUrl}/student/dashboard`,
        cancelOrRescheduleUrl: `${appUrl}/${reminder.recipient_type === 'student' ? 'student' : 'tutor'}/bookings/${session.booking_id}`,
      });

      if (result.success) {
        await supabase
          .from('session_reminders')
          .update({
            attempts: nextAttempts,
            status: 'sent',
          })
          .eq('id', reminder.id);
        sent += 1;
      } else {
        await supabase
          .from('session_reminders')
          .update({
            attempts: nextAttempts,
            status: getFailureStatus(nextAttempts),
          })
          .eq('id', reminder.id);
        failed += 1;
      }
    } catch (error) {
      console.error('Failed to process session reminder', {
        reminderId: reminder.id,
        sessionId: reminder.session_id,
        error,
      });

      const nextAttempts = reminder.attempts + 1;
      await supabase
        .from('session_reminders')
        .update({
          attempts: nextAttempts,
          status: getFailureStatus(nextAttempts),
        })
        .eq('id', reminder.id);
      failed += 1;
    }
  }

  return {
    processed: reminders.length,
    sent,
    failed,
    cancelled,
  };
}

export const dynamic = 'force-dynamic';

/**
 * Processes due session reminder emails for cron.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processDueReminders(request);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Session reminder cron failed', error);
    return NextResponse.json({ error: 'Failed to process reminders' }, { status: 500 });
  }
}

/**
 * Supports POST for pg_net-triggered cron invocations.
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
