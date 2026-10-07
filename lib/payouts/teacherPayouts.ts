// Teacher Payouts: lesson (group class) earnings grouped by tutor.
//
// Server-only. Used by GET /api/admin/tutor-payouts (the page) and
// POST /api/admin/tutor-payouts/generate (the CSV), so the figure finance
// selects is exactly the set of ledger rows that goes into the batch.
//
// One-on-one session payouts are out of scope: only payout_ledger rows with a
// subscription_payment_id are read.

import {
  compareByUrgency,
  daysBetween,
  firstPayoutDate,
  payoutDayFrom,
  isOwedNow,
  localDate,
  maskAccount,
  payoutUrgency,
  type PayoutUrgency,
} from './payoutCycle';

export type LessonRowState =
  | 'owed'            // unpaid, goes in the next CSV
  | 'refund_pending'  // flagged: a refund request is open, held out of the CSV
  | 'secured'         // secured spot, not payable until the class starts
  | 'held'            // admin_hold (payout case)
  | 'in_batch'        // in a CSV awaiting "Confirm payout"
  | 'paid'
  | 'reversed';

export type LessonPayoutRow = {
  ledger_id: string;
  subscription_payment_id: string;
  enrollment_id: string | null;
  student_name: string | null;
  class_name: string | null;
  payment_type: string | null;
  student_paid_ttd: number | null;
  amount_ttd: number;
  amount_usd: number | null;
  payout_currency: 'TTD' | 'USD';
  received_at: string | null;
  state: LessonRowState;
  batch_id: string | null;
};

export type TeacherPayoutSummary = {
  tutor_id: string;
  name: string;
  email: string | null;
  payout_currency: 'TTD' | 'USD';
  account_masked: string | null;
  bank_name: string | null;
  has_bank_details: boolean;
  payout_day: number | null;
  next_payout_on: string | null;
  last_paid_at: string | null;
  last_paid_cycle_on: string | null;
  paid_early: boolean;
  days_until_payout: number | null;
  urgency: PayoutUrgency;
  total_earned_ttd: number;
  owed_ttd: number;
  owed_usd: number | null;
  owed_count: number;
  usd_awaiting_rate: boolean;
  refund_pending_ttd: number;
  refund_pending_count: number;
  held_ttd: number;
  secured_ttd: number;
  in_batch_ttd: number;
  paid_ttd: number;
  pending_deductions_ttd: number;
  rows: LessonPayoutRow[];
};

