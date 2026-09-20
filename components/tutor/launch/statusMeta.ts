/**
 * One vocabulary for the funnel, in one file.
 *
 * Mirrors SUB_STATUS_CFG on the class detail page. The point of a table like
 * this is that a status added later cannot be styled in one place and worded
 * differently in another — and in particular that `counts` lives beside the
 * label, so the tick a teacher sees and the number in the header are decided
 * by the same line of code.
 *
 * The `help` strings do real work. Two of these states are things the teacher
 * cannot fix — a parent who has not answered, a child not yet linked — and a
 * dashboard that lists them without saying so sends the teacher chasing the
 * wrong person.
 */

import type { InviteState, AttentionReason } from '@/lib/classInvites/types';

export type StatusConfig = {
  label: string;
  /** Chip classes. Tutor-side tokens; do not carry these into /admin. */
  cls: string;
  help: string;
  /** Whether this row is one of the 5. Rendered as a tick, never inferred. */
  counts: boolean;
  /** The row's primary action, or null when there is nothing to do. */
  action: 'resend' | 'send_link' | 'remind_parent' | 'approve' | 'open' | 'fix' | null;
};

export const STATUS_CFG: Record<InviteState, StatusConfig> = {
  invited_student: {
    label: 'Invitation sent',
    cls: 'border-border bg-muted text-muted-foreground',
    help: 'No account yet. They have been emailed and can join whenever they like.',
    counts: false,
    action: 'resend',
  },
  invited_parent: {
    label: 'Invitation sent · parent',
    cls: 'border-border bg-muted text-muted-foreground',
    help: 'Parents add their child first, then approve the class.',
    counts: false,
    action: 'resend',
  },
  signed_up_not_in_class: {
    label: 'Signed up — not in your class',
    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    help: 'They have an iTutor account but have not joined the class yet. Send them the link.',
    counts: false,
    action: 'send_link',
  },
  parent_child_not_linked: {
    label: 'Parent joined — child not added',
    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    help: 'The parent has an account but has not linked their child yet.',
    counts: false,
    action: 'remind_parent',
  },
  parent_approval_pending: {
    label: 'Waiting on parent approval',
    cls: 'border-purple-500/30 bg-purple-500/10 text-purple-600',
    help: 'The student has done everything. Their parent has not answered yet — this one is not on you.',
    counts: false,
    action: 'remind_parent',
  },
  awaiting_your_approval: {
    label: 'Waiting for you to approve',
    cls: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    help: 'They accepted and asked to join. Approve them on the class roster and they are in.',
    counts: false,
    action: 'approve',
  },
  joined: {
    label: 'Joined',
    cls: 'border-green-600/30 bg-green-600/10 text-green-700',
    help: 'Accepted, registered and in the class. This one counts.',
    counts: true,
    action: 'open',
  },
  needs_attention: {
    label: 'Needs attention',
    cls: 'border-rose-500/30 bg-rose-500/10 text-rose-600',
    help: 'This invitation did not get where it was going.',
    counts: false,
    action: 'fix',
  },
  declined: {
    label: 'Declined',
    cls: 'border-border bg-muted text-muted-foreground',
    help: 'They said no. You can invite them again later.',
    counts: false,
    action: 'resend',
  },
  expired: {
    label: 'Expired',
    cls: 'border-border bg-muted text-muted-foreground',
    help: 'Nobody acted on this within 30 days.',
    counts: false,
    action: 'resend',
  },
  revoked: {
    label: 'Withdrawn',
    cls: 'border-border bg-muted text-muted-foreground',
    help: 'You withdrew this invitation.',
    counts: false,
    action: null,
  },
};

/** The sub-reason shown inside the chip, so "Needs attention" is never vague. */
export const ATTENTION_LABEL: Record<AttentionReason, string> = {
  invalid_email: 'Invalid email',
  send_failed: "Couldn't send",
  suppressed: 'Not delivered',
  duplicate: 'Duplicate',
  self_invite: 'Your own address',
  stale: 'No reply in a week',
  parent_declined: 'Parent declined',
};

/** What to do about it, in the row. */
export const ATTENTION_FIX: Record<AttentionReason, string> = {
  invalid_email: 'Check the spelling and invite them again.',
  send_failed: 'The email bounced back. Try another address.',
  suppressed: 'Email is not switched on in this environment, so nothing was sent.',
  duplicate: 'You already invited this address.',
  self_invite: 'That is your own account.',
  stale: 'Sent over a week ago with no reply. Remind them, or try another address.',
  parent_declined: 'Their parent said no to this class.',
};

export const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'joined', label: 'Joined' },
  { key: 'invited', label: 'Invited' },
  { key: 'attention', label: 'Needs attention' },
] as const;

export type FilterKey = (typeof FILTERS)[number]['key'];
