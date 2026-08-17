/**
 * Class Match Week — explore, the full-week catalogue (docs 04 §4.5, adapted
 * to the authed flow).
 *
 * Auth gate matches results: the anonymous phase of the funnel ends at Q5, so
 * no signed-in user means signup, not the landing page. Claiming the token row
 * is NOT done here — results owns that at first authed load; this page only
 * READS the submission (token cookie first, else the newest row claimed onto
 * the account) to prefill the filters.
 *
 * Everything is fetched ONCE, server-side, through the service client —
 * platform SELECT policies are `TO authenticated` and RLS with no matching
 * policy returns zero rows silently, so portal reads never run browser-side.
 * The query is modelled on runMatch's (lib/classMatchWeek/matching.ts) but
 * WITHOUT the level/subject/availability filters: this page shows the whole
 * published catalogue and <ExploreView> filters it client-side.
 */

import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign, getSubmissionByToken } from '@/lib/classMatchWeek/portalData';
import { classWeeklySlots, formatSlot } from '@/lib/classMatchWeek/schedule';
import {
  levelLabel,
  normaliseClassLevel,
  QUESTIONNAIRE_LEVELS,
  type CanonicalLevel,
} from '@/lib/classMatchWeek/levels';
import type { ClassMatchSubmission, DiscountTier } from '@/lib/classMatchWeek/types';
import CountdownPill from '@/components/classMatchWeek/portal/CountdownPill';
import ExploreView, {
  type ExploreCardData,
  type ExploreTimeBand,
} from '@/components/classMatchWeek/portal/ExploreView';

export const dynamic = 'force-dynamic';

type SessionRow = {
  id: string;
  group_id: string;
  tutor_id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  max_attendees: number | null;
  discount_percent: DiscountTier;
};

