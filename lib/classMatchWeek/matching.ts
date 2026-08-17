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

/**
 * One matched teacher, as the results page renders them.
 *
 * `tier` is retained with its original vocabulary because it drives the card's
 * layout, not the ranking: a card with bookable sessions renders Reserve
 * ('exact'), a subject-matching class with no campaign session renders View
 * class ('fallback_class'). Suitability lives in `score` and `reasons`.
 */
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
  /** Names a soft mismatch (level or timing) instead of silently showing it. */
  mismatchNote?: string;
  /** Ranking weight. Higher is a better fit; never used to exclude. */
  score: number;
  /** Plain-language reasons this teacher was surfaced, best first. */
  reasons: string[];
  levelMatch: boolean;
  availabilityMatch: boolean;
};

/** Alias that says what the output actually is: a ranked set of teachers. */
export type TutorMatch = TeacherCard;

export type MatchResult = {
  /**
   * 'matched' whenever the chosen subject is taught by anyone.
   * 'subject_unsupported' is the ONLY empty outcome — it means the platform
   * has no teacher for that subject at all, which is a supply fact worth
   * telling the family plainly and worth recording as demand.
   */
  outcome: 'matched' | 'subject_unsupported';
  cards: TeacherCard[];
  /** Subjects the visitor chose that are taught by someone. */
  matchedSubjects: string[];
  /** Subjects the visitor chose that nobody teaches. */
  unsupportedSubjects: string[];
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

/**
 * The ONE hard filter: does this class teach a subject the visitor chose?
 *
 * Level and availability used to exclude here too, and between them they
 * emptied roughly five results pages in six — the measured level x
 * availability grid returned nothing in ~83% of combinations. They are now
 * ranking signals (see `scoreClass`), so a family who picks a supported
 * subject always gets teachers, and "no results" means exactly one thing:
 * nobody on the platform teaches that subject.
 *
 * An empty subject selection cannot happen through the questionnaire (Q2 is
 * required); if it ever does, everything passes rather than nothing.
 */
function passesSubject(group: GroupRow, input: MatchInput): boolean {
  if (input.subjects.length === 0) return true;
  return subjectMatches(group.subject, input.subjects);
}

/** Ranking weights. Relative size is the design; absolute values are arbitrary. */
const SCORE = {
  /** A bookable free session is the campaign's entire proposition. */
  hasSession: 100,
  /** Right level is the strongest suitability signal after having a session. */
  level: 40,
  /** The paid class's weekly slot fits the times they said they can attend. */
  availability: 25,
} as const;

type ClassScore = {
  score: number;
  reasons: string[];
  levelMatch: boolean;
  availabilityMatch: boolean;
  mismatchNote?: string;
};

/**
 * Rank one class for one questionnaire. Never returns "excluded" — every class
 * reaching here already passed the subject gate and will be shown; this only
 * decides the order and what the card says about fit.
 */
function scoreClass(
  group: GroupRow,
  input: MatchInput,
  slots: WeeklySlot[],
  hasSession: boolean
): ClassScore {
  const levelMatch = classServesLevel(group.form_level, input.level);
  const availabilityMatch =
    input.availability.length === 0 || classMatchesAvailability(slots, input.availability);

  let score = 0;
  const reasons: string[] = [];

  if (hasSession) {
    score += SCORE.hasSession;
    reasons.push('Running a free session this week');
  }
  if (levelMatch) {
    score += SCORE.level;
    reasons.push(`Teaches ${levelLabel(input.level)}`);
  }
  if (availabilityMatch && slots.length > 0) {
    score += SCORE.availability;
    reasons.push('Fits the times you chose');
  }

  // Soft mismatches are named on the card rather than hidden. Level is stated
  // first because being at the wrong level matters more than the hour.
  let mismatchNote: string | undefined;
  if (!levelMatch) {
    const taught = normaliseClassLevel(group.form_level).map(levelLabel);
    mismatchNote =
      taught.length > 0
        ? `This class is ${taught.join(' and ')}, not ${levelLabel(input.level)}.`
        : undefined;
  } else if (!availabilityMatch && slots.length > 0) {
    mismatchNote = scheduleMismatchNote(slots);
  }

  return { score, reasons, levelMatch, availabilityMatch, ...(mismatchNote ? { mismatchNote } : {}) };
}

/**
 * Run the campaign match for one completed questionnaire.
 *
 * Everything reads through the service client passed in — anonymous visitors
 * get zero rows under RLS, silently, so this must never run browser-side.
 */
export async function runMatch(admin: SupabaseClient, input: MatchInput): Promise<MatchResult> {
  const empty: MatchResult = {
    outcome: 'subject_unsupported',
    cards: [],
    matchedSubjects: [],
    unsupportedSubjects: input.subjects,
    recommendedSessionIds: [],
  };

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

  // 4. Every subject-matching class that has a campaign session behind it.
  const sessionCandidates = sessionGroups.filter((g) => passesSubject(g, input));

  // 5. Plus every OTHER published paid class teaching the subject, so a family
  //    whose subject is supported never sees an empty page just because no
  //    teacher happened to schedule a taster for it. price_monthly = 0 rows are
  //    suppressed — a TT$0 enrol CTA is the live pricing bug this campaign must
  //    not reproduce. (groups.pricing is the literal string 'free' on every row.)
  const { data: classOnlyData } = await admin
    .from('groups')
    .select('id, name, subject, form_level, price_monthly, tutor_id')
    .eq('status', 'PUBLISHED')
    .eq('pricing_model', 'MONTHLY')
    .is('archived_at', null)
    .gt('price_monthly', 0);
  const classOnlyCandidates = ((classOnlyData ?? []) as GroupRow[]).filter(
    (g) => !groupById.has(g.id) && passesSubject(g, input)
  );

  // 6. The only empty outcome: nobody teaches the subject at all. Everything
  //    else ranks rather than excludes.
  if (sessionCandidates.length === 0 && classOnlyCandidates.length === 0) {
    return empty;
  }

  // 7. Weekly schedules, for the availability RANKING signal (not a filter).
  const slots = await slotsByGroup(admin, [
    ...sessionCandidates.map((g) => g.id),
    ...classOnlyCandidates.map((g) => g.id),
  ]);

  // Teacher names for every card in one query. coalesce(display_name,
  // full_name) — two eligible teachers have a handle in full_name.
  const tutorIds = [
    ...new Set(
      [...sessionCandidates, ...classOnlyCandidates].map((g) => g.tutor_id).filter(Boolean)
    ),
  ];
  const { data: profileData } = tutorIds.length
    ? await admin
        .from('profiles')
        .select('id, display_name, full_name, avatar_url')
        .in('id', tutorIds)
    : { data: [] as ProfileRow[] };
  const profileById = new Map(((profileData ?? []) as ProfileRow[]).map((p) => [p.id, p]));

  const buildCard = (group: GroupRow, hasSession: boolean): TeacherCard => {
    const profile = profileById.get(group.tutor_id);
    const groupSlots = slots.get(group.id) ?? [];
    const groupSessions = hasSession
      ? (sessionsByGroup.get(group.id) ?? [])
          .slice()
          .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
      : [];
    const ranked = scoreClass(group, input, groupSlots, hasSession);
    // `tier` drives the card's LAYOUT only: sessions render Reserve, a class
    // with none renders View class. Suitability is score/reasons.
    const tier: TeacherCard['tier'] = hasSession ? 'exact' : 'fallback_class';

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
      score: ranked.score,
      reasons: ranked.reasons,
      levelMatch: ranked.levelMatch,
      availabilityMatch: ranked.availabilityMatch,
      ...(ranked.mismatchNote ? { mismatchNote: ranked.mismatchNote } : {}),
    };
  };

  // 8. One card per teacher per class, ordered by fit. NEVER sorted by discount
  //    size — that turns the page into price comparison and pushes teachers to
  //    undercut each other. Ties break on the soonest session, then class name,
  //    so the order is stable across loads.
  const soonest = (card: TeacherCard): string => card.sessions[0]?.scheduledAt ?? '9999';

  const cards = [
    ...sessionCandidates.map((g) => buildCard(g, true)),
    ...classOnlyCandidates.map((g) => buildCard(g, false)),
  ].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const bySession = soonest(a).localeCompare(soonest(b));
    if (bySession !== 0) return bySession;
    return a.className.localeCompare(b.className);
  });

  // 9. Which of the chosen subjects actually exist on the platform. Reported
  //    separately from the cards so a partially-supported selection can say so
  //    ("we teach Maths, nobody teaches Physics yet") instead of quietly
  //    dropping the unsupported half.
  const matchedSubjects = input.subjects.filter((s) =>
    cards.some((c) => subjectMatches(c.subject, [s]))
  );
  const unsupportedSubjects = input.subjects.filter((s) => !matchedSubjects.includes(s));

  // 10. recommendedSessionIds snapshots exactly what was shown, in order, so
  //     the export can reproduce the page a family saw.
  const recommendedSessionIds = cards.flatMap((card) => card.sessions.map((s) => s.sessionId));

  return {
    outcome: cards.length > 0 ? 'matched' : 'subject_unsupported',
    cards,
    matchedSubjects,
    unsupportedSubjects,
    recommendedSessionIds,
  };
}
