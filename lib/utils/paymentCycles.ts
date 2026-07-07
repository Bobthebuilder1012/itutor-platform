import { addDays, addMonths, isAfter } from 'date-fns';

/**
 * Payment-cycle model for the class "Students" table + Payment History panel.
 *
 * IMPORTANT — this history is SYNTHESIZED, not real payment records. The app
 * only stores a subscription's CURRENT cycle (group_enrollments), so past
 * cycles are generated from the join date using the model below:
 *   - Due dates are anchored to the student's original join day-of-month and
 *     never drift.
 *   - A student has exactly ONE open (current) cycle at a time; the next cycle
 *     does not open until the current one is settled. So a student can never
 *     hold two simultaneous unpaid/overdue cycles, and "outstanding balance" is
 *     always a single cycle's fee.
 *   - The current cycle's paid/unpaid state is seeded from the member's REAL
 *     subscription status; past cycles are assumed paid (with light,
 *     deterministic lateness variation for demo realism).
 * Wire to a real payments/transactions table to make this authoritative.
 */

export type PaymentStatus = 'ON_TIME' | 'LATE' | 'DUE' | 'OVERDUE';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED';

export interface PaymentCycle {
  periodStart: Date;
  periodEnd: Date;
  dueDate: Date;
  gracePeriodEnd: Date;
  amount: number;
  currency: string;
  paidDate: Date | null;
  /** True only for the single open/unresolved cycle a student is presently on. */
  isCurrentCycle: boolean;
}

export const GRACE_PERIOD_DAYS = 5;
const DEFAULT_CURRENCY = 'TT$';

/** Subscription statuses that mean the live cycle has NOT been settled. */
const UNSETTLED_STATUSES = ['GRACE', 'SUSPENDED', 'PENDING_PAYMENT', 'ACTIVATION_FAILED'];

export function getPaymentStatus(
  cycle: Pick<PaymentCycle, 'gracePeriodEnd' | 'paidDate' | 'isCurrentCycle'>,
  today: Date = new Date(),
): PaymentStatus {
  const { gracePeriodEnd, paidDate, isCurrentCycle } = cycle;
  if (paidDate) {
    return paidDate.getTime() <= gracePeriodEnd.getTime() ? 'ON_TIME' : 'LATE';
  }
  // Unpaid cycles are always the current cycle under this model — generation
  // stops before a second unpaid cycle can exist.
  return isCurrentCycle && today.getTime() > gracePeriodEnd.getTime() ? 'OVERDUE' : 'DUE';
}

/**
 * Payment-derived membership: a student is suspended exactly when their current
 * cycle is OVERDUE. This is the single shared derivation consumed by BOTH the
 * Students table's Membership column and the Payment History panel, so the two
 * can never drift. Manual Ban/Remove sit on top of this as separate layers.
 */
export function getMembershipStatus(status: PaymentStatus): MembershipStatus {
  return status === 'OVERDUE' ? 'SUSPENDED' : 'ACTIVE';
}

export const STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string; icon: 'check' | 'clock' | 'alert-triangle' | 'alert-circle' }
> = {
  ON_TIME: { label: 'On Time', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'check' },
  DUE: { label: 'Due', className: 'bg-amber-50 text-amber-700 border-amber-200', icon: 'clock' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-50 text-red-700 border-red-200', icon: 'alert-triangle' },
  LATE: { label: 'Late', className: 'bg-orange-50 text-orange-700 border-orange-200', icon: 'alert-circle' },
};

export const MEMBERSHIP_META: Record<MembershipStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  SUSPENDED: { label: 'Suspended', className: 'bg-red-50 text-red-700' },
};

export interface MemberBilling {
  studentId: string;
  joinedAt: string | null;
  /** Real subscription.status, or null when the member has no subscription. */
  status: string | null;
  /** plan_price_ttd */
  amount: number | null;
  lastPaidAt: string | null;
}

// Stable per-student hash → deterministic demo lateness (no Math.random, so the
// generated history is stable across renders).
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Days after the due date a past cycle was "paid". Mostly within grace
// (on time); deterministically late on ~1 in 5 cycles for demo realism.
function paidLatenessDays(studentId: string, cycleIndex: number): number {
  const seed = hashStr(`${studentId}:${cycleIndex}`);
  return seed % 5 === 0 ? 7 + (seed % 3) : 1 + (seed % 3);
}

/**
 * Generate a member's billing cycles from their join date to today, newest
 * first. Returns [] when the member has no subscription or join date.
 */
export function generateHistoryForMember(mb: MemberBilling, today: Date = new Date()): PaymentCycle[] {
  if (!mb.joinedAt || !mb.status) return [];
  const amount = mb.amount ?? 0;
  const joined = new Date(mb.joinedAt);
  if (isNaN(joined.getTime())) return [];

  const currentUnsettled = UNSETTLED_STATUSES.includes(mb.status);
  const lastPaid = mb.lastPaidAt ? new Date(mb.lastPaidAt) : null;

  const cycles: PaymentCycle[] = [];
  let anchor = new Date(joined);
  let index = 0;

  while (!isAfter(anchor, today)) {
    const dueDate = new Date(anchor);
    const gracePeriodEnd = addDays(dueDate, GRACE_PERIOD_DAYS);
    const periodEnd = addDays(addMonths(dueDate, 1), -1);
    const isLatest = isAfter(addMonths(anchor, 1), today); // next anchor is in the future

    let paidDate: Date | null;
    if (isLatest && currentUnsettled) {
      // The single open cycle — seeded from the real subscription state.
      paidDate = null;
    } else if (isLatest && lastPaid && !isAfter(dueDate, lastPaid)) {
      // Settled current cycle: use the real payment date so lateness is honest.
      paidDate = lastPaid;
    } else {
      paidDate = addDays(dueDate, paidLatenessDays(mb.studentId, index));
    }

    cycles.push({
      periodStart: new Date(anchor),
      periodEnd,
      dueDate,
      gracePeriodEnd,
      amount,
      currency: DEFAULT_CURRENCY,
      paidDate,
      isCurrentCycle: paidDate === null,
    });

    if (paidDate === null) break; // one open cycle only
    anchor = addMonths(anchor, 1);
    index++;
  }

  return cycles.reverse();
}

/** The most recent cycle, open or resolved. */
export function getLatestCycle(cycles: PaymentCycle[]): PaymentCycle | undefined {
  return cycles[0];
}

/** Next due date — the open cycle's due date if unpaid, else the anchor after
 * the most recently resolved cycle. Not a stored cycle. */
export function getNextDueDate(cycles: PaymentCycle[]): Date | undefined {
  const latest = getLatestCycle(cycles);
  if (!latest) return undefined;
  return latest.isCurrentCycle ? latest.dueDate : addMonths(latest.dueDate, 1);
}
