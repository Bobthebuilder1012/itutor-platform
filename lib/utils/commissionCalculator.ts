/**
 * Commission Calculator Utility
 * Calculates iTutor's commission based on session price tiers
 */

export type CommissionTier = {
  rate: number; // percentage (e.g., 10, 15, 20)
  threshold: number; // price threshold in TTD
};

// Commission structure:
// - Sessions < $100: 10%
// - Sessions $100-$199: 15%
// - Sessions $200+: 20%
export const COMMISSION_TIERS: CommissionTier[] = [
  { threshold: 200, rate: 20 },
  { threshold: 100, rate: 15 },
  { threshold: 0, rate: 10 },
];

/**
 * Calculate commission rate based on session price
 * @param pricePerSession - Total session price in TTD
 * @returns Commission rate as a decimal (e.g., 0.10, 0.15, 0.20)
 */
export function getCommissionRate(pricePerSession: number): number {
  if (pricePerSession < 100) return 0.10;
  if (pricePerSession < 200) return 0.15;
  return 0.20;
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
 * Get commission rate as percentage for display
 * @param pricePerSession - Total session price in TTD
 * @returns Commission rate as percentage (e.g., 10, 15, 20)
 */
export function getCommissionRatePercentage(pricePerSession: number): number {
  return getCommissionRate(pricePerSession) * 100;
}





