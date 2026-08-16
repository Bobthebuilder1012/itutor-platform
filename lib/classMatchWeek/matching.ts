/**
 * The Class Match Week matching engine. Simple filtering, no scoring.
 *
 * A session matches when subject + level + availability all align, where
 * availability is compared against **the schedule of the regular paid class**,
 * not the taster session's time. The child must be able to attend the ongoing
 * class after the taster — matching them to a free session they can attend and
 * a paid class they cannot is worse than no match.
 *
 * **Subject and level are never relaxed. Only availability is.** The fallback
 * ladder runs:
 *
 *   1. `exact` — right subject, level and availability, with campaign sessions.
 *   2. `fallback_schedule` — right subject and level, wrong availability. The
 *      card names the actual slot(s) rather than silently showing them.
 *   3. `fallback_class` — right subject and level on a published paid class
 *      that has no campaign session at all. No taster to reserve; the card is
 *      the class itself.
 *
 * And if all three tiers are empty while any published session exists, every
 * campaign session is returned as `fallback_schedule` with a generic note —
 * the results page must never render empty at a parent's first contact with
 * the platform. Measured across level × availability, ~83% of combinations
 * return nothing, so the no-match path is the primary path, not an exception.
 *
 * This runs on the service client because anonymous visitors read ZERO rows
 * through RLS on groups/group_sessions — every SELECT policy is
 * `TO authenticated`, and RLS with no matching policy returns empty silently.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityBlock, DiscountTier } from './types';
import { classServesLevel, levelLabel, normaliseClassLevel, type CanonicalLevel } from './levels';
import {
  classMatchesAvailability,
  classWeeklySlots,
  formatSlot,
  type WeeklySlot,
} from './schedule';
import { subjectMatches } from './subjects';

export type MatchInput = {
  level: CanonicalLevel;
  subjects: string[];
  availability: AvailabilityBlock[];
};

/** One reservable taster inside a teacher card. */
export type SessionSlotCard = {
  sessionId: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  discountPercent: number;
  /** Null means unlimited — render no counter, never "0 spaces". */
  spacesRemaining: number | null;
};

/** One card per teacher per class, the results page's unit of render. */
export type TeacherCard = {
  tutorId: string;
  teacherName: string;
  avatarUrl: string | null;
  subject: string | null;
  levelLabels: string[];
  classId: string;
  className: string;
  priceMonthly: number | null;
  /** The paid class's weekly meetings, formatted. May be empty at fallback_class tier. */
  classSlots: string[];
  sessions: SessionSlotCard[];
  tier: 'exact' | 'fallback_schedule' | 'fallback_class';
  /** Present on fallback tiers: names the mismatch instead of silently showing it. */
  mismatchNote?: string;
};

export type MatchResult = {
  outcome: 'exact' | 'fallback' | 'none';
  cards: TeacherCard[];
  /** Every sessionId across returned cards, in render order — snapshotted onto the submission. */
  recommendedSessionIds: string[];
};

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

/** '16:00' → '4:00 PM', for mismatch copy. */
function startTimeLabel(time: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  const hh = m ? Number(m[1]) : 0;
  const mm = m ? Number(m[2]) : 0;
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = hh > 12 ? hh - 12 : hh === 0 ? 12 : hh;
  return `${h12}:${mm.toString().padStart(2, '0')} ${period}`;
}

const DAY_PLURAL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];

/**
 * "This class meets Sundays at 9:00 AM — outside the times you chose."
 *
 * A parent who answered "weekday evenings" must be TOLD the class is Sunday
 * morning, not silently shown it — a filter that appears ignored is a trust
 * failure at first contact.
 */
function scheduleMismatchNote(slots: WeeklySlot[]): string {
  if (slots.length === 0) {
    return 'This class has not posted its weekly schedule yet, so we could not compare it to the times you chose.';
  }
  const parts = slots.map((slot) => `${DAY_PLURAL[slot.day]} at ${startTimeLabel(slot.startTime)}`);
  const listed =
    parts.length === 1
      ? parts[0]!
      : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
  return `This class meets ${listed} — outside the times you chose.`;
}

const GENERIC_MISMATCH_NOTE =
  'Not an exact match for your answers — but this teacher is running a free session during Class Match Week.';

