/**
 * Data access for the Class Match Week portal and teacher surfaces.
 *
 * Every helper takes the service client as its first argument, following the
 * repo convention in lib/subject-communities. That is not a style choice here:
 * the portal serves anonymous visitors, and anonymous visitors read ZERO rows
 * through RLS — every SELECT policy on the platform tables is
 * `TO authenticated`, and RLS with no matching policy returns empty silently
 * with no error. Callers are server components and route handlers that pass
 * `getServiceClient()` in and hand plain props down.
 *
 * The submission model: a questionnaire completes before any account exists,
 * so the row is keyed on a long random token held in a first-party cookie,
 * with a NULLABLE user id. The unique key is the token, never the user —
 * a UNIQUE(user_id) would throw on the anonymous-then-sign-in path instead of
 * merging. Orphaned token rows are retained for reporting, flagged unclaimed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ClassMatchCampaign,
  ClassMatchSession,
  ClassMatchSubmission,
  MatchOutcome,
  SubmissionRole,
} from './types';
import { isClassMatchWeekEnabled } from '@/lib/featureFlags/classMatchWeek';

/**
 * The campaign currently running, or null outside the week.
 *
 * The schema allows at most one 'live' campaign; the limit(1) is defensive so
 * a constraint slip degrades to "one of them" rather than a thrown error on
 * the campaign's landing page.
 */
export async function getLiveCampaign(admin: SupabaseClient): Promise<ClassMatchCampaign | null> {
  // The kill switch, enforced here rather than in each of the twelve callers.
  // "Disabled" is reported as "no live campaign" because that is the state every
  // campaign surface already renders correctly — it is what they show for the
  // rest of the year. See lib/featureFlags/classMatchWeek.ts.
  if (!isClassMatchWeekEnabled()) return null;

  const { data } = await admin
    .from('class_match_campaigns')
    .select('*')
    .eq('status', 'live')
    .limit(1)
    .maybeSingle();
  return (data as ClassMatchCampaign | null) ?? null;
}

/**
 * Resolve the visitor's submission from their cookie token.
 *
 * Null is a normal answer — first visit, cleared cookies, or a token minted
 * against a previous campaign whose row was never written.
 */
export async function getSubmissionByToken(
  admin: SupabaseClient,
  token: string
): Promise<ClassMatchSubmission | null> {
  if (!token) return null;
  const { data } = await admin
    .from('class_match_submissions')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  return (data as ClassMatchSubmission | null) ?? null;
}

/**
 * Write questionnaire progress against the visitor's token — insert on first
 * contact, update on conflict thereafter.
 *
 * Only the fields the caller actually passed are written, so the one-question-
 * per-screen flow can save each answer as it lands without wiping the answers
 * already stored (an omitted field is "unchanged", not "cleared" — pass an
 * explicit null or [] to clear).
 */
export async function upsertSubmission(
  admin: SupabaseClient,
  args: {
    token: string;
    campaignId: string;
    role: SubmissionRole;
    level?: string | null;
    subjects?: string[];
    availability?: string[];
    supportNeeded?: string[];
    teacherPreferences?: string[];
    matchOutcome?: MatchOutcome | null;
    recommendedSessionIds?: string[];
    /** Closes the row. The questionnaire is one-time; a set value is final. */
    completedAt?: string;
  }
): Promise<ClassMatchSubmission> {
  const row: Record<string, unknown> = {
    token: args.token,
    campaign_id: args.campaignId,
    role: args.role,
  };
  if (args.level !== undefined) row.level = args.level;
  if (args.subjects !== undefined) row.subjects = args.subjects;
  if (args.availability !== undefined) row.availability = args.availability;
  if (args.supportNeeded !== undefined) row.support_needed = args.supportNeeded;
  if (args.teacherPreferences !== undefined) row.teacher_preferences = args.teacherPreferences;
  if (args.matchOutcome !== undefined) row.match_outcome = args.matchOutcome;
  if (args.recommendedSessionIds !== undefined) {
    row.recommended_session_ids = args.recommendedSessionIds;
  }
  if (args.completedAt !== undefined) row.completed_at = args.completedAt;

  const { data, error } = await admin
    .from('class_match_submissions')
    .upsert(row, { onConflict: 'token' })
    .select('*')
    .single();

  if (error) throw error;
  return data as ClassMatchSubmission;
}

/**
 * A teacher's campaign sessions, every status, for their management list —
 * drafts they have not published and cancellations included, because "what
 * have I created" is the question the list answers.
 *
 * `groupName` and `reservedCount` are resolved here so the list renders from
 * one call. The reservation count is one grouped-in-JS query, not N — and it
 * counts only 'reserved' rows, so a cancellation frees the seat.
 */
export async function listTeacherSessions(
  admin: SupabaseClient,
  tutorId: string
): Promise<Array<ClassMatchSession & { groupName: string; reservedCount: number }>> {
  const { data: sessionData } = await admin
    .from('class_match_sessions')
    .select('*')
    .eq('tutor_id', tutorId)
    .order('scheduled_at', { ascending: true });
  const sessions = (sessionData ?? []) as ClassMatchSession[];
  if (sessions.length === 0) return [];

  const groupIds = [...new Set(sessions.map((s) => s.group_id))];
  const { data: groupData } = await admin.from('groups').select('id, name').in('id', groupIds);
  const nameById = new Map(
    ((groupData ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name])
  );

  const { data: reservationData } = await admin
    .from('class_match_reservations')
    .select('session_id')
    .in('session_id', sessions.map((s) => s.id))
    .eq('status', 'reserved');
  const countBySession = new Map<string, number>();
  for (const row of (reservationData ?? []) as Array<{ session_id: string }>) {
    countBySession.set(row.session_id, (countBySession.get(row.session_id) ?? 0) + 1);
  }

  return sessions.map((session) => ({
    ...session,
    groupName: nameById.get(session.group_id) ?? '',
    reservedCount: countBySession.get(session.id) ?? 0,
  }));
}

/**
 * Has this teacher opted in to the campaign?
 *
 * Participation is a persisted act with its own row (opt-in timestamp and a
 * snapshot of the gate as it stood — every clause of the gate is mutable
 * afterwards). Session rows are NOT the opt-in record: a teacher who opts in
 * and creates nothing must still be visible to funnel reporting.
 */
export async function getParticipation(
  admin: SupabaseClient,
  campaignId: string,
  tutorId: string
): Promise<{ optedIn: boolean }> {
  const { data } = await admin
    .from('class_match_participation')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('tutor_id', tutorId)
    .maybeSingle();
  return { optedIn: Boolean(data) };
}

/**
 * The submission belonging to a signed-in account, newest first.
 *
 * The one-time rule has to survive a cleared cookie and a second device, so
 * completion is checked against the ACCOUNT once one exists — not only against
 * the `cmw_token` cookie the anonymous questionnaire wrote.
 */
export async function getSubmissionForUser(
  admin: SupabaseClient,
  userId: string
): Promise<ClassMatchSubmission | null> {
  const { data } = await admin
    .from('class_match_submissions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClassMatchSubmission | null) ?? null;
}
