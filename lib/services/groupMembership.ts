// group_members.status has two vocabularies in this codebase, both live:
//
//   'active'   / 'pending_approval'   written by app/api/classes/[id]/join
//   'approved' / 'pending'            written by the group + parent join routes
//
// Nothing normalises them, so any code that recognises only one set will read a
// real membership as "not a member" — and then hand out a second seat, or tell a
// parent their child clashes with a class the child is already sitting in.
// Until the column is reconciled, read every status through here.

export type MembershipState = 'enrolled' | 'pending' | null;

const ENROLLED = ['active', 'approved'];
const PENDING = ['pending', 'pending_approval', 'invited'];

/** 'enrolled', 'pending', or null for rejected / removed / suspended / absent. */
export function classifyMembership(status: string | null | undefined): MembershipState {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (ENROLLED.includes(s)) return 'enrolled';
  if (PENDING.includes(s)) return 'pending';
  return null;
}

/** True when the row already holds a place — enrolled or waiting on the tutor. */
export function holdsPlace(status: string | null | undefined): boolean {
  return classifyMembership(status) !== null;
}
