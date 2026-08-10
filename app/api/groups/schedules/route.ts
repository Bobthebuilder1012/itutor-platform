// GET /api/groups/schedules?ids=a,b,c
// Returns each group's recurring schedule AND whether it can be preordered.
//
// Why server-side: group_sessions' RLS SELECT policy subqueries group_members,
// whose own policy references group_members — so Postgres aborts with 42P17
// "infinite recursion detected in policy for relation group_members" for anyone
// who isn't the tutor. Every student-side schedule read therefore failed and the
// UI fell back to "Schedule TBD" even though the tutor had set a weekly session.
// Occurrences are RLS-scoped the same way. Same shape/auth as
// /api/groups/member-counts: service client, login required.
//
// THIS ROUTE SERVES TWO CONTRACTS, reconciled here rather than picked between:
//
//   entries[]                    the resolved weekly pattern, derived from
//                                schedule_data + recurrence rules + dated
//                                occurrences, so a class scheduled as
//                                individual dates still shows a schedule.
//   display / days / sessionLength
//   preorder / preorderReady     Secure your spot. Decided here for the same
//                                reason the schedule is, and so the CTA and the
//                                route that takes the money read one rule set.
//
// Both lines of work rewrote this endpoint with incompatible return shapes
// (an array per group vs an object per group). Returning the union keeps every
// caller working; dropping either side would have silently disabled preorders
// or reverted card schedules to "Schedule TBD".

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import {
  resolveScheduleEntries,
  sessionPatternsToDisplay,
  sessionPatternWeekdays,
  sessionPatternsDuration,
  type ScheduleEntry,
  type SessionPattern,
} from '@/lib/utils/scheduleFormat';
import { preorderEligibility, computeReleaseDate, isShortClass } from '@/lib/payments/secureSpot';

export const dynamic = 'force-dynamic';

export type GroupSchedule = {
  /** Resolved weekly pattern, including classes scheduled as individual dates. */
  entries: ScheduleEntry[];
  display: string | null;
  days: number[];
  sessionLength: number | null;
  /**
   * Whether this class can be preordered, and the dates that go with it.
   */
  preorder: {
    eligible: boolean;
    /** Why not, when it isn't: no_schedule | already_started | too_far_out | not_enabled */
    reason?: string;
    firstSession?: string;
    releaseDate?: string;
    shortClass?: boolean;
  };
  /**
   * Whether the SCHEDULE would allow preorders, ignoring whether the tutor has
   * switched them on. The tutor's own settings screen needs this: asking
   * `preorder.eligible` there is circular, since it is false precisely because
   * they haven't enabled it yet.
   */
  preorderReady: { ok: boolean; reason?: string; firstSession?: string };
};

const PATTERN_COLUMNS =
  'group_id, recurrence_type, recurrence_days, start_time, duration_minutes, starts_on, ends_on';

