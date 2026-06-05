// =====================================================
// CREDIT REFUND SERVICE
// =====================================================
// Records a refund liability in credit_refund_liabilities
// instead of calling LuniPay. Active while LuniPay's
// refund API is unavailable.
//
// For late student cancellations:
//   - student gets credit_amount (50%)
//   - tutor gets tutor_cash_payout_amount (50%) via payout_ledger
// All other refund scenarios: full credit to the student.
// =====================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type CreditRefundScenario =
  | 'student_cancelled'
  | 'student_late_cancel'
  | 'tutor_cancelled'
  | 'noshow_tutor'
  | 'noshow_tie'
  | 'admin_manual'
  | 'session_removed'
  | 'class_removed'
  | 'slot_conflict';

export interface RecordCreditRefundOpts {
  admin: SupabaseClient<any, 'public', 'public', any, any>;
  userId: string;
  userRole: 'student' | 'tutor';
  scenario: CreditRefundScenario;
  reason?: string;
  creditAmountTtd: number;
  originalAmountTtd?: number;
  tutorCashPayoutTtd?: number;
  bookingId?: string | null;
  sessionId?: string | null;
  classId?: string | null;
  originalPaymentId?: string | null;
  originalLunipayTransactionId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CreditRefundResult {
  ok: boolean;
  liabilityId: string | null;
  creditAmountTtd: number;
  tutorCashPayoutTtd: number;
  message: string;
}

export async function recordCreditRefund(
  opts: RecordCreditRefundOpts
): Promise<CreditRefundResult> {
  const {
    admin,
    userId,
    userRole,
    scenario,
    reason,
    creditAmountTtd,
    originalAmountTtd,
    tutorCashPayoutTtd = 0,
    bookingId,
    sessionId,
    classId,
    originalPaymentId,
    originalLunipayTransactionId,
    metadata = {},
  } = opts;

  const { data, error } = await admin
    .from('credit_refund_liabilities')
    .insert({
      user_id: userId,
      user_role: userRole,
      scenario,
      reason: reason ?? null,
      credit_amount: creditAmountTtd,
      original_amount: originalAmountTtd ?? null,
      tutor_cash_payout_amount: tutorCashPayoutTtd,
      booking_id: bookingId ?? null,
      session_id: sessionId ?? null,
      class_id: classId ?? null,
      original_payment_id: originalPaymentId ?? null,
      original_lunipay_transaction_id: originalLunipayTransactionId ?? null,
      source: 'refund_policy_pause',
      status: 'pending',
      metadata,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[creditRefundService] insert failed:', error);
    return {
      ok: false,
      liabilityId: null,
      creditAmountTtd,
      tutorCashPayoutTtd,
      message: `Failed to record credit liability: ${error.message}`,
    };
  }

  return {
    ok: true,
    liabilityId: data.id,
    creditAmountTtd,
    tutorCashPayoutTtd,
    message: 'Credit liability recorded.',
  };
}

// ── Disclaimer copy ────────────────────────────────────────────────────────

export const CREDIT_DISCLAIMER = {
  student:
    'Your refund will be issued as credits. Our credit system is currently in development, so the credits may not be usable immediately. Once credits are available, you will be able to use them toward future classes.',

  tutor:
    'Any refund or credit adjustment related to this class will be recorded as credits for now. Our credit system is currently in development, so credits may not be usable immediately. Once credits are available, they will be reflected in the user\'s account.',

  student_late_cancel:
    'Because this class was cancelled late, you will receive 50% of the class value as credits. Our credit system is currently in development, so the credits may not be usable immediately. Once credits are available, you will be able to use them toward future classes.',

  tutor_late_cancel_student:
    'Because the student cancelled late, you will still receive 50% of the class value as a payout.',
} as const;
