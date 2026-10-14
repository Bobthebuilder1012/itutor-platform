// Row shapes for the credit tables (migration 268). Hand-written: the repo has
// no generated Supabase types. Amounts arrive from PostgREST as strings or
// numbers depending on the column, so read them through Number().

export type CreditSource = 'referral' | 'campaign_code' | 'admin';

export type CreditLedgerKind = 'grant' | 'spend' | 'restore' | 'clawback' | 'expiry' | 'adjustment';

export type CreditLedgerState = 'pending' | 'available' | 'void' | 'reserved' | 'settled' | 'released';

/** Which way credits reach a payment. See lib/credits/quote.ts. */
export type CreditScenario =
  /** Discount the next renewal of an existing Stripe subscription. */
  | 'A'
  /** One month of a class, paid once, never renews. */
  | 'B'
  /** First month of a new subscription. Needs real cash on the first invoice. */
  | 'C';

export interface CreditSettings {
  referrals_enabled: boolean;
  referrals_enabled_at: string | null;
  campaign_codes_enabled: boolean;
  referrals_required: number;
  credit_value_ttd: number;
  min_qualifying_cash_ttd: number;
  min_cash_charge_ttd: number;
  hold_days: number;
  max_rewards_per_user: number | null;
  flag_conversions_threshold: number;
  expiry_days: number | null;
  code_attempt_limit: number;
  updated_by: string | null;
  updated_at: string;
}

export interface CreditWallet {
  user_id: string;
  available_ttd: number;
  pending_ttd: number;
  reserved_ttd: number;
}

export interface CreditAllocation {
  grant_id: string;
  amount: number;
}

export interface CreditSpendContext {
  scenario?: CreditScenario;
  /** The full class price this spend discounted — what the tutor is paid on. */
  base_ttd?: number;
  enrollment_id?: string;
  group_id?: string;
  stripe_subscription_id?: string;
  /** Scenario A: the renewal the coupon is expected to land on. */
  period_end?: string;
}

export interface CreditLedgerRow {
  id: string;
  user_id: string;
  kind: CreditLedgerKind;
  amount_ttd: number;
  state: CreditLedgerState;
  source: CreditSource | null;
  source_id: string | null;
  remaining_ttd: number | null;
  available_at: string | null;
  expires_at: string | null;
  clawed_back: boolean;
  allocations: CreditAllocation[] | null;
  related_id: string | null;
  subscription_payment_id: string | null;
  stripe_coupon_id: string | null;
  context: CreditSpendContext;
  shortfall_ttd: number;
  note: string | null;
  idempotency_key: string;
  created_by: string | null;
  created_at: string;
}

export type ReferralStatus = 'signed_up' | 'converted' | 'rejected';

export interface ReferralRow {
  id: string;
  referrer_id: string;
  referee_id: string;
  code: string;
  status: ReferralStatus;
  is_sibling_referral: boolean;
  clicked_at: string | null;
  qualifying_payment_id: string | null;
  cash_paid_ttd: number | null;
  payer_id: string | null;
  payer_fingerprint: string | null;
  rejected_reason: string | null;
  converted_at: string | null;
  rejected_at: string | null;
  grant_id: string | null;
  created_at: string;
}