function isSchemaMismatch(error: any): boolean {
  const code = String(error?.code ?? '');
  const msg = String(error?.message ?? '').toLowerCase();
  return (
    code === '42703' ||
    code === '42P01' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    code === 'PGRST201' ||
    msg.includes('does not exist') ||
    msg.includes('could not find') ||
    msg.includes('could not embed')
  );
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ids = req.nextUrl.searchParams.get('ids');
    if (!ids) return NextResponse.json({ schedules: {} });

    const groupIds = Array.from(
      new Set(ids.split(',').map((s) => s.trim()).filter(Boolean))
    ).slice(0, 100);
    if (groupIds.length === 0) return NextResponse.json({ schedules: {} });

    const admin = getServiceClient();

    // schedule_data is production-only (absent on staging), and asking for a
    // column that isn't there costs the whole select — so it is requested
    // separately from the columns every environment has.
    let scheduleDataById = new Map<string, string | null>();
    const { data: groupRows, error: groupErr } = await admin
      .from('groups')
      .select('id, secure_spot_enabled, end_date, schedule_data')
      .in('id', groupIds);

    let groups: any[] | null = groupRows;
    if (groupErr && isSchemaMismatch(groupErr)) {
      ({ data: groups } = await admin
        .from('groups')
        .select('id, secure_spot_enabled, end_date')
        .in('id', groupIds));
    }
    scheduleDataById = new Map(
      (groups ?? []).map((g: any) => [String(g.id), g.schedule_data ?? null])
    );
    const groupById = new Map((groups ?? []).map((g: any) => [g.id, g]));

    // Sessions carry the recurrence rule; the embedded occurrences cover classes
    // scheduled as individual dates with no rule (recurrence_type NONE).
    let sessionRows: any[] | null = null;
    let sessionsError: any = null;

    ({ data: sessionRows, error: sessionsError } = await admin
      .from('group_sessions')
      .select(
        `${PATTERN_COLUMNS}, group_session_occurrences(scheduled_start_at, scheduled_end_at, cancelled_at, status)`
      )
      .in('group_id', groupIds)
      .order('starts_on', { ascending: true }));

    // Older deployments predate starts_on/ends_on, or cannot embed occurrences.
    // Degrade in steps rather than 500ing.
    if (sessionsError && isSchemaMismatch(sessionsError)) {
      ({ data: sessionRows, error: sessionsError } = await admin
        .from('group_sessions')
        .select(PATTERN_COLUMNS)
        .in('group_id', groupIds));
    }
    if (sessionsError && isSchemaMismatch(sessionsError)) {
      ({ data: sessionRows, error: sessionsError } = await admin
        .from('group_sessions')
        .select('group_id, recurrence_type, recurrence_days, start_time, duration_minutes')
        .in('group_id', groupIds));
    }
    if (sessionsError) {
      console.error('[groups/schedules] sessions error:', sessionsError.message ?? sessionsError);
      return NextResponse.json({ schedules: {} });
    }

    const byGroup = new Map<string, { patterns: SessionPattern[]; occurrences: any[] }>();
    for (const row of sessionRows ?? []) {
      const key = String(row.group_id);
      const bucket = byGroup.get(key) ?? { patterns: [], occurrences: [] };
      bucket.patterns.push(row as SessionPattern);
      bucket.occurrences.push(...((row.group_session_occurrences as any[]) ?? []));
      byGroup.set(key, bucket);
    }

    const schedules: Record<string, GroupSchedule> = {};
    for (const groupId of groupIds) {
      const bucket = byGroup.get(groupId);
      const patterns = bucket?.patterns ?? [];
      const group = groupById.get(groupId);

      const entries = resolveScheduleEntries({
        scheduleData: scheduleDataById.get(groupId) ?? null,
        sessionRows: patterns,
        occurrences: bucket?.occurrences ?? [],
      });

      const display = sessionPatternsToDisplay(patterns);

      const eligibility = preorderEligibility(patterns);
      let preorder: GroupSchedule['preorder'];

      // A class is only preorderable if the tutor opened preorders on it.
      if (!group?.secure_spot_enabled) {
        preorder = { eligible: false, reason: 'not_enabled' };
      } else if (!eligibility.eligible) {
        preorder = { eligible: false, reason: eligibility.reason };
      } else {
        const endDate = group.end_date ?? null;
        preorder = {
          eligible: true,
          firstSession: eligibility.firstSession.toISOString(),
          releaseDate: computeReleaseDate({ firstSession: eligibility.firstSession, endDate }),
          shortClass: isShortClass({ firstSession: eligibility.firstSession, endDate }),
        };
      }

      const preorderReady = eligibility.eligible
        ? { ok: true, firstSession: eligibility.firstSession.toISOString() }
        : { ok: false, reason: eligibility.reason };

      // Skip only classes with nothing at all to say.
      if (entries.length === 0 && !display && !preorder.eligible && !preorderReady.ok) continue;

      schedules[groupId] = {
        entries,
        display,
        days: sessionPatternWeekdays(patterns),
        sessionLength: sessionPatternsDuration(patterns),
        preorder,
        preorderReady,
      };
    }

    return NextResponse.json({ schedules });
  } catch (err) {
    console.error('[GET /api/groups/schedules]', err);
    return NextResponse.json({ schedules: {} });
  }
}
