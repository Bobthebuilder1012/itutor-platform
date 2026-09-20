// Every definition of "joined", in one file.
//
// The spec's governing sentence is "Sending an invitation is not success. A
// joined/activated student is success." This module is where that sentence
// becomes a predicate, and it is deliberately the only place it exists: the
// banner, the dashboard, the goal and TDR all read the same functions, so the
// teacher can never see 3/5 on one screen and 4/5 on another.
//
// TWO TABLES, ALWAYS. A student's place in a class lives in group_members for
// free and approval-gated classes, and in group_enrollments for paid ones. A
// paying student has NO group_members row, so a membership check that reads one
// table reports a real student as absent — lib/classes/fetchClassDetail.ts
// documents the same rule for the same reason.
//
// NEVER A LITERAL STATUS STRING. group_members.status has two live vocabularies
// ('active'/'pending_approval' from one route, 'approved'/'pending' from the
// others) and lib/services/groupMembership.ts exists precisely to reconcile
// them. Read every status through classifyMembership.

import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyMembership } from '@/lib/services/groupMembership';
import { STALE_AFTER_MS, MIN_RESEND_INTERVAL_MS, MAX_RESENDS_PER_INVITE } from './limits';
import type {
  AttentionReason,
  ClassInviteRow,
  InviteState,
  InviteeView,
} from './types';

/**
 * group_enrollments statuses that mean the student holds a place.
 *
 * Compared in TypeScript against a fetched string rather than pushed down as a
 * PostgREST .in() filter: this column's CHECK has been widened twice across
 * migrations, and an .in() against a value an environment's constraint does not
 * know is a 500 on a page that should simply show a smaller number.
 */
const ENROLMENT_HOLDS_PLACE = new Set(['ACTIVE', 'GRACE', 'SECURED', 'COMPLETED']);
const ENROLMENT_AWAITING = new Set(['PENDING_PAYMENT']);

export type MembershipFacts = {
  /** Holds a place: on the roster, or paid up. */
  enrolled: boolean;
  /** Waiting on the TUTOR's own approval queue. */
  awaitingTutor: boolean;
};

/**
 * Does this student hold a place in this class?
 *
 * groupId null means "any class of this tutor's" — used when an invitation was
 * sent before the teacher had created a class.
 */
export async function readMembership(
  admin: SupabaseClient,
  params: { studentId: string; groupId: string | null; tutorId?: string }
): Promise<MembershipFacts> {
  let groupIds: string[] = [];

  if (params.groupId) {
    groupIds = [params.groupId];
  } else if (params.tutorId) {
    const { data } = await admin
      .from('groups')
      .select('id')
      .eq('tutor_id', params.tutorId)
      .is('archived_at', null);
    groupIds = ((data ?? []) as Array<{ id: string }>).map((g) => g.id);
  }

  if (groupIds.length === 0) return { enrolled: false, awaitingTutor: false };

  const [{ data: members }, { data: enrolments }] = await Promise.all([
    admin
      .from('group_members')
      .select('group_id, status')
      .eq('user_id', params.studentId)
      .in('group_id', groupIds),
    admin
      .from('group_enrollments')
      .select('group_id, status')
      .eq('student_id', params.studentId)
      .in('group_id', groupIds),
  ]);

  let enrolled = false;
  let awaitingTutor = false;

  for (const row of (members ?? []) as Array<{ status: string }>) {
    const state = classifyMembership(row.status);
    if (state === 'enrolled') enrolled = true;
    else if (state === 'pending') awaitingTutor = true;
  }

  for (const row of (enrolments ?? []) as Array<{ status: string }>) {
    const status = String(row.status ?? '').toUpperCase();
    if (ENROLMENT_HOLDS_PLACE.has(status)) enrolled = true;
    else if (ENROLMENT_AWAITING.has(status)) awaitingTutor = true;
  }

  return { enrolled, awaitingTutor };
}

/** The children a parent has consented links to. The parent-credit hop. */
export async function childrenOf(
  admin: SupabaseClient,
  parentId: string
): Promise<string[]> {
  const { data } = await admin
    .from('parent_child_links')
    .select('child_id')
    .eq('parent_id', parentId);
  return ((data ?? []) as Array<{ child_id: string }>).map((r) => r.child_id);
}

/** The parents who hold a consented link to this child. */
export async function parentsOf(
  admin: SupabaseClient,
  childId: string
): Promise<string[]> {
  const { data } = await admin
    .from('parent_child_links')
    .select('parent_id')
    .eq('child_id', childId);
  return ((data ?? []) as Array<{ parent_id: string }>).map((r) => r.parent_id);
}

// ---------------------------------------------------------------------------
// Needs attention
// ---------------------------------------------------------------------------

/**
 * Why this invitation needs the teacher's attention, or null if it does not.
 *
 * Checked in severity order: a row that both failed to send and went stale is
 * a send failure, because that is the one the teacher can act on.
 */
