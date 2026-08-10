/**
 * Commission Calculator Utility
 * Calculates iTutor's commission — a flat base rate, honoring per-tutor
 * and global commission overrides (migration 180).
 */

import { type SupabaseClient } from '@supabase/supabase-js';

// The platform's base commission: a FLAT 7% of the session price,
// regardless of what the session costs.
//
// This replaced a price-tiered schedule (10% under TT$100, 15% under
// TT$200, 20% above) that charged a tutor selling a TT$250 session double
// the rate of one selling a TT$90 session. The rate is now uniform, and
// the only way it differs for a given tutor is a deliberate admin
// override — see getEffectiveCommissionRate below.
export const BASE_COMMISSION_RATE = 0.07;

/**
 * The base commission rate as a decimal, before any admin override.
 *
 * Takes the price purely for call-site compatibility; the rate no longer
 * varies with it.
 */
export function getCommissionRate(_pricePerSession?: number): number {
  return BASE_COMMISSION_RATE;
}

/**
 * Calculate commission breakdown for a session
 * @param chargeAmount - Total amount to charge student (TTD)
 * @returns Object with platform fee, tutor payout, and commission rate
 */
export function calculateCommission(chargeAmount: number): {
  platformFee: number;
  payoutAmount: number;
  commissionRate: number;
} {
  const rate = getCommissionRate(chargeAmount);
  const platformFee = Math.round(chargeAmount * rate * 100) / 100; // Round to 2 decimals
  const payoutAmount = Math.round((chargeAmount - platformFee) * 100) / 100;

  return {
    platformFee,
    payoutAmount,
    commissionRate: rate,
  };
}

/**
 * Get the base commission rate as a percentage for display (e.g. 7).
 */
export function getCommissionRatePercentage(pricePerSession?: number): number {
  return getCommissionRate(pricePerSession) * 100;
}

// =====================================================
// PER-TUTOR / GLOBAL COMMISSION OVERRIDES (migration 180)
// =====================================================
// The tiered functions above are the "reflexive" default. Admins can
// override the rate per tutor (tutor_commission_settings) or globally
// (global_commission_settings) — including a 0% exception. Those tables
// are the control plane; these resolvers wire them into the money math.
//
// Resolution order (first match wins):
//   1. tutor_commission_settings row with commission_mode='constant'
//      → use that rate (including 0%)
//   2. global_commission_settings with commission_mode='constant'
//      → use the global rate
//   3. otherwise → the flat base rate (BASE_COMMISSION_RATE)
//
// rate columns are percentages (numeric(5,2), e.g. 0.00, 10.00, 20.00).

function clampRate(rate: number): number {
  if (!Number.isFinite(rate) || rate < 0) return 0;
  return Math.min(rate, 1);
}

/**
 * Resolve the EFFECTIVE commission rate (decimal) for a tutor, honoring
 * per-tutor and global overrides, falling back to the price tiers.
 */
export async function getEffectiveCommissionRate(
  admin: SupabaseClient,
  tutorId: string | null | undefined,
  amount: number
): Promise<number> {
  // 1. Per-tutor override
  if (tutorId) {
    const { data: t } = await admin
      .from('tutor_commission_settings')
      .select('commission_mode, commission_rate')
      .eq('tutor_id', tutorId)
      .maybeSingle();
    if (t && t.commission_mode === 'constant' && t.commission_rate != null) {
      return clampRate(Number(t.commission_rate) / 100);
    }
  }

  // 2. Global override
  const { data: g } = await admin
    .from('global_commission_settings')
    .select('commission_mode, commission_rate')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (g && g.commission_mode === 'constant' && g.commission_rate != null) {
    return clampRate(Number(g.commission_rate) / 100);
  }

  // 3. Base rate
  return getCommissionRate(amount);
}

/**
 * Commission breakdown for a charge, honoring per-tutor / global overrides.
 * Async drop-in for calculateCommission where a tutorId + admin client exist.
 */
export async function calculateCommissionForTutor(
  admin: SupabaseClient,
  tutorId: string | null | undefined,
  chargeAmount: number
): Promise<{ platformFee: number; payoutAmount: number; commissionRate: number }> {
  const rate = await getEffectiveCommissionRate(admin, tutorId, chargeAmount);
  const platformFee = Math.round(chargeAmount * rate * 100) / 100;
  const payoutAmount = Math.round((chargeAmount - platformFee) * 100) / 100;
  return { platformFee, payoutAmount, commissionRate: rate };
}