/** Reserved-seat counts per session, one grouped query rather than N. */
async function reservedCounts(
  admin: SupabaseClient,
  sessionIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (sessionIds.length === 0) return counts;

  const { data } = await admin
    .from('class_match_reservations')
    .select('session_id')
    .in('session_id', sessionIds)
    .eq('status', 'reserved');

  for (const row of data ?? []) {
    const id = (row as { session_id: string }).session_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** Weekly slots for each class, expanded and deduped from group_sessions. */
async function slotsByGroup(
  admin: SupabaseClient,
  groupIds: string[]
): Promise<Map<string, WeeklySlot[]>> {
  const map = new Map<string, WeeklySlot[]>();
  if (groupIds.length === 0) return map;

  const { data } = await admin
    .from('group_sessions')
    .select('group_id, recurrence_days, start_time, duration_minutes, ends_on')
    .in('group_id', groupIds);

  const rowsByGroup = new Map<
    string,
    Array<{ recurrence_days: number[] | null; start_time: string; duration_minutes: number | null; ends_on: string | null }>
  >();
  for (const row of data ?? []) {
    const r = row as {
      group_id: string;
      recurrence_days: number[] | null;
      start_time: string;
      duration_minutes: number | null;
      ends_on: string | null;
    };
    const bucket = rowsByGroup.get(r.group_id) ?? [];
    bucket.push(r);
    rowsByGroup.set(r.group_id, bucket);
  }

  for (const id of groupIds) {
    map.set(id, classWeeklySlots(rowsByGroup.get(id) ?? []));
  }
  return map;
}

/** Does the class pass the never-relaxed filters: level, and subject when any is selected? */
function passesSubjectAndLevel(group: GroupRow, input: MatchInput): boolean {
  if (!classServesLevel(group.form_level, input.level)) return false;
  if (input.subjects.length === 0) return true;
  return subjectMatches(group.subject, input.subjects);
}

/**
 * Run the campaign match for one completed questionnaire.
 *
 * Everything reads through the service client passed in — anonymous visitors
 * get zero rows under RLS, silently, so this must never run browser-side.
 */
export async function runMatch(admin: SupabaseClient, input: MatchInput): Promise<MatchResult> {
  const empty: MatchResult = { outcome: 'none', cards: [], recommendedSessionIds: [] };

  // 1. There is at most one live campaign; no campaign means no results page.
  const { data: campaign } = await admin
    .from('class_match_campaigns')
    .select('id')
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  if (!campaign) return empty;

  // 2. Every published session in it, with its class and teacher resolved.
  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select('id, group_id, tutor_id, title, scheduled_at, duration_minutes, max_attendees, discount_percent')
    .eq('campaign_id', campaign.id)
    .eq('status', 'published');
  const sessions = (sessionData ?? []) as SessionRow[];

  const sessionGroupIds = [...new Set(sessions.map((s) => s.group_id))];

  const { data: groupData } = sessionGroupIds.length
    ? await admin
        .from('groups')
        .select('id, name, subject, form_level, price_monthly, tutor_id')
        .in('id', sessionGroupIds)
    : { data: [] as GroupRow[] };
  const sessionGroups = (groupData ?? []) as GroupRow[];
  const groupById = new Map(sessionGroups.map((g) => [g.id, g]));

  // 3. Seats: campaign capacity is class_match_sessions.max_attendees (NULL =
  //    unlimited), never groups.max_students, which cannot express unlimited.
  const counts = await reservedCounts(admin, sessions.map((s) => s.id));

  const sessionsByGroup = new Map<string, SessionRow[]>();
  for (const session of sessions) {
    const bucket = sessionsByGroup.get(session.group_id) ?? [];
    bucket.push(session);
    sessionsByGroup.set(session.group_id, bucket);
  }

  // 4. The never-relaxed filters, applied to the classes behind the sessions.
  const eligibleGroups = sessionGroups.filter((g) => passesSubjectAndLevel(g, input));

  // 5. Availability, judged against the paid class's own weekly schedule.
  //    Fetched for ALL session groups because step 8 may need every one.
  const slots = await slotsByGroup(admin, sessionGroupIds);

  const exactGroups: GroupRow[] = [];
  const scheduleFallbackGroups: GroupRow[] = [];
  for (const group of eligibleGroups) {
    if (classMatchesAvailability(slots.get(group.id) ?? [], input.availability)) {
      exactGroups.push(group);
    } else {
      scheduleFallbackGroups.push(group);
    }
  }

  // 7. Paid classes with the right subject and level but no campaign session.
  //    price_monthly = 0 rows are suppressed — a TT$0 enrol CTA is the live
  //    pricing bug this campaign must not reproduce. (groups.pricing is the
  //    literal string 'free' on every row; price_monthly is the money column.)
  const { data: fallbackData } = await admin
    .from('groups')
    .select('id, name, subject, form_level, price_monthly, tutor_id')
    .eq('status', 'PUBLISHED')
    .eq('pricing_model', 'MONTHLY')
    .is('archived_at', null)
    .gt('price_monthly', 0);
  const fallbackClassGroups = ((fallbackData ?? []) as GroupRow[]).filter(
    (g) => !groupById.has(g.id) && passesSubjectAndLevel(g, input)
  );

  const fallbackSlots = await slotsByGroup(
    admin,
    fallbackClassGroups.map((g) => g.id)
  );

  // 8. The page must never be empty while any published session exists: with
  //    all three tiers empty, every campaign session comes back as a schedule
  //    fallback with a generic note.
  const nothingMatched =
    exactGroups.length === 0 &&
    scheduleFallbackGroups.length === 0 &&
    fallbackClassGroups.length === 0;
  const rescueGroups = nothingMatched ? sessionGroups : [];

  // Teacher names for every card in one query. coalesce(display_name,
  // full_name) — two eligible teachers have a handle in full_name.
  const tutorIds = [
    ...new Set(
      [...sessionGroups, ...fallbackClassGroups].map((g) => g.tutor_id).filter(Boolean)
    ),
  ];
  const { data: profileData } = tutorIds.length
    ? await admin
        .from('profiles')
        .select('id, display_name, full_name, avatar_url')
        .in('id', tutorIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map(((profileData ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const buildCard = (
    group: GroupRow,
    tier: TeacherCard['tier'],
    mismatchNote?: string
  ): TeacherCard => {
    const profile = profileById.get(group.tutor_id);
    const groupSlots =
      tier === 'fallback_class' ? fallbackSlots.get(group.id) ?? [] : slots.get(group.id) ?? [];
    const groupSessions =
      tier === 'fallback_class'
        ? []
        : (sessionsByGroup.get(group.id) ?? [])
            .slice()
            .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));

    return {
      tutorId: group.tutor_id,
      teacherName: profile?.display_name || profile?.full_name || 'iTutor teacher',
      avatarUrl: profile?.avatar_url ?? null,
      subject: group.subject,
      levelLabels: normaliseClassLevel(group.form_level).map(levelLabel),
      classId: group.id,
      className: group.name,
      priceMonthly: group.price_monthly,
      classSlots: groupSlots.map(formatSlot),
      sessions: groupSessions.map((s) => ({
        sessionId: s.id,
        title: s.title,
        scheduledAt: s.scheduled_at,
        durationMinutes: s.duration_minutes,
        discountPercent: s.discount_percent,
        spacesRemaining:
          s.max_attendees === null ? null : Math.max(0, s.max_attendees - (counts.get(s.id) ?? 0)),
      })),
      tier,
      ...(mismatchNote ? { mismatchNote } : {}),
    };
  };

  // 9. One card per teacher per class. Within the session-backed tiers, the
  //    soonest session leads. NEVER sorted by discount size — that turns the
  //    page into price comparison and pushes teachers to undercut each other.
  const soonest = (card: TeacherCard): string => card.sessions[0]?.scheduledAt ?? '9999';

  const exactCards = exactGroups
    .map((g) => buildCard(g, 'exact'))
    .sort((a, b) => soonest(a).localeCompare(soonest(b)));

  const scheduleFallbackCards = scheduleFallbackGroups
    .map((g) => buildCard(g, 'fallback_schedule', scheduleMismatchNote(slots.get(g.id) ?? [])))
    .sort((a, b) => soonest(a).localeCompare(soonest(b)));

  const rescueCards = rescueGroups
    .map((g) => buildCard(g, 'fallback_schedule', GENERIC_MISMATCH_NOTE))
    .sort((a, b) => soonest(a).localeCompare(soonest(b)));

  const fallbackClassCards = fallbackClassGroups
    .map((g) => buildCard(g, 'fallback_class'))
    .sort((a, b) => a.className.localeCompare(b.className));

  const cards = [...exactCards, ...scheduleFallbackCards, ...rescueCards, ...fallbackClassCards];

  // 10. recommendedSessionIds snapshots exactly what was shown, in order, so
  //     the export can reproduce the page a family saw.
  const recommendedSessionIds = cards.flatMap((card) => card.sessions.map((s) => s.sessionId));

  const outcome: MatchResult['outcome'] =
    exactCards.length > 0 ? 'exact' : cards.length > 0 ? 'fallback' : 'none';

  return { outcome, cards, recommendedSessionIds };
}
