// The shared feedback quota — handover §8.1, decision 13.
//
// One request per calendar month per tutor-child pair, shared between parent and
// student. A household cannot double-request. Migration 221 enforces that with a
// unique index; this module is the usable path and the place the supersede rule
// lives.
//
// WHAT THIS MODULE REFUSES TO DO
// §8.1: "No deadline, no expiry, no reminder, no escalation. Copy states the
// request date only. No language implying a timeframe — no 'pending', no
// 'expected', no progress indicator." So there is no due date computed here, no
// sweep, and nothing that could grow into a chase. The single notification on
// creation is the entire mechanism, and it goes to the tutor only.
//
// Instrumentation (§8.3) is deliberately possible from this shape: requested_at
// on the request and created_at on the answering feedback give request-to-
// response rate and median time-to-response without any extra tracking.

import type { SupabaseClient } from '@supabase/supabase-js';

export type RequesterRole = 'parent' | 'student';

/** First day of the calendar month, as a date string. The quota key. */
export function currentPeriodMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** "the next opens in October" — said plainly, with no implied deadline. */
export function nextMonthName(now: Date = new Date()): string {
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toLocaleString('en-TT', { month: 'long', timeZone: 'UTC' });
}

export type QuotaStatus = {
  /** True when this month's request has already been spent by either party. */
  used: boolean;
  /** Who spent it. The other party must be able to see this (§9.2). */
  usedBy: RequesterRole | null;
  usedByName: string | null;
  usedOn: string | null;
  periodMonth: string;
  nextOpens: string;
  openRequestId: string | null;
  /** Ready-made sentence, so parent and student surfaces cannot word it differently. */
  reason: string | null;
};

/**
 * Has this month's request been spent, and by whom.
 *
 * Naming the spender is a product requirement, not a nicety: §9.2 wants the
 * student's Request button disabled "with a plain reason ... naming who used
 * it". A student who sees only "unavailable" assumes a bug; one who reads "your
 * parent requested feedback on 4 Sep" understands the household shares it.
 */
export async function getQuotaStatus(
  admin: SupabaseClient,
  params: { childId: string; tutorId: string; now?: Date }
): Promise<QuotaStatus> {
  const now = params.now ?? new Date();
  const periodMonth = currentPeriodMonth(now);
  const nextOpens = nextMonthName(now);

  const { data } = await admin
    .from('feedback_requests')
    .select('id, requester_role, requested_by, requested_at, status')
    .eq('child_id', params.childId)
    .eq('tutor_id', params.tutorId)
    .eq('period_month', periodMonth)
    .maybeSingle();

  const row = data as unknown as {
    id: string;
    requester_role: RequesterRole;
    requested_by: string;
    requested_at: string;
    status: string;
  } | null;

  if (!row) {
    return {
      used: false,
      usedBy: null,
      usedByName: null,
      usedOn: null,
      periodMonth,
      nextOpens,
      openRequestId: null,
      reason: null,
    };
  }

  const { data: who } = await admin
    .from('profiles')
    .select('full_name, display_name')
    .eq('id', row.requested_by)
    .maybeSingle();

  const p = who as { full_name: string | null; display_name: string | null } | null;
  const usedByName = p?.display_name || p?.full_name || null;

  const usedOn = new Date(row.requested_at).toLocaleDateString('en-TT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Port_of_Spain',
  });

  return {
    used: true,
    usedBy: row.requester_role,
    usedByName,
    usedOn,
    periodMonth,
    nextOpens,
    openRequestId: row.status === 'open' ? row.id : null,
    // States the date and nothing else. No "pending", no "expected".
    reason:
      row.requester_role === 'parent'
        ? `${usedByName ?? 'Your parent'} requested feedback on ${usedOn}. You share one request a month — the next opens in ${nextOpens}.`
        : `${usedByName ?? 'Your child'} requested feedback on ${usedOn}. You share one request a month — the next opens in ${nextOpens}.`,
  };
}

export type CreateRequestOutcome =
  | { ok: true; requestId: string; supersededId: string | null }
  | { ok: false; reason: 'quota_used'; quota: QuotaStatus }
  | { ok: false; reason: 'not_permitted' | 'insert_failed' };

