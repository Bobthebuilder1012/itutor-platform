// GET /api/cron/group-class-reminders
// Headers: Authorization: Bearer <CRON_SECRET>
//
// Runs every 5 minutes. Two reminders for group classes:
//
//   'today'  the day a class's SCHEDULE begins. Fires on the FIRST occurrence
//            of a recurrence row, so a weekly class sends this once rather
//            than every week. A tutor adding a second weekly slot to a running
//            class gets one for that new series too.
//
//   '10m'    every occurrence, with the join link.
//
// Dedupe is the insert itself (see lib/reminders/groupClassReminders): the
// unique index on (group_occurrence_id, recipient_email, reminder_type) means
// a re-run, redeploy or overlapping poll cannot resend. The window below is
// therefore deliberately wider than the poll interval — better to consider an
// occurrence twice and have the claim reject it than to miss one in a gap.

import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendGroupOccurrenceReminder } from '@/lib/reminders/groupClassReminders';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Poll every 5 minutes; look 12 ahead so nothing falls between polls. */
const TEN_MIN_WINDOW_MINUTES = 12;

/** Trinidad & Tobago is UTC-4 year round (no DST). */
const TT_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Hour (Trinidad time) the "starts today" batch goes out. */
const TODAY_HOUR_TT = 8;

/**
 * Whether the 10-minute reminder emails. Held in app_runtime_config so it can
 * be switched off without a deploy — a student in three daily classes gets a
 * lot of email from this, and the decision to pull it back should not wait on
 * a release. In-app notifications are unaffected.
 */
async function tenMinuteEmailEnabled(admin: ReturnType<typeof getServiceClient>): Promise<boolean> {
  const { data } = await admin
    .from('app_runtime_config')
    .select('value')
    .eq('key', 'group_10m_reminder_email')
    .maybeSingle();
  // Default ON, matching 1:1 behaviour. Set the key to 'false' to pull back.
  return String((data as any)?.value ?? 'true').toLowerCase() !== 'false';
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getServiceClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const now = new Date();
  const out = { ten_minute: 0, starts_today: 0, errors: [] as string[] };

  // NB: group_session_occurrences has no meeting_link column — not on
  // production, not on staging, not anywhere. Both selects below used to ask
  // for one, and PostgREST rejects the WHOLE select for a single unknown
  // column, so every run of both reminders failed with 42703 and no class
  // reminder was ever sent from this cron. The join link comes from the group.

  // ---------------------------------------------------------------
  // 1. TEN MINUTES OUT — every occurrence
  // ---------------------------------------------------------------
  try {
    if (await tenMinuteEmailEnabled(admin)) {
      const from = new Date(now.getTime() + 1 * 60_000).toISOString();
      const to = new Date(now.getTime() + TEN_MIN_WINDOW_MINUTES * 60_000).toISOString();

      const { data: occurrences, error } = await admin
        .from('group_session_occurrences')
        .select(`
          id, scheduled_start_at, status, cancelled_at,
          session:group_sessions!group_session_id ( id, group_id,
            group:groups!group_id ( id, name, tutor_id, meeting_link, archived_at ) )
        `)
        .gte('scheduled_start_at', from)
        .lte('scheduled_start_at', to)
        .neq('status', 'cancelled')
        .is('cancelled_at', null);

      if (error) throw error;

      for (const occ of occurrences ?? []) {
        const group = (occ as any).session?.group;
        if (!group || group.archived_at) continue;

        const res = await sendGroupOccurrenceReminder({
          admin,
          occurrenceId: (occ as any).id,
          groupId: group.id,
          groupName: group.name ?? 'Your class',
          tutorId: group.tutor_id ?? null,
          startAt: new Date((occ as any).scheduled_start_at),
          reminderType: '10m',
          joinUrl: group.meeting_link ?? null,
          appUrl,
        });
        out.ten_minute += res.sent;
      }
    }
  } catch (err) {
    console.error('[group-class-reminders] 10m failed:', err);
    out.errors.push(`10m: ${(err as Error)?.message}`);
  }

  // ---------------------------------------------------------------
  // 2. STARTS TODAY — first occurrence of a series only
  // ---------------------------------------------------------------
  // Only after 08:00 Trinidad time, and only for occurrences whose LOCAL
  // calendar date is today. Using UTC day boundaries would put an evening
  // session in the wrong day's batch.
  try {
    const ttNow = new Date(now.getTime() - TT_OFFSET_MS);
    if (ttNow.getUTCHours() >= TODAY_HOUR_TT) {
      const dayStartTt = Date.UTC(ttNow.getUTCFullYear(), ttNow.getUTCMonth(), ttNow.getUTCDate());
      const dayStartUtc = new Date(dayStartTt + TT_OFFSET_MS).toISOString();
      const dayEndUtc = new Date(dayStartTt + TT_OFFSET_MS + 24 * 3_600_000).toISOString();

      const { data: todays, error } = await admin
        .from('group_session_occurrences')
        .select(`
          id, group_session_id, scheduled_start_at, status, cancelled_at,
          session:group_sessions!group_session_id ( id, group_id, recurrence_type,
            group:groups!group_id ( id, name, tutor_id, meeting_link, archived_at ) )
        `)
        .gte('scheduled_start_at', dayStartUtc)
        .lt('scheduled_start_at', dayEndUtc)
        .neq('status', 'cancelled')
        .is('cancelled_at', null);

      if (error) throw error;

      for (const occ of todays ?? []) {
        const group = (occ as any).session?.group;
        if (!group || group.archived_at) continue;

        // A one-off session dropped into a running class is not a new
        // schedule, so it gets no "starts today" — the 10-minute nudge covers
        // it. Without this, a class with a weekly series plus a single extra
        // session would announce itself twice: SEA Exam Strategy Group on
        // staging has exactly that shape.
        if (String((occ as any).session?.recurrence_type ?? 'none').toLowerCase() === 'none') continue;

        // The rule: this must be the FIRST occurrence of its recurrence row.
        // A weekly class announces itself once, not every week. Checked by
        // asking whether any earlier occurrence exists for the same series.
        const { count: earlier } = await admin
          .from('group_session_occurrences')
          .select('id', { count: 'exact', head: true })
          .eq('group_session_id', (occ as any).group_session_id)
          .lt('scheduled_start_at', (occ as any).scheduled_start_at);

        if ((earlier ?? 0) > 0) continue;

        const res = await sendGroupOccurrenceReminder({
          admin,
          occurrenceId: (occ as any).id,
          groupId: group.id,
          groupName: group.name ?? 'Your class',
          tutorId: group.tutor_id ?? null,
          startAt: new Date((occ as any).scheduled_start_at),
          reminderType: 'today',
          joinUrl: group.meeting_link ?? null,
          appUrl,
        });
        out.starts_today += res.sent;
      }
    }
  } catch (err) {
    console.error('[group-class-reminders] today failed:', err);
    out.errors.push(`today: ${(err as Error)?.message}`);
  }

  console.log('[group-class-reminders]', out);
  return NextResponse.json({ ok: out.errors.length === 0, ...out });
}
