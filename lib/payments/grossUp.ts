// =====================================================
// PROCESSING-FEE GROSS-UP
// =====================================================
// The fee is ADDED ON TOP of the tutor's set price: the tutor keeps
// their base amount, and the student pays the grossed-up total so
// the processor's cut cancels out exactly.
//
// LuniPay's published rate is 10% + US$0.60 per successful transaction
// (see Platform Fees & Billing terms). Our charge math works in TTD, so
// the fixed US$0.60 is converted to TTD here (≈ TT$4.08 at 6.8 TT$/US$).
//
// NOTE: these constants are intentionally HARD-CODED, not read from
// environment variables. An earlier version read process.env.LUNIPAY_*,
// which let a stale value left in the Vercel dashboard (e.g. an old
// LUNIPAY_PERCENTAGE_FEE=0.03) silently override the correct rate and
// undercharge the processing fee in deployed environments. Change the
// rate here (one redeploy) rather than via env so the value can never
// drift between environments.
// =====================================================

const USD_TO_TTD_RATE = 6.8; // TT$ per US$1 — update if the rate moves

function usdToTtd(usd: number): number {
  return Math.round(usd * USD_TO_TTD_RATE * 100) / 100;
}

export type PaymentProvider = 'lunipay' | 'stripe';

type FeeSchedule = {
  percentageFee: number;
  fixedFeeTtd: number;
};

const LUNIPAY_PERCENTAGE_FEE = 0.10;          // LuniPay: 10%
const LUNIPAY_FIXED_FEE_USD  = 0.60;          // LuniPay: US$0.60 fixed
const LUNIPAY_FIXED_FEE_TTD  = usdToTtd(LUNIPAY_FIXED_FEE_USD); // ≈ TT$4.08

// -----------------------------------------------------------------
// Stripe: US account, settles USD, presents TTD.
// -----------------------------------------------------------------
//   2.9% + US$0.30  base card rate
// + 1.5%            international card (T&T cards on a US account)
// + 1.0%            currency conversion (TTD presentment, USD settlement)
// = 5.4% + US$0.30
//
// MEASURED 2026-07-30 against the live test account. A TT$108.44 charge
// settled as US$16.07 (fx 0.148191) with fees:
//     US$0.77  "Stripe processing fees"      = 2.9% + $0.30 exactly
//     US$0.16  "Stripe currency conversion"  = 1.0% exactly
//     -------
//     US$0.93  total  ≈ TT$6.28
//
// That probe used `pm_card_visa` (a US test card), so the 1.5%
// international surcharge did NOT apply. A real T&T card adds ~US$0.24,
// putting the true fee near TT$7.90 against the TT$8.44 we'd charge —
// i.e. this schedule slightly OVER-collects, which is the safe
// direction. Confirm against real T&T card settlements once live and
// tune using payments.fee_variance_ttd.
//
// If set too LOW we undercharge the gross-up and the platform absorbs
// the difference, which is exactly the failure mode the hard-coding
// note above exists to prevent.
const STRIPE_PERCENTAGE_FEE = 0.054;
const STRIPE_FIXED_FEE_USD  = 0.30;
const STRIPE_FIXED_FEE_TTD  = usdToTtd(STRIPE_FIXED_FEE_USD); // ≈ TT$2.04

const FEE_SCHEDULES: Record<PaymentProvider, FeeSchedule> = {
  lunipay: {
    percentageFee: LUNIPAY_PERCENTAGE_FEE,
    fixedFeeTtd: LUNIPAY_FIXED_FEE_TTD,
  },
  stripe: {
    percentageFee: STRIPE_PERCENTAGE_FEE,
    fixedFeeTtd: STRIPE_FIXED_FEE_TTD,
  },
};

export function calculateGrossAmountForProvider(
  baseAmountTtd: number,
  provider: PaymentProvider
): {
  baseAmount: number;
  processingFee: number;
  grossAmount: number;
  feeRate: number;
  fixedFee: number;
} {
  const { percentageFee, fixedFeeTtd } = FEE_SCHEDULES[provider];

  const gross = (baseAmountTtd + fixedFeeTtd) / (1 - percentageFee);
  const grossAmount = Math.round(gross * 100) / 100;
  const processingFee = Math.round((grossAmount - baseAmountTtd) * 100) / 100;

  return {
    baseAmount: baseAmountTtd,
    processingFee,
    grossAmount,
    feeRate: percentageFee,
    fixedFee: fixedFeeTtd,
  };
}

/**
 * LuniPay gross-up. Kept as the default export-shaped helper so the
 * existing LuniPay routes are untouched by the Stripe work.
 */
export function calculateGrossAmount(baseAmountTtd: number) {
  return calculateGrossAmountForProvider(baseAmountTtd, 'lunipay');
}

// Refund always returns base amount only —
// processing fee is non-refundable (shown clearly at checkout)
export function calculateRefundAmount(baseAmountTtd: number): number {
  return baseAmountTtd;
}
