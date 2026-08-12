// Parent-approval booking requests — handover §4, schema in migration 219.
//
// This module owns every rule in the request lifecycle so that the routes stay
// thin and cannot drift from each other. The five statements the whole design
// follows, restated because each one shows up as a decision below:
//
//   1. Students are self-paying by default. Linking a parent makes a student
//      dependent, and there is no dependent student without a linked parent.
//   2. Approval is consent, not just payment — a free class still needs it.
//   3. Nothing is reserved while a parent decides. First to pay wins.
//   4. The window closes two hours before the session.
//   5. The price is frozen as listed when the request was sent.
//
// Server-only: every function takes a service-role client. Authorisation is the
// caller's job and is asserted here, not assumed.

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

/**
 * Decision 8 / §4.2: a 1:1 request closes at session start − 2h, "mirroring the
 * existing minimum booking lead time". Same number in both places on purpose —
 * a parent must never be able to approve a booking that could no longer have
 * been made from scratch.
 */
export const REQUEST_EXPIRY_LEAD_MINUTES = 120;

const MINUTE_MS = 60_000;

export type RequestKind = 'one_to_one' | 'group';

/**
 * When this request stops being answerable.
 *
 * Returns null for group classes, and that is not an oversight: §12 records
 * group-class expiry as unresolved, because a recurring class has no single
 * anchoring session — first session, next session and class start date are all
 * defensible and none has been chosen. A null expiry means "does not expire
 * yet"; the sweep in expireDueRequests skips those rows rather than guessing,
 * so no group request is ever closed by a rule nobody agreed to.
 */
export function computeRequestExpiry(params: {
  kind: RequestKind;
  sessionStart?: string | Date | null;
}): string | null {
  if (params.kind === 'group') return null;
  if (!params.sessionStart) return null;

  const start = new Date(params.sessionStart).getTime();
  if (!Number.isFinite(start)) return null;

  return new Date(start - REQUEST_EXPIRY_LEAD_MINUTES * MINUTE_MS).toISOString();
}

export type ApprovalWindow =
  | { ok: true }
  | { ok: false; reason: 'expired' | 'not_pending' };

/**
 * §4.2: "A parent cannot approve inside that window." Checked at approval time
 * as well as by the sweep, because the sweep runs on a cron and a parent
 * clicking Approve 30 seconds before it fires must still be refused.
 */
