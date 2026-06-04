export function fmtTTD(amount: number): string {
  return `TT$${amount.toFixed(2)}`;
}

export async function createRequiredNotice(
  admin: any,
  notice: {
    user_id: string;
    type: string;
    title: string;
    message: string;
    severity?: 'info' | 'success' | 'warning' | 'danger';
    requires_ack?: boolean;
    related_payment_id?: string | null;
    related_subscription_payment_id?: string | null;
    related_booking_id?: string | null;
    related_session_id?: string | null;
    related_group_id?: string | null;
    related_group_enrollment_id?: string | null;
    related_group_removal_id?: string | null;
    related_payout_case_id?: string | null;
    related_noshow_claim_id?: string | null;
    refund_amount_ttd?: number | null;
    retained_amount_ttd?: number | null;
    tutor_payout_amount_ttd?: number | null;
    platform_fee_impact_ttd?: number | null;
  }
): Promise<void> {
  const { error } = await admin.from('required_notices').insert({
    user_id: notice.user_id,
    type: notice.type,
    title: notice.title,
    message: notice.message,
    severity: notice.severity ?? 'info',
    requires_ack: notice.requires_ack ?? false,
    related_payment_id: notice.related_payment_id ?? null,
    related_subscription_payment_id: notice.related_subscription_payment_id ?? null,
    related_booking_id: notice.related_booking_id ?? null,
    related_session_id: notice.related_session_id ?? null,
    related_group_id: notice.related_group_id ?? null,
    related_group_enrollment_id: notice.related_group_enrollment_id ?? null,
    related_group_removal_id: notice.related_group_removal_id ?? null,
    related_payout_case_id: notice.related_payout_case_id ?? null,
    related_noshow_claim_id: notice.related_noshow_claim_id ?? null,
    refund_amount_ttd: notice.refund_amount_ttd ?? null,
    retained_amount_ttd: notice.retained_amount_ttd ?? null,
    tutor_payout_amount_ttd: notice.tutor_payout_amount_ttd ?? null,
    platform_fee_impact_ttd: notice.platform_fee_impact_ttd ?? null,
  });

  if (error) {
    console.error('[createRequiredNotice] Failed to insert notice:', {
      user_id: notice.user_id,
      type: notice.type,
      error: error.message,
    });
  }
}