type GroupRow = {
  id: string;
  name: string;
  subject: string | null;
  form_level: string | null;
  price_monthly: number | null;
  tutor_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

/**
 * Availability blocks answer "when can you attend the ONGOING class"; the
 * explore time filter asks "when does the SESSION start". The band is the
 * honest overlap between the two, so prefill maps block → band.
 */
const BLOCK_TO_BAND: Record<string, ExploreTimeBand> = {
  weekday_afternoon: 'afternoon',
  weekday_evening: 'evening',
  saturday_morning: 'morning',
  saturday_afternoon: 'afternoon',
  sunday_morning: 'morning',
  sunday_afternoon: 'afternoon',
};

function CampaignBadge() {
  return (
    <span className="inline-flex rounded-full bg-brand-soft px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-brand-deep">
      Class Match Week
    </span>
  );
}

export default async function ClassMatchWeekExplorePage() {
  // Auth gate, exactly like results: signup now sits between the
  // questionnaire and everything session-shaped.
  const supabase = await getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/class-match-week/signup');

  const admin = getServiceClient();

  const campaign = await getLiveCampaign(admin);
  if (!campaign) redirect('/class-match-week');

  // The submission is read for FILTER PREFILL only — claiming happens on the
  // results page. Token cookie first; a user who cleared cookies (or signed in
  // on another device) falls back to the newest row claimed onto the account.
  const cookieStore = await cookies();
  const token = cookieStore.get('cmw_token')?.value;
  let submission: ClassMatchSubmission | null = token
    ? await getSubmissionByToken(admin, token)
    : null;
  if (!submission) {
    const { data } = await admin
      .from('class_match_submissions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    submission = (data as ClassMatchSubmission | null) ?? null;
  }

  // ── The whole published catalogue, modelled on runMatch's query shape ──────

  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select(
      'id, group_id, tutor_id, title, scheduled_at, duration_minutes, max_attendees, discount_percent'
    )
    .eq('campaign_id', campaign.id)
    .eq('status', 'published');
  const sessions = (sessionData ?? []) as SessionRow[];

  const groupIds = [...new Set(sessions.map((s) => s.group_id))];

  // Column list copied deliberately — price_monthly is missing from at least
  // one existing select list elsewhere, which is the live TT$0 pricing bug.
  const { data: groupData } = groupIds.length
    ? await admin
        .from('groups')
        .select('id, name, subject, form_level, price_monthly, tutor_id')
        .in('id', groupIds)
    : { data: [] as GroupRow[] };
  const groupById = new Map(((groupData ?? []) as GroupRow[]).map((g) => [g.id, g]));

  // Seats: campaign capacity is class_match_sessions.max_attendees (NULL =
  // unlimited). Reserved counts in one grouped query, not N.
  const reservedCountBySession = new Map<string, number>();
  if (sessions.length > 0) {
    const { data: countData } = await admin
      .from('class_match_reservations')
      .select('session_id')
      .in('session_id', sessions.map((s) => s.id))
      .eq('status', 'reserved');
    for (const row of (countData ?? []) as Array<{ session_id: string }>) {
      reservedCountBySession.set(
        row.session_id,
        (reservedCountBySession.get(row.session_id) ?? 0) + 1
      );
    }
  }

  // The paid class's weekly slots, for the class line on each card. NEVER
  // groups.timezone ('UTC' on every row, wrong) — group_sessions rows are
  // Trinidad wall-clock and classWeeklySlots treats them as such.
  const slotsByGroup = new Map<string, string[]>();
  if (groupIds.length > 0) {
    const { data: slotData } = await admin
      .from('group_sessions')
      .select('group_id, recurrence_days, start_time, duration_minutes, ends_on')
      .in('group_id', groupIds);
    const rowsByGroup = new Map<
      string,
      Array<{
        recurrence_days: number[] | null;
        start_time: string;
        duration_minutes: number | null;
        ends_on: string | null;
      }>
    >();
    for (const raw of slotData ?? []) {
      const row = raw as {
        group_id: string;
        recurrence_days: number[] | null;
        start_time: string;
        duration_minutes: number | null;
        ends_on: string | null;
      };
      const bucket = rowsByGroup.get(row.group_id) ?? [];
      bucket.push(row);
      rowsByGroup.set(row.group_id, bucket);
    }
    for (const id of groupIds) {
      slotsByGroup.set(id, classWeeklySlots(rowsByGroup.get(id) ?? []).map(formatSlot));
    }
  }

  // Teacher names: coalesce(display_name, full_name) — two eligible teachers
  // carry a handle in full_name.
  const tutorIds = [...new Set(sessions.map((s) => s.tutor_id).filter(Boolean))];
  const { data: profileData } = tutorIds.length
    ? await admin
        .from('profiles')
        .select('id, display_name, full_name, avatar_url')
        .in('id', tutorIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map(((profileData ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  // The signed-in user's live reservations, for per-session Reserved states.
  const { data: reservationData } = await admin
    .from('class_match_reservations')
    .select('session_id')
    .eq('user_id', user.id)
    .eq('status', 'reserved');
  const reservedSessionIds = [
    ...new Set(
      ((reservationData ?? []) as Array<{ session_id: string }>).map((r) => r.session_id)
    ),
  ];

  // ── One card per teacher per class, soonest session leading ────────────────

  const sessionsByGroup = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const bucket = sessionsByGroup.get(session.group_id) ?? [];
    bucket.push(session);
    sessionsByGroup.set(session.group_id, bucket);
  }

  const cards: ExploreCardData[] = [...sessionsByGroup.entries()]
    .map(([groupId, groupSessions]) => {
      const group = groupById.get(groupId);
      const tutorId = group?.tutor_id ?? groupSessions[0]!.tutor_id;
      const profile = profileById.get(tutorId);
      return {
        tutorId,
        teacherName: profile?.display_name || profile?.full_name || 'iTutor teacher',
        avatarUrl: profile?.avatar_url ?? null,
        subject: group?.subject ?? null,
        levelLabels: normaliseClassLevel(group?.form_level).map(levelLabel),
        classId: groupId,
        className: group?.name ?? '',
        priceMonthly: group?.price_monthly ?? null,
        classSlots: slotsByGroup.get(groupId) ?? [],
        formLevel: group?.form_level ?? null,
        sessions: groupSessions
          .slice()
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
          .map((s) => ({
            sessionId: s.id,
            title: s.title,
            scheduledAt: s.scheduled_at,
            durationMinutes: s.duration_minutes,
            discountPercent: s.discount_percent,
            spacesRemaining:
              s.max_attendees === null
                ? null
                : Math.max(0, s.max_attendees - (reservedCountBySession.get(s.id) ?? 0)),
          })),
      };
    })
    .sort((a, b) =>
      (a.sessions[0]?.scheduledAt ?? '9999').localeCompare(b.sessions[0]?.scheduledAt ?? '9999')
    );

  // ── Filter prefill from the submission (day tabs deliberately excluded) ────

  const validLevels = new Set<string>(QUESTIONNAIRE_LEVELS.map((l) => l.value));
  const prefillLevel: CanonicalLevel | null =
    submission?.level && validLevels.has(submission.level) ? submission.level : null;
  const prefillSubjects = submission?.subjects ?? [];
  const prefillBands = [
    ...new Set(
      (submission?.availability ?? [])
        .map((block) => BLOCK_TO_BAND[block])
        .filter((band): band is ExploreTimeBand => Boolean(band))
    ),
  ];

  return (
    <main className="max-w-6xl mx-auto space-y-6">
      <div className="w-full">
        <div className="flex items-center justify-between gap-3">
          <CountdownPill startsAt={campaign.starts_at} endsAt={campaign.ends_at} size="sm" />
        </div>
        <div className="mt-6">
          <CampaignBadge />
        </div>
        <h1 className="mt-3 text-2xl lg:text-3xl font-bold text-ink">Explore the week</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          Every free session running this Class Match Week — pick a day, or filter by level,
          subject and time.
        </p>

        <ExploreView
          campaignStartsAt={campaign.starts_at}
          campaignEndsAt={campaign.ends_at}
          cards={cards}
          reservedSessionIds={reservedSessionIds}
          prefillLevel={prefillLevel}
          prefillSubjects={prefillSubjects}
          prefillBands={prefillBands}
          serverNow={Date.now()}
        />

        <p className="mt-8 text-center text-xs text-ink-muted">
          Looking for your picks?{' '}
          <Link
            href="/class-match-week/results"
            className="font-semibold text-brand-deep underline underline-offset-2"
          >
            Back to your matches
          </Link>
        </p>
      </div>
    </main>
  );
}
