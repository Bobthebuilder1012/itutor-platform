import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/services/emailService';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';
import { reminderEmail, type ReminderKind } from '@/lib/classMatchWeek/reminderEmails';
import type { ClassMatchSession } from '@/lib/classMatchWeek/types';

export const dynamic = 'force-dynamic';

/**
 * Class Match Week reminders — 24 hours and 1 hour before each taster
 * (docs 04 §4.4).
 *
 * Email is the campaign's only contact channel: it collects an address and no
 * phone number. These reminders are the only thing between a reservation and
 * attendance, and attendance is what the campaign is measured on.
 *
 * WHY IT DERIVES THE DUE SET RATHER THAN READING A QUEUE. Nothing needs
 * scheduling here. The taster times are known and the seat holders are known, so
 * the only fact the cron cannot work out for itself is what it has already sent
 * — which is the whole content of class_match_reminder_sends. The UNIQUE
 * (session_id, user_id, kind) on that table is the deduplication; two
 * overlapping runs would otherwise both decide a reminder was unsent.
 *
 * WHY THE WINDOWS ARE GENEROUS. Running every five minutes and looking for
 * sessions "24 hours away" to the minute would miss any session whose window
 * fell between two runs — a cold start, a deploy, a slow query. Each window is
 * an hour wide and the ledger prevents the overlap from mattering: late is
 * recoverable, twice is not.
 *
 * Honours the kill switch for free — no live campaign means nothing to remind
 * anyone about, and CLASS_MATCH_WEEK_ENABLED=false reports exactly that.
 */

/** Wide enough that a missed run recovers on the next one. */
const WINDOWS: Record<ReminderKind, { fromMs: number; toMs: number }> = {
  // 23–24 hours out.
  '24h': { fromMs: 23 * 3_600_000, toMs: 24 * 3_600_000 },
  // 30–90 minutes out. Not 0–60: a reminder that lands as the session starts is
  // no use, and the join window opens two hours ahead anyway.
  '1h': { fromMs: 30 * 60_000, toMs: 90 * 60_000 },
};

function isAuthorized(request: NextRequest): boolean {
  return request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
}

function getAppUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
}

type Result = {
  ok: boolean;
  campaign: string | null;
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result: Result = {
    ok: true,
    campaign: null,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const admin = getServiceClient();
    const appUrl = getAppUrl(request);

    const campaign = await getLiveCampaign(admin);
    if (!campaign) return NextResponse.json({ ...result, reason: 'no_live_campaign' });
    result.campaign = campaign.id;

    const now = Date.now();

    for (const kind of Object.keys(WINDOWS) as ReminderKind[]) {
      const { fromMs, toMs } = WINDOWS[kind];
      const from = new Date(now + fromMs).toISOString();
      const to = new Date(now + toMs).toISOString();

      // Published and not cancelled. A draft taster is not visible to anyone
      // and a cancelled one must never produce a reminder — the cancellation
      // floor exists so the platform is not what sends a family to an empty
      // room.
      const { data: sessionRows, error: sessionError } = await admin
        .from('class_match_sessions')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'published')
        .is('cancelled_at', null)
        .gte('scheduled_at', from)
        .lte('scheduled_at', to);

      if (sessionError) {
        result.ok = false;
        result.errors.push(`[${kind}] session query: ${sessionError.message}`);
        continue;
      }

      const sessions = (sessionRows ?? []) as ClassMatchSession[];
      if (sessions.length === 0) continue;

      const sessionIds = sessions.map((s) => s.id);

      // Everything needed for every session in this window, in four queries
      // rather than four per session.
      const [{ data: reservations }, { data: alreadySent }, { data: groups }, { data: teachers }] =
        await Promise.all([
          admin
            .from('class_match_reservations')
            .select('session_id, user_id')
            .in('session_id', sessionIds)
            .eq('status', 'reserved'),
          admin
            .from('class_match_reminder_sends')
            .select('session_id, user_id')
            .in('session_id', sessionIds)
            .eq('kind', kind),
          admin
            .from('groups')
            .select('id, name')
            .in('id', [...new Set(sessions.map((s) => s.group_id))]),
          admin
            .from('profiles')
            .select('id, display_name, full_name')
            .in('id', [...new Set(sessions.map((s) => s.tutor_id))]),
        ]);

      const sentKeys = new Set(
        ((alreadySent ?? []) as Array<{ session_id: string; user_id: string }>).map(
          (r) => `${r.session_id}|${r.user_id}`
        )
      );
      const classNameById = new Map(
        ((groups ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name])
      );
      const teacherNameById = new Map(
        (
          (teachers ?? []) as Array<{
            id: string;
            display_name: string | null;
            full_name: string | null;
          }>
        ).map((p) => [p.id, p.display_name || p.full_name || 'your teacher'])
      );

      const due = ((reservations ?? []) as Array<{ session_id: string; user_id: string }>).filter(
        (r) => !sentKeys.has(`${r.session_id}|${r.user_id}`)
      );
      if (due.length === 0) continue;

      // Recipients, resolved once for the whole window.
      const { data: recipients } = await admin
        .from('profiles')
        .select('id, email, display_name, full_name')
        .in('id', [...new Set(due.map((r) => r.user_id))]);
      const recipientById = new Map(
        (
          (recipients ?? []) as Array<{
            id: string;
            email: string | null;
            display_name: string | null;
            full_name: string | null;
          }>
        ).map((p) => [p.id, p])
      );

      const sessionById = new Map(sessions.map((s) => [s.id, s]));

      for (const row of due) {
        result.considered += 1;

        const session = sessionById.get(row.session_id);
        const recipient = recipientById.get(row.user_id);
        if (!session || !recipient?.email) {
          // No address is not a failure to retry — it is a signup that never
          // had one, and it will never gain one by trying again.
          result.skipped += 1;
          continue;
        }

        const firstName = (recipient.display_name || recipient.full_name || '')
          .trim()
          .split(/\s+/)[0];

        const { subject, html, text } = reminderEmail(
          {
            appUrl,
            session,
            className: classNameById.get(session.group_id) ?? 'the class',
            teacherName: teacherNameById.get(session.tutor_id) ?? 'your teacher',
            discountPercent: session.discount_percent,
            recipientName: firstName || null,
          },
          kind
        );

        const send = await sendEmail({ to: recipient.email, subject, html, text });
        if (!send.success) {
          result.failed += 1;
          result.errors.push(`[${kind}] ${row.session_id}/${row.user_id}: ${send.error}`);
          // No ledger row, so the next run retries. That is the right way round:
          // a reminder sent twice is an annoyance, one never sent is a family
          // who does not turn up.
          continue;
        }

        // Written AFTER a successful send, and a conflict is a no-op — another
        // run got there first, which is exactly what the constraint is for.
        const { error: ledgerError } = await admin
          .from('class_match_reminder_sends')
          .upsert(
            { session_id: row.session_id, user_id: row.user_id, kind },
            { onConflict: 'session_id,user_id,kind', ignoreDuplicates: true }
          );
        if (ledgerError) {
          // The mail is already gone. Log loudly — an unwritable ledger means
          // the next run sends it again, and this line is the only warning.
          console.error('[cron class-match-reminders] ledger write failed', ledgerError);
          result.errors.push(`[${kind}] ledger: ${ledgerError.message}`);
        }
        result.sent += 1;
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[cron class-match-reminders]', err);
    return NextResponse.json(
      { ...result, ok: false, error: err instanceof Error ? err.message : 'failed' },
      { status: 500 }
    );
  }
}