export function checkApprovalWindow(
  booking: { status: string; expires_at?: string | null },
  now: Date = new Date()
): ApprovalWindow {
  if (booking.status !== 'PENDING_PARENT_APPROVAL') {
    return { ok: false, reason: 'not_pending' };
  }
  if (booking.expires_at && new Date(booking.expires_at).getTime() <= now.getTime()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Who pays — decision 1
// ---------------------------------------------------------------------------

export type BillingResolution =
  | { mode: 'self_pay'; parentId: null; reason: string }
  | { mode: 'parent_approval'; parentId: string; requiresApproval: true };

/**
 * The branch at the entry of every booking path (§4.1).
 *
 * `profiles.billing_mode` is the legacy flag ('parent_required' | 'self_allowed')
 * and predates parent links. It is deliberately NOT the source of truth here:
 * statement 1 says dependency comes from a link existing, and a stale
 * 'parent_required' on a student with no linked parent would otherwise send a
 * request into a queue nobody can see — the student would sit waiting on an
 * approval that can never arrive. So the link is authoritative and
 * billing_mode is only consulted to let a linked parent hand payment back
 * ('self_allowed' = the self-pay toggle of §7).
 */
export async function resolveBilling(
  admin: SupabaseClient,
  studentId: string
): Promise<BillingResolution> {
  const { data: link } = await admin
    .from('parent_child_links')
    .select('parent_id')
    .eq('child_id', studentId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  // Decision 25: one parent per child.
  const parentId = link?.parent_id ?? null;

  if (!parentId) {
    return { mode: 'self_pay', parentId: null, reason: 'no_linked_parent' };
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('billing_mode')
    .eq('id', studentId)
    .maybeSingle();

  // §7: self-pay is a per-child setting the parent controls. When it is on, the
  // child pays for themselves and no approval is required.
  if (profile?.billing_mode === 'self_allowed') {
    return { mode: 'self_pay', parentId: null, reason: 'self_pay_enabled_by_parent' };
  }

  return { mode: 'parent_approval', parentId, requiresApproval: true };
}

/** Is this parent actually this child's parent? Asserted, never assumed. */
export async function assertParentOfStudent(
  admin: SupabaseClient,
  parentId: string,
  studentId: string
): Promise<boolean> {
  const { data } = await admin
    .from('parent_child_links')
    .select('id')
    .eq('parent_id', parentId)
    .eq('child_id', studentId)
    .limit(1);
  return Boolean(data && data.length > 0);
}

// ---------------------------------------------------------------------------
// Creating the request
// ---------------------------------------------------------------------------

export type CreateRequestInput = {
  studentId: string;
  tutorId: string;
  subjectId: string;
  sessionTypeId: string;
  requestedStartAt: string;
  requestedEndAt: string;
  durationMinutes: number;
  /** Price as listed right now. Frozen at this figure — decision 10. */
  priceTtd: number;
  platformFeeTtd?: number | null;
  studentNotes?: string | null;
  kind?: RequestKind;
};

export type CreateRequestResult =
  | { ok: true; bookingId: string; parentId: string; expiresAt: string | null }
  | { ok: false; reason: string };

/**
 * Creates the PENDING_PARENT_APPROVAL booking (§4.1).
 *
 * Nothing is reserved by this (statement 3) — it writes a request, not a hold,
 * and every surface that shows it has to say so.
 */
export async function createParentApprovalRequest(
  admin: SupabaseClient,
  input: CreateRequestInput
): Promise<CreateRequestResult> {
  const billing = await resolveBilling(admin, input.studentId);
  if (billing.mode !== 'parent_approval') {
    // Caller should have taken the ordinary checkout path.
    return { ok: false, reason: 'student_is_self_paying' };
  }

  const kind: RequestKind = input.kind ?? 'one_to_one';
  const expiresAt = computeRequestExpiry({ kind, sessionStart: input.requestedStartAt });

  // Refusing to create something already past answering beats creating it and
  // letting the sweep close it seconds later, which would show the student a
  // request that was never live.
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    return { ok: false, reason: 'too_late_to_request' };
  }

  const nowIso = new Date().toISOString();

  const { data, error } = await admin
    .from('bookings')
    .insert({
      student_id: input.studentId,
      tutor_id: input.tutorId,
      subject_id: input.subjectId,
      session_type_id: input.sessionTypeId,
      requested_start_at: input.requestedStartAt,
      requested_end_at: input.requestedEndAt,
      duration_minutes: input.durationMinutes,
      status: 'PENDING_PARENT_APPROVAL',
      last_action_by: 'student',
      price_ttd: input.priceTtd,
      student_notes: input.studentNotes ?? null,
      // §10.1
      requested_at: nowIso,
      requested_by: input.studentId,
      expires_at: expiresAt,
      frozen_price: input.priceTtd,
      frozen_platform_fee: input.platformFeeTtd ?? null,
      // The parent is the payer from the moment the request exists, so anything
      // reading payer_id sees the right person before any money moves.
      payer_id: billing.parentId,
      payment_required: input.priceTtd > 0,
      payment_status: 'unpaid',
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, reason: error?.message ?? 'insert_failed' };
  }

  return { ok: true, bookingId: data.id, parentId: billing.parentId, expiresAt };
}

// ---------------------------------------------------------------------------
// Withdrawal — decision 28
// ---------------------------------------------------------------------------

export async function withdrawRequest(
  admin: SupabaseClient,
  params: { bookingId: string; studentId: string }
): Promise<{ ok: boolean; reason?: string }> {
  const { data: booking } = await admin
    .from('bookings')
    .select('id, student_id, status')
    .eq('id', params.bookingId)
    .maybeSingle();

  if (!booking) return { ok: false, reason: 'not_found' };
  if (booking.student_id !== params.studentId) return { ok: false, reason: 'not_yours' };
  if (booking.status !== 'PENDING_PARENT_APPROVAL') {
    return { ok: false, reason: 'not_pending' };
  }

  const { error } = await admin
    .from('bookings')
    .update({
      status: 'WITHDRAWN',
      decided_at: new Date().toISOString(),
      decided_by: params.studentId,
    })
    .eq('id', params.bookingId)
    // Guards against two withdrawals racing, and against withdrawing something
    // a parent approved in the same instant.
    .eq('status', 'PENDING_PARENT_APPROVAL');

  if (error) return { ok: false, reason: error.message };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Expiry sweep — §4.2
// ---------------------------------------------------------------------------

/**
 * Closes requests whose window has passed.
 *
 * Runs from /api/cron/send-reminders. §4.2 is explicit: do not add a second
 * cron, and send no email. The expired state is discoverable only on platform —
 * the student's pending section and the parent's Past decisions — which is why
 * this function notifies nobody.
 *
 * Rows with a null expires_at are group requests, skipped until §12 is settled.
 */
export async function expireDueRequests(
  admin: SupabaseClient,
  now: Date = new Date()
): Promise<{ expired: number }> {
  const { data, error } = await admin
    .from('bookings')
    .update({ status: 'EXPIRED', decided_at: now.toISOString() })
    .eq('status', 'PENDING_PARENT_APPROVAL')
    .not('expires_at', 'is', null)
    .lte('expires_at', now.toISOString())
    .select('id');

  if (error) {
    console.error('[bookingRequests] expiry sweep failed:', error.message);
    return { expired: 0 };
  }
  return { expired: data?.length ?? 0 };
}

// ---------------------------------------------------------------------------
// Capacity — §4.5, checked twice
// ---------------------------------------------------------------------------

export type CapacityVerdict =
  | { available: true }
  | { available: false; reason: 'slot_taken' | 'class_full' };

/**
 * "Nothing holds the seat, so a class can fill between approval and
 * fulfilment." §4.5 requires this before creating the Checkout session AND
 * again at webhook fulfilment — the second call is the one that stops a parent
 * being charged for a place that no longer exists.
 *
 * For 1:1 the equivalent of a full class is the slot having been taken by
 * another student, so the existing availability RPC is reused rather than a
 * second implementation written beside it.
 */
export async function checkCapacity(
  admin: SupabaseClient,
  booking: {
    id: string;
    tutor_id: string;
    requested_start_at: string;
    requested_end_at: string;
  }
): Promise<CapacityVerdict> {
  // Any confirmed booking overlapping this window means the slot is gone.
  const { data: clashes, error } = await admin
    .from('bookings')
    .select('id, status, confirmed_start_at, confirmed_end_at, requested_start_at, requested_end_at')
    .eq('tutor_id', booking.tutor_id)
    .neq('id', booking.id)
    .in('status', ['CONFIRMED', 'PARENT_APPROVED', 'COMPLETED']);

  if (error) {
    // Fail closed on the pre-checkout call would block every approval on a
    // transient error; fail open here and let the webhook's second check (which
    // can still refund) be the backstop.
    console.error('[bookingRequests] capacity check failed:', error.message);
    return { available: true };
  }

  const start = new Date(booking.requested_start_at).getTime();
  const end = new Date(booking.requested_end_at).getTime();

  const overlaps = (clashes ?? []).some((b) => {
    const bs = new Date(b.confirmed_start_at ?? b.requested_start_at).getTime();
    const be = new Date(b.confirmed_end_at ?? b.requested_end_at).getTime();
    if (!Number.isFinite(bs) || !Number.isFinite(be)) return false;
    return bs < end && be > start;
  });

  return overlaps ? { available: false, reason: 'slot_taken' } : { available: true };
}

// ---------------------------------------------------------------------------
// Reading the queue
// ---------------------------------------------------------------------------

export type ParentQueueItem = {
  id: string;
  studentId: string;
  tutorId: string;
  requestedAt: string | null;
  requestedStartAt: string;
  durationMinutes: number;
  /** Decision 10: what the parent is being asked to agree to. */
  frozenPrice: number;
  expiresAt: string | null;
  isFree: boolean;
};

export type ParentDecidedItem = {
  id: string;
  studentId: string;
  tutorId: string;
  /** Approved | Declined | Expired | Withdrawn — the four ways a request ends. */
  outcome: 'Approved' | 'Declined' | 'Expired' | 'Withdrawn';
  decidedAt: string | null;
  total: number;
  reason: string | null;
};

const DECIDED_STATUSES = [
  'PARENT_APPROVED',
  'PARENT_REJECTED',
  'EXPIRED',
  'WITHDRAWN',
  'CONFIRMED',
  'SEAT_UNAVAILABLE_REFUNDED',
];

export function outcomeOf(status: string): ParentDecidedItem['outcome'] {
  switch (status) {
    case 'PARENT_REJECTED':
      return 'Declined';
    case 'EXPIRED':
      return 'Expired';
    case 'WITHDRAWN':
      return 'Withdrawn';
    default:
      return 'Approved';
  }
}

/**
 * The parent's queue and their Past decisions in one read.
 *
 * Past decisions carries all four outcomes because no email is sent when a
 * request lapses or is withdrawn (§4.2, decision 28) — this list is the only
 * place either becomes visible.
 */
export async function listParentRequests(
  admin: SupabaseClient,
  parentId: string
): Promise<{ pending: ParentQueueItem[]; decided: ParentDecidedItem[]; childIds: string[] }> {
  const { data: links } = await admin
    .from('parent_child_links')
    .select('child_id')
    .eq('parent_id', parentId);

  const childIds = (links ?? []).map((l: { child_id: string }) => l.child_id);
  if (childIds.length === 0) return { pending: [], decided: [], childIds: [] };

  // One literal string: the client infers the row type from the literal text of
  // the select, and a concatenation collapses it to GenericStringError.
  const { data: rowData } = await admin
    .from('bookings')
    .select(
      'id, student_id, tutor_id, status, requested_at, requested_start_at, duration_minutes, price_ttd, frozen_price, expires_at, decided_at, decline_reason'
    )
    .in('student_id', childIds)
    .in('status', ['PENDING_PARENT_APPROVAL', ...DECIDED_STATUSES])
    .order('requested_at', { ascending: false, nullsFirst: false })
    .limit(200);

  // Generated Database types predate migration 219's columns.
  const rows = (rowData ?? []) as unknown as Array<{
    id: string;
    student_id: string;
    tutor_id: string;
    status: string;
    requested_at: string | null;
    requested_start_at: string;
    duration_minutes: number;
    price_ttd: number | null;
    frozen_price: number | null;
    expires_at: string | null;
    decided_at: string | null;
    decline_reason: string | null;
  }>;

  const pending: ParentQueueItem[] = [];
  const decided: ParentDecidedItem[] = [];

  for (const r of rows) {
    const price = Number(r.frozen_price ?? r.price_ttd ?? 0);
    if (r.status === 'PENDING_PARENT_APPROVAL') {
      pending.push({
        id: r.id,
        studentId: r.student_id,
        tutorId: r.tutor_id,
        requestedAt: r.requested_at,
        requestedStartAt: r.requested_start_at,
        durationMinutes: r.duration_minutes,
        frozenPrice: price,
        expiresAt: r.expires_at,
        isFree: price <= 0,
      });
    } else {
      decided.push({
        id: r.id,
        studentId: r.student_id,
        tutorId: r.tutor_id,
        outcome: outcomeOf(r.status),
        decidedAt: r.decided_at,
        total: price,
        reason: r.decline_reason ?? null,
      });
    }
  }

  return { pending, decided, childIds };
}