export type OpenLessonBatch = {
  batch_id: string;
  generated_at: string;
  currency: string;
  total_amount_ttd: number;
  total_amount_usd: number | null;
  line_count: number;
  csv_filename: string | null;
  csv_available: boolean;
  tutor_names: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function chunk<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function selectIn(admin: any, table: string, columns: string, column: string, ids: string[], optional = false) {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const out: any[] = [];
  for (const part of chunk(unique)) {
    const { data, error } = await admin.from(table).select(columns).in(column, part);
    // optional: a table from a migration that may not be applied yet.
    if (error && optional) return [];
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
  }
  return out;
}

/** Every lesson ledger row, paged past PostgREST's 1000-row cap. */
async function loadLessonLedger(admin: any, tutorIds?: string[]) {
  const out: any[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let q = admin
      .from('payout_ledger')
      .select('id, tutor_id, subscription_payment_id, amount_ttd, amount_usd, payout_currency, status, batch_id, created_at, released_at')
      .not('subscription_payment_id', 'is', null)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (tutorIds && tutorIds.length > 0) q = q.in('tutor_id', tutorIds);
    const { data, error } = await q;
    if (error) throw new Error(`payout_ledger: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

export async function loadTeacherPayouts(
  admin: any,
  opts: { tutorIds?: string[]; now?: Date } = {}
): Promise<{ today: string; tutors: TeacherPayoutSummary[]; open_batches: OpenLessonBatch[] }> {
  const today = localDate(opts.now ?? new Date());
  const ledger = await loadLessonLedger(admin, opts.tutorIds);

  const spIds = ledger.map((r) => r.subscription_payment_id);
  const payments = await selectIn(
    admin, 'subscription_payments',
    'id, enrollment_id, group_id, student_id, type, amount_ttd, charged_processing_fee_ttd, paid_at, created_at',
    'id', spIds
  );
  const paymentById = new Map(payments.map((p) => [p.id, p]));

  const enrollmentIds = payments.map((p) => p.enrollment_id).filter(Boolean);
  const [enrollments, groups, removals, refunds] = await Promise.all([
    selectIn(admin, 'group_enrollments', 'id, status, release_date', 'id', enrollmentIds),
    selectIn(admin, 'groups', 'id, name', 'id', payments.map((p) => p.group_id)),
    selectIn(admin, 'group_removals', 'enrollment_id, status, refund_issued', 'enrollment_id', enrollmentIds),
    selectIn(admin, 'subscription_refunds', 'subscription_payment_id, status', 'subscription_payment_id', spIds),
  ]);
  const enrollmentById = new Map(enrollments.map((e) => [e.id, e]));
  const groupById = new Map(groups.map((g) => [g.id, g]));

  // Open refund requests — the same rule as Lesson Payments' "Pending Refunds"
  // tab, plus a refund already started but not finished.
  const refundPendingEnrollments = new Set(
    removals
      .filter((r) => r.refund_issued === false && ['auto_processed', 'approved'].includes(r.status))
      .map((r) => r.enrollment_id)
  );
  const refundPendingPayments = new Set(
    refunds.filter((r) => r.status === 'pending').map((r) => r.subscription_payment_id)
  );

  const batchIds = ledger.map((r) => r.batch_id).filter(Boolean);
  const batches = await selectIn(
    admin, 'payout_batches',
    'id, status, generated_at, currency, total_amount_ttd, total_amount_usd, line_count, csv_filename, csv_generated_at, batch_type',
    'id', batchIds
  );
  const batchById = new Map(batches.map((b) => [b.id, b]));

  const tutorIds = Array.from(new Set(ledger.map((r) => r.tutor_id)));
  const studentIds = payments.map((p) => p.student_id);
  const [profiles, accounts, schedules, deductions] = await Promise.all([
    selectIn(admin, 'profiles', 'id, full_name, display_name, email', 'id', [...tutorIds, ...studentIds]),
    selectIn(admin, 'tutor_payout_accounts', 'tutor_id, payout_name, payout_account_identifier, bank_name, branch, payout_currency', 'tutor_id', tutorIds),
    selectIn(admin, 'tutor_payout_schedules', 'tutor_id, payout_day, next_payout_on, last_paid_at, last_paid_cycle_on', 'tutor_id', tutorIds, true),
    selectIn(admin, 'tutor_deductions', 'tutor_id, amount_ttd, status, deducted_from_batch_id', 'tutor_id', tutorIds),
  ]);
  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const accountByTutor = new Map(accounts.map((a) => [a.tutor_id, a]));
  const scheduleByTutor = new Map(schedules.map((s) => [s.tutor_id, s]));

  const byTutor = new Map<string, LessonPayoutRow[]>();
  for (const r of ledger) {
    const sp = paymentById.get(r.subscription_payment_id);
    const enr = sp?.enrollment_id ? enrollmentById.get(sp.enrollment_id) : null;
    const batch = r.batch_id ? batchById.get(r.batch_id) : null;
    const securedUnreleased =
      sp?.type === 'secure_spot' && enr?.status === 'SECURED' &&
      (!enr.release_date || String(enr.release_date).slice(0, 10) > today);
    const refundPending =
      (sp?.enrollment_id && refundPendingEnrollments.has(sp.enrollment_id)) ||
      refundPendingPayments.has(r.subscription_payment_id);

    let state: LessonRowState;
    if (r.status === 'released') state = 'paid';
    else if (r.status === 'reversed') state = 'reversed';
    else if (r.status === 'admin_hold') state = 'held';
    // A row in a cancelled batch has had its batch_id cleared, so any batch
    // here is live: awaiting download or confirmation.
    else if (r.batch_id && batch?.status !== 'paid') state = 'in_batch';
    else if (isOwedNow({ status: r.status, batch_id: r.batch_id, refund_pending: !!refundPending, secured_unreleased: !!securedUnreleased })) state = 'owed';
    else if (refundPending) state = 'refund_pending';
    else if (securedUnreleased) state = 'secured';
    else state = 'held';

    const student = sp?.student_id ? profileById.get(sp.student_id) : null;
    const row: LessonPayoutRow = {
      ledger_id: r.id,
      subscription_payment_id: r.subscription_payment_id,
      enrollment_id: sp?.enrollment_id ?? null,
      student_name: student?.display_name ?? student?.full_name ?? null,
      class_name: sp?.group_id ? groupById.get(sp.group_id)?.name ?? null : null,
      payment_type: sp?.type ?? null,
      student_paid_ttd: sp ? round2(Number(sp.amount_ttd ?? 0) + Number(sp.charged_processing_fee_ttd ?? 0)) : null,
      amount_ttd: Number(r.amount_ttd ?? 0),
      amount_usd: r.amount_usd == null ? null : Number(r.amount_usd),
      payout_currency: r.payout_currency === 'USD' ? 'USD' : 'TTD',
      received_at: sp?.paid_at ?? r.created_at ?? null,
      state,
      batch_id: r.batch_id ?? null,
    };
    const list = byTutor.get(r.tutor_id) ?? [];
    list.push(row);
    byTutor.set(r.tutor_id, list);
  }

  const tutors: TeacherPayoutSummary[] = [];
  for (const [tutorId, rows] of byTutor) {
    const pro = profileById.get(tutorId);
    const acc = accountByTutor.get(tutorId);
    const sched = scheduleByTutor.get(tutorId);
    const sum = (s: LessonRowState) => round2(rows.filter((x) => x.state === s).reduce((t, x) => t + x.amount_ttd, 0));
    const owedRows = rows.filter((x) => x.state === 'owed');
    const owedTtd = sum('owed');
    const usdOwedRows = owedRows.filter((x) => x.payout_currency === 'USD');
    const usdAwaitingRate = usdOwedRows.some((x) => x.amount_usd == null);
    const currency: 'TTD' | 'USD' = acc?.payout_currency === 'USD' ? 'USD' : 'TTD';
    // No schedule row only before migration 266 is applied: derive the first
    // cycle from the earliest payment so the tutor still sorts correctly.
    const earliest = rows.map((x) => x.received_at).filter(Boolean).sort()[0] ?? null;
    const fallbackAnchor = earliest ? localDate(earliest) : null;
    const next: string | null = sched?.next_payout_on ?? (fallbackAnchor ? firstPayoutDate(fallbackAnchor) : null);
    const lastPaidDate = sched?.last_paid_at ? localDate(sched.last_paid_at) : null;
    const pendingDeductions = round2(
      deductions
        .filter((d) => d.tutor_id === tutorId && d.status === 'pending' && !d.deducted_from_batch_id)
        .reduce((t, d) => t + Number(d.amount_ttd ?? 0), 0)
    );

    rows.sort((a, b) => String(b.received_at ?? '').localeCompare(String(a.received_at ?? '')));
    tutors.push({
      tutor_id: tutorId,
      name: pro?.full_name ?? pro?.display_name ?? 'Unknown tutor',
      email: pro?.email ?? null,
      payout_currency: currency,
      // Masked here, on the server: the full number never reaches the page.
      account_masked: maskAccount(acc?.payout_account_identifier),
      bank_name: acc?.bank_name ?? null,
      has_bank_details: !!(acc?.payout_account_identifier && acc?.bank_name && acc?.branch && acc?.payout_name),
      payout_day: sched?.payout_day ?? (fallbackAnchor ? payoutDayFrom(fallbackAnchor) : null),
      next_payout_on: next,
      last_paid_at: sched?.last_paid_at ?? null,
      last_paid_cycle_on: sched?.last_paid_cycle_on ?? null,
      paid_early: !!(lastPaidDate && sched?.last_paid_cycle_on && sched.last_paid_cycle_on > lastPaidDate),
      days_until_payout: next ? daysBetween(today, next) : null,
      urgency: payoutUrgency(next, today, owedTtd),
      total_earned_ttd: round2(rows.filter((x) => x.state !== 'reversed').reduce((t, x) => t + x.amount_ttd, 0)),
      owed_ttd: owedTtd,
      owed_usd: usdOwedRows.length > 0 && !usdAwaitingRate
        ? round2(usdOwedRows.reduce((t, x) => t + (x.amount_usd ?? 0), 0))
        : null,
      owed_count: owedRows.length,
      usd_awaiting_rate: usdAwaitingRate,
      refund_pending_ttd: sum('refund_pending'),
      refund_pending_count: rows.filter((x) => x.state === 'refund_pending').length,
      held_ttd: sum('held'),
      secured_ttd: sum('secured'),
      in_batch_ttd: sum('in_batch'),
      paid_ttd: sum('paid'),
      pending_deductions_ttd: pendingDeductions,
      rows,
    });
  }
  tutors.sort(compareByUrgency);

  // Lesson batches generated but not yet confirmed paid.
  const openBatches: OpenLessonBatch[] = batches
    .filter((b) => ['exported', 'pending_download'].includes(b.status))
    .map((b) => ({
      batch_id: b.id,
      generated_at: b.generated_at,
      currency: b.currency ?? 'TTD',
      total_amount_ttd: Number(b.total_amount_ttd ?? 0),
      total_amount_usd: b.total_amount_usd == null ? null : Number(b.total_amount_usd),
      line_count: Number(b.line_count ?? 0),
      csv_filename: b.csv_filename ?? null,
      csv_available: !!b.csv_generated_at,
      tutor_names: Array.from(new Set(
        ledger.filter((r) => r.batch_id === b.id).map((r) => profileById.get(r.tutor_id)?.full_name ?? 'Unknown')
      )),
    }))
    .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)));

  return { today, tutors, open_batches: openBatches };
}
