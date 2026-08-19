/**
 * Who can run a Class Match Week session, and which of their classes can back one.
 *
 * Two separate questions, deliberately kept apart:
 *
 *   - **Eligibility** (`checkTutorEligibility`) is about the teacher. It reuses
 *     existing platform state — suspension, video connection, published classes
 *     — and introduces no new concept.
 *   - **Well-formedness** (`checkClassWellFormed`) is about one class. The
 *     normalisation layer handles what can be translated; this refuses what is
 *     absent. No translation can invent a subject nobody entered or a schedule
 *     nobody set.
 *
 * Both return the reasons they failed rather than a bare boolean, because the
 * teacher has to be told what to fix. A gate that silently hides the entry point
 * produces a support ticket, not a corrected class.
 *
 * VERIFICATION IS NOT PART OF THE GATE. That is a decision, not an oversight:
 * requiring it cuts the catalogue from twelve teachers to two. The risk — that
 * most participating teachers are unverified in a campaign whose purpose is
 * trust — is recorded in docs/class-match-week/01-foundations.md.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normaliseClassLevel } from './levels';

/** A clause that can fail, in the order a teacher would fix them. */
export type EligibilityFailure =
  | 'suspended'
  | 'no_meet_connection'
  | 'no_published_monthly_class';

export type EligibilityResult = {
  eligible: boolean;
  failures: EligibilityFailure[];
  /** Groups that satisfy published + monthly. Not yet checked for well-formedness. */
  candidateGroupIds: string[];
};

export type ClassDefect =
  | 'not_published'
  | 'not_monthly'
  | 'no_subject'
  | 'no_schedule'
  | 'schedule_expired'
  | 'unrecognised_level';

export type WellFormednessResult = {
  ok: boolean;
  defects: ClassDefect[];
  /** Copy for the teacher, one line per defect, in fix order. */
  messages: string[];
};

const DEFECT_MESSAGES: Record<ClassDefect, string> = {
  not_published: 'This class is not published yet.',
  not_monthly: 'Class Match Week only supports classes on monthly pricing.',
  no_subject: 'Add a subject to this class so families can find it.',
  no_schedule: 'Add a weekly schedule to this class — pick the days and a start time.',
  schedule_expired: 'This class’s schedule has ended. Extend it before running a session.',
  unrecognised_level: 'This class’s level is not one we can match on. Set it from the level list.',
};

/**
 * Evaluate the teacher-level gate.
 *
 * Clauses, all of which are mutable — a teacher can be suspended, revoke Meet,
 * or unpublish mid-week — which is why participation stores a snapshot of this
 * at opt-in.
 */
export async function checkTutorEligibility(
  admin: SupabaseClient,
  tutorId: string
): Promise<EligibilityResult> {
  const failures: EligibilityFailure[] = [];

  const { data: profile } = await admin
    .from('profiles')
    .select('id, is_suspended')
    .eq('id', tutorId)
    .maybeSingle();

  if (profile?.is_suspended === true) failures.push('suspended');

  // The connection must be Google Meet specifically. The platform also supports
  // Zoom, and a teacher whose only active provider is Zoom cannot produce a Meet
  // link at all — so this is part of the gate rather than a failure discovered
  // at step 4 of session creation. (Production currently holds no Zoom rows, so
  // this excludes nobody today.)
  const { data: connection } = await admin
    .from('tutor_video_provider_connections')
    .select('tutor_id')
    .eq('tutor_id', tutorId)
    .eq('provider', 'google_meet')
    .eq('is_active', true)
    .eq('connection_status', 'connected')
    .maybeSingle();

  if (!connection) failures.push('no_meet_connection');

  // pricing_model, NOT pricing_mode. pricing_model is populated on every row and
  // its union includes MONTHLY; pricing_mode is NULL on some published rows and
  // its TypeScript union omits MONTHLY entirely, so filtering on it compiles and
  // matches nothing. The legacy `pricing` column is the string 'free' on every
  // row in the database and must never be read.
  const { data: groups } = await admin
    .from('groups')
    .select('id')
    .eq('tutor_id', tutorId)
    .eq('status', 'PUBLISHED')
    .eq('pricing_model', 'MONTHLY')
    .is('archived_at', null);

  const candidateGroupIds = (groups ?? []).map((g: { id: string }) => g.id);
  if (candidateGroupIds.length === 0) failures.push('no_published_monthly_class');

  return { eligible: failures.length === 0, failures, candidateGroupIds };
}

/**
 * Can this class back a campaign session?
 *
 * Note what is NOT tested: `group_sessions.start_time`. It is `time NOT NULL` by
 * schema, so a null check there can never fire — naming it in the rule implies a
 * guard that does not exist. Schedulability is decided entirely by
 * `recurrence_days` being non-empty, and the defect in production is a non-null
 * EMPTY ARRAY, which a null check would also miss.
 */
export async function checkClassWellFormed(
  admin: SupabaseClient,
  groupId: string
): Promise<WellFormednessResult> {
  const defects: ClassDefect[] = [];

  const { data: group } = await admin
    .from('groups')
    .select('id, subject, form_level, status, pricing_model')
    .eq('id', groupId)
    .maybeSingle();

  if (!group) {
    return { ok: false, defects: ['not_published'], messages: [DEFECT_MESSAGES.not_published] };
  }

  if (group.status !== 'PUBLISHED') defects.push('not_published');
  if (group.pricing_model !== 'MONTHLY') defects.push('not_monthly');
  if (!group.subject || !String(group.subject).trim()) defects.push('no_subject');
  if (normaliseClassLevel(group.form_level).length === 0) defects.push('unrecognised_level');

  // The schedule the campaign matches against lives here, not on `groups` —
  // every schedule-shaped column on the group row (recurrence_rule,
  // session_frequency, availability_window, session_length_minutes) is null
  // across the whole eligible catalogue.
  const { data: series } = await admin
    .from('group_sessions')
    .select('id, recurrence_days, ends_on')
    .eq('group_id', groupId);

  const rows = series ?? [];
  const withDays = rows.filter(
    (s: { recurrence_days: number[] | null }) =>
      Array.isArray(s.recurrence_days) && s.recurrence_days.length > 0
  );

  if (withDays.length === 0) {
    defects.push('no_schedule');
  } else {
    // An expired series is worse than a missing one: it looks scheduled and
    // matches on day-of-week, but produces no future occurrence to attend.
    const today = new Date().toISOString().slice(0, 10);
    const unexpired = withDays.filter(
      (s: { ends_on: string | null }) => !s.ends_on || s.ends_on >= today
    );
    if (unexpired.length === 0) defects.push('schedule_expired');
  }

  return {
    ok: defects.length === 0,
    defects,
    messages: defects.map((d) => DEFECT_MESSAGES[d]),
  };
}

/** The classes a teacher can actually create a session from, with reasons for the rest. */
export async function listSessionableClasses(
  admin: SupabaseClient,
  tutorId: string
): Promise<{
  sessionable: string[];
  blocked: Array<{ groupId: string; defects: ClassDefect[]; messages: string[] }>;
}> {
  const { candidateGroupIds } = await checkTutorEligibility(admin, tutorId);

  const sessionable: string[] = [];
  const blocked: Array<{ groupId: string; defects: ClassDefect[]; messages: string[] }> = [];

  for (const groupId of candidateGroupIds) {
    const result = await checkClassWellFormed(admin, groupId);
    if (result.ok) sessionable.push(groupId);
    else blocked.push({ groupId, defects: result.defects, messages: result.messages });
  }

  return { sessionable, blocked };
}
