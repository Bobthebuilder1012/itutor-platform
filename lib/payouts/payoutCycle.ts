// Monthly per-tutor payout cycles for lesson earnings.
//
// TypeScript twin of the SQL in supabase/migrations/266_tutor_payout_cycles.sql
// (payout_cycle_date / payout_cycle_index_after). The database is the source
// of truth for next_payout_on; this copy is for display, urgency and tests.
// Keep the two in step — scripts/verify-payout-cycle.ts checks this one.
//
// All dates are Port of Spain calendar dates as 'YYYY-MM-DD' strings, so no
// time zone or DST can move them.

export const PAYOUT_TIME_ZONE = 'America/Port_of_Spain';

/** A tutor whose payout is this many days away or fewer is "due soon" (yellow). */
export const DUE_SOON_DAYS = 7;

export type PayoutUrgency = 'overdue' | 'due_soon' | 'not_due' | 'nothing_owed';

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split('-').map(Number);
  return [y, m, d];
}

function fmt(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar date of an instant in Port of Spain. */
export function localDate(instant: string | Date, timeZone = PAYOUT_TIME_ZONE): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** The fixed payout day: day of month of the first lesson payment. */
export function payoutDayFrom(anchorDate: string): number {
  return parts(anchorDate)[2];
}

/**
 * The n-th payout date (n = 1 is one month after the first payment). A month
 * without the payout day uses its last day, for that cycle only.
 */
export function cycleDate(anchorDate: string, n: number): string {
  const [y, m, day] = parts(anchorDate);
  const monthIndex = (m - 1) + n;
  const yy = y + Math.floor(monthIndex / 12);
  const mm = (((monthIndex % 12) + 12) % 12) + 1;
  return fmt(yy, mm, Math.min(day, daysInMonth(yy, mm)));
}

/** Index of the first cycle whose date is strictly after `floor`. */
export function cycleIndexAfter(anchorDate: string, floor: string): number {
  const [ay, am] = parts(anchorDate);
  const [fy, fm] = parts(floor);
  let n = Math.max(1, (fy - ay) * 12 + (fm - am));
  while (cycleDate(anchorDate, n) <= floor) n += 1;
  return n;
}

export function firstPayoutDate(anchorDate: string): string {
  return cycleDate(anchorDate, 1);
}

/**
 * Where next_payout_on moves when a payout is confirmed on `confirmedOn`.
 * Paying late or on time moves to the next cycle; paying EARLY uses up the
 * cycle that was due, so money arriving before that date waits for the one
 * after. The payout day itself never changes.
 */
export function advanceAfterConfirm(
  anchorDate: string,
  currentNext: string,
  confirmedOn: string
): { nextPayoutOn: string; paidCycleOn: string } {
  const floor = confirmedOn > currentNext ? confirmedOn : currentNext;
  const n = cycleIndexAfter(anchorDate, floor);
  return { nextPayoutOn: cycleDate(anchorDate, n), paidCycleOn: cycleDate(anchorDate, n - 1) };
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Red: the payout date has passed and money is owed. Yellow: due today or
 * within DUE_SOON_DAYS. Green: later than that. Nothing owed sorts last.
 */
export function payoutUrgency(
  nextPayoutOn: string | null,
  today: string,
  owedTtd: number,
  dueSoonDays = DUE_SOON_DAYS
): PayoutUrgency {
  if (!(owedTtd > 0) || !nextPayoutOn) return 'nothing_owed';
  const days = daysBetween(today, nextPayoutOn);
  if (days < 0) return 'overdue';
  if (days <= dueSoonDays) return 'due_soon';
  return 'not_due';
}

const URGENCY_RANK: Record<PayoutUrgency, number> = {
  overdue: 0,
  due_soon: 1,
  not_due: 2,
  nothing_owed: 3,
};

export type UrgencySortable = {
  urgency: PayoutUrgency;
  next_payout_on: string | null;
  owed_ttd: number;
  name: string;
};

/**
 * Red first (most overdue on top), then yellow (soonest first), then green,
 * then tutors owed nothing. Within a band an earlier payout date is more
 * urgent; ties go to the larger amount, then the name.
 */
export function compareByUrgency(a: UrgencySortable, b: UrgencySortable): number {
  const r = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency];
  if (r !== 0) return r;
  const an = a.next_payout_on ?? '9999-12-31';
  const bn = b.next_payout_on ?? '9999-12-31';
  if (an !== bn) return an < bn ? -1 : 1;
  if (a.owed_ttd !== b.owed_ttd) return b.owed_ttd - a.owed_ttd;
  return a.name.localeCompare(b.name);
}

export type OwedLedgerRow = {
  status: string;
  batch_id: string | null;
  refund_pending?: boolean;
  secured_unreleased?: boolean;
};

/**
 * Whether a lesson ledger row counts toward what a tutor is owed right now.
 * A row already in a batch (paid or awaiting confirmation) never does — that
 * is what stops the same payment going into two CSVs.
 */
export function isOwedNow(row: OwedLedgerRow): boolean {
  if (row.batch_id) return false;
  if (row.status !== 'owed' && row.status !== 'release_ready') return false;
  if (row.secured_unreleased) return false;
  if (row.refund_pending) return false;
  return true;
}

/** Mask everything but the last four characters of an account number. */
export function maskAccount(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = String(value).replace(/\s+/g, '');
  return v.length <= 4 ? '••••' : `••••${v.slice(-4)}`;
}