export function attentionReason(
  invite: ClassInviteRow,
  now: number = Date.now()
): AttentionReason | null {
  if (invite.status === 'failed') {
    // The reason was recorded on the delivery columns at creation time.
    if (invite.delivery_state === 'send_failed') return 'send_failed';
    if (invite.delivery_state === 'suppressed') return 'suppressed';
    return 'invalid_email';
  }

  if (invite.delivery_state === 'bounced' || invite.delivery_state === 'complained') {
    return 'send_failed';
  }
  if (invite.delivery_state === 'send_failed') return 'send_failed';

  // A suppressed send reports success from emailService, so without this the
  // dashboard would show a green "Invitation sent" for mail that never left.
  if (invite.delivery_state === 'suppressed') return 'suppressed';

  if (invite.status === 'pending' && !invite.accepted_at) {
    const sentAt = invite.last_sent_at ? Date.parse(invite.last_sent_at) : Date.parse(invite.created_at);
    if (Number.isFinite(sentAt) && now - sentAt > STALE_AFTER_MS) return 'stale';
  }

  return null;
}

/** When this invitation may be re-sent, or null if it already may be. */
export function canResendAt(
  invite: ClassInviteRow,
  now: number = Date.now()
): string | null {
  if (invite.send_count > MAX_RESENDS_PER_INVITE) {
    // Exhausted. Far future rather than null so the UI renders it as blocked
    // rather than available; the route refuses it either way.
    return new Date(8640000000000000).toISOString();
  }
  if (!invite.last_sent_at) return null;
  const next = Date.parse(invite.last_sent_at) + MIN_RESEND_INTERVAL_MS;
  return next > now ? new Date(next).toISOString() : null;
}

// ---------------------------------------------------------------------------
// The teacher's vocabulary
// ---------------------------------------------------------------------------

export type StateInputs = {
  invite: ClassInviteRow;
  /** Does the claiming account exist yet? */
  hasAccount: boolean;
  /** For a parent invite: has the parent linked any child? */
  parentHasChild: boolean;
  membership: MembershipFacts;
  /** Is a class_join_requests row PENDING for the relevant student? */
  parentApprovalPending: boolean;
  parentDeclined: boolean;
  now?: number;
};

/**
 * Translate a row into what the teacher sees.
 *
 * Order matters and encodes the product decision: none of the intermediate
 * states count toward the 5. A teacher must not be able to reach 5/5 by
 * inviting five people and never pressing Approve — so 'awaiting_your_approval'
 * is a call to action on the teacher, not a success. Equally, a child waiting on
 * a parent is NOT the teacher's blocker, and the UI says so, because otherwise
 * the teacher chases the wrong person.
 */
export function deriveInviteState(input: StateInputs): {
  state: InviteState;
  attentionReason: AttentionReason | null;
  counts: boolean;
} {
  const { invite } = input;
  const now = input.now ?? Date.now();

  if (invite.status === 'joined') {
    return { state: 'joined', attentionReason: null, counts: true };
  }
  if (invite.status === 'revoked') {
    return { state: 'revoked', attentionReason: null, counts: false };
  }
  if (invite.status === 'declined' || input.parentDeclined) {
    return {
      state: input.parentDeclined ? 'needs_attention' : 'declined',
      attentionReason: input.parentDeclined ? 'parent_declined' : null,
      counts: false,
    };
  }

  const attention = attentionReason(invite, now);
  if (attention) {
    return { state: 'needs_attention', attentionReason: attention, counts: false };
  }

  if (invite.status === 'expired' || Date.parse(invite.expires_at) < now) {
    return { state: 'expired', attentionReason: null, counts: false };
  }

  if (input.membership.awaitingTutor) {
    return { state: 'awaiting_your_approval', attentionReason: null, counts: false };
  }
  if (input.parentApprovalPending) {
    return { state: 'parent_approval_pending', attentionReason: null, counts: false };
  }

  if (invite.status === 'accepted' || input.hasAccount) {
    if (invite.role === 'parent' && !input.parentHasChild) {
      return { state: 'parent_child_not_linked', attentionReason: null, counts: false };
    }
    return { state: 'signed_up_not_in_class', attentionReason: null, counts: false };
  }

  return {
    state: invite.invitee_kind === 'parent' ? 'invited_parent' : 'invited_student',
    attentionReason: null,
    counts: false,
  };
}

/** Does this state belong in the "Invited" tile? */
export function isInvitedState(state: InviteState): boolean {
  return (
    state === 'invited_student' ||
    state === 'invited_parent' ||
    state === 'signed_up_not_in_class' ||
    state === 'parent_child_not_linked' ||
    state === 'parent_approval_pending' ||
    state === 'awaiting_your_approval'
  );
}

/**
 * The 3 in "3 / 5".
 *
 * DISTINCT BY STUDENT, not by row. One person invited to two of a teacher's
 * classes is one student who joined, and counting rows would let a teacher
 * reach the goal by re-inviting the same three people.
 */
export function countJoined(
  rows: Array<{ state: InviteState; joinedStudentId: string | null }>
): number {
  const students = new Set<string>();
  for (const row of rows) {
    if (row.state === 'joined' && row.joinedStudentId) students.add(row.joinedStudentId);
  }
  return students.size;
}

export function summarise(views: InviteeView[]): {
  joined: number;
  invited: number;
  needsAttention: number;
  awaitingApproval: number;
  awaitingParent: number;
} {
  return {
    joined: countJoined(views),
    invited: views.filter((v) => isInvitedState(v.state)).length,
    needsAttention: views.filter((v) => v.state === 'needs_attention').length,
    awaitingApproval: views.filter((v) => v.state === 'awaiting_your_approval').length,
    awaitingParent: views.filter((v) => v.state === 'parent_approval_pending').length,
  };
}
