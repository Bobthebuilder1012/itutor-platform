// Shared shapes for the teacher activation funnel.
//
// The invite row is the database's vocabulary; InviteState is the teacher's.
// They are deliberately different: `status='accepted'` means one thing to a
// query and four different things to a teacher looking at a list, depending on
// whether the account exists, whether a parent has linked a child, and whose
// approval is outstanding. deriveInviteState() in counting.ts is where the
// translation happens, and it is the only place it happens.

export type InviteStatus =
  | 'pending'
  | 'accepted'
  | 'joined'
  | 'declined'
  | 'expired'
  | 'revoked'
  | 'failed';

export type DeliveryState =
  | 'queued'
  | 'sent'
  | 'suppressed'
  | 'send_failed'
  | 'bounced'
  | 'complained';

export type InviteeKind = 'student' | 'parent' | 'unknown';
export type InviteSource = 'single' | 'csv' | 'link' | 'direct_add';

/** A class_invites row, as every module here reads it. */
export type ClassInviteRow = {
  id: string;
  tutor_id: string;
  group_id: string | null;
  invitee_email: string;
  invitee_name: string | null;
  invitee_kind: InviteeKind;
  token: string;
  user_id: string | null;
  claimed_at: string | null;
  role: 'student' | 'parent';
  joined_student_id: string | null;
  status: InviteStatus;
  delivery_state: DeliveryState;
  delivery_error: string | null;
  provider_message_id: string | null;
  last_sent_at: string | null;
  send_count: number;
  source: InviteSource;
  batch_id: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  joined_at: string | null;
  revoked_at: string | null;
};

/**
 * What the teacher sees on a row. Ordered as the funnel runs, because the list
 * is sorted by it and the order is the story: an invitation goes out, an
 * account appears, a parent links a child, someone approves, the student is in.
 */
export type InviteState =
  | 'invited_student'
  | 'invited_parent'
  | 'signed_up_not_in_class'
  | 'parent_child_not_linked'
  | 'parent_approval_pending'
  | 'awaiting_your_approval'
  | 'joined'
  | 'needs_attention'
  | 'declined'
  | 'expired'
  | 'revoked';

/**
 * Why a row needs attention. 'stale' is the honest stand-in for a bounce until
 * delivery webhooks exist — an address with no engagement after a week is where
 * bounces actually live.
 */
export type AttentionReason =
  | 'invalid_email'
  | 'send_failed'
  | 'suppressed'
  | 'duplicate'
  | 'self_invite'
  | 'stale'
  | 'parent_declined';

/** One row of the Migration Dashboard. */
export type InviteeView = {
  id: string;
  email: string;
  name: string | null;
  kind: InviteeKind;
  state: InviteState;
  /** Set only when state is 'needs_attention'. */
  attentionReason: AttentionReason | null;
  /** Whether this row counts toward the 5. Rendered as a tick, never inferred. */
  counts: boolean;
  groupId: string | null;
  className: string | null;
  source: InviteSource;
  invitedAt: string;
  lastSentAt: string | null;
  sendCount: number;
  /** When a resend becomes possible again; null when it already is. */
  canResendAt: string | null;
  /** For a parent invite that produced a student: who actually joined. */
  joinedStudentName: string | null;
  /**
   * Carried so the joined count can be distinct by student rather than by row.
   * Never rendered — the name above is what a teacher reads.
   */
  joinedStudentId: string | null;
};

/** The §5 goal, as the banner and the dashboard header both read it. */
export type LaunchGoal = {
  target: number;
  joined: number;
  invited: number;
  needsAttention: number;
  awaitingApproval: number;
  awaitingParent: number;
  /** profiles.tutor_verified_at — null when the teacher is not yet verified. */
  windowStartsAt: string | null;
  windowEndsAt: string | null;
  daysLeft: number | null;
  inWindow: boolean;
  activated: boolean;
  complete: boolean;
  metAt: string | null;
};

export const LAUNCH_GOAL_TARGET = 5;
export const LAUNCH_WINDOW_DAYS = 14;