/**
 * Spends this month's request.
 *
 * The supersede rule (§8.1): a new month's request replaces an unanswered older
 * one rather than stacking, "so a tutor never faces a queue of six identical
 * asks". Superseding happens BEFORE the insert because migration 221 has a
 * partial unique index allowing only one open row per pair — the insert would
 * otherwise be refused, and the caller would see a database error where the
 * correct behaviour is a clean replacement.
 */
export async function createFeedbackRequest(
  admin: SupabaseClient,
  params: {
    childId: string;
    tutorId: string;
    requesterId: string;
    requesterRole: RequesterRole;
    now?: Date;
  }
): Promise<CreateRequestOutcome> {
  const now = params.now ?? new Date();
  const periodMonth = currentPeriodMonth(now);

  const quota = await getQuotaStatus(admin, {
    childId: params.childId,
    tutorId: params.tutorId,
    now,
  });
  if (quota.used) {
    return { ok: false, reason: 'quota_used', quota };
  }

  // Any still-open request must be from an earlier month, since this month's is
  // free. That is exactly the case §8.1 says to supersede rather than stack.
  const { data: stale } = await admin
    .from('feedback_requests')
    .select('id')
    .eq('child_id', params.childId)
    .eq('tutor_id', params.tutorId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();

  const supersededId = (stale as { id: string } | null)?.id ?? null;

  if (supersededId) {
    await admin
      .from('feedback_requests')
      .update({ status: 'superseded', updated_at: now.toISOString() })
      .eq('id', supersededId)
      .eq('status', 'open');
  }

  const { data: created, error } = await admin
    .from('feedback_requests')
    .insert({
      child_id: params.childId,
      tutor_id: params.tutorId,
      requested_by: params.requesterId,
      requester_role: params.requesterRole,
      requested_at: now.toISOString(),
      period_month: periodMonth,
      status: 'open',
    })
    .select('id')
    .single();

  if (error || !created) {
    // 23505 = unique violation: the other party in the household got there
    // first, in the gap between the check above and this insert. That is the
    // race decision 13 exists to lose gracefully, so it is reported as a spent
    // quota rather than a failure.
    if ((error as { code?: string } | null)?.code === '23505') {
      return {
        ok: false,
        reason: 'quota_used',
        quota: await getQuotaStatus(admin, {
          childId: params.childId,
          tutorId: params.tutorId,
          now,
        }),
      };
    }
    return { ok: false, reason: 'insert_failed' };
  }

  return { ok: true, requestId: (created as { id: string }).id, supersededId };
}

/**
 * Is this person allowed to spend the quota for this child?
 *
 * Decision 15: students may request feedback independently, linked parent or
 * not. So the child themselves always may, and a linked parent may on their
 * behalf. Nobody else.
 */
export async function canRequestFor(
  admin: SupabaseClient,
  params: { actorId: string; childId: string }
): Promise<RequesterRole | null> {
  if (params.actorId === params.childId) return 'student';

  const { data } = await admin
    .from('parent_child_links')
    .select('id')
    .eq('parent_id', params.actorId)
    .eq('child_id', params.childId)
    .limit(1);

  return data && data.length > 0 ? 'parent' : null;
}

/**
 * Has this tutor actually taught this child? Prevents the quota being spent
 * against a stranger, which would put a request in the queue of a tutor with no
 * basis to answer it.
 */
export async function hasTaughtRelationship(
  admin: SupabaseClient,
  params: { childId: string; tutorId: string }
): Promise<boolean> {
  const { data: session } = await admin
    .from('sessions')
    .select('id')
    .eq('student_id', params.childId)
    .eq('tutor_id', params.tutorId)
    .limit(1);
  if (session && session.length > 0) return true;

  // Or they share a group class the tutor runs.
  const { data: groups } = await admin
    .from('groups')
    .select('id')
    .eq('tutor_id', params.tutorId)
    .limit(200);

  const groupIds = ((groups ?? []) as unknown as Array<{ id: string }>).map((g) => g.id);
  if (groupIds.length === 0) return false;

  const { data: enrolment } = await admin
    .from('group_enrollments')
    .select('id')
    .eq('student_id', params.childId)
    .in('group_id', groupIds)
    .limit(1);
  if (enrolment && enrolment.length > 0) return true;

  const { data: member } = await admin
    .from('group_members')
    .select('id')
    .eq('user_id', params.childId)
    .in('group_id', groupIds)
    .limit(1);

  return Boolean(member && member.length > 0);
}
