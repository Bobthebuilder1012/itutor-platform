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
//   2.9%  + US$0.30   card processing
// + 1.0%              currency conversion (TTD presented, USD settled)
// = 3.9%  + US$0.30
//
// MEASURED 2026-07-30 against the account. A TT$108.44 charge settled as
// US$16.07 (fx 0.148191) and Stripe took TWO fees:
//     US$0.77  "Stripe processing fees"      = 2.9% + $0.30  exactly
//     US$0.16  "Stripe currency conversion"  = 1.0%          exactly
//
// The rate was briefly 2.9% + $0.30 — the headline card rate — which
// omitted the conversion fee and so under-collected by ~1% of every
// charge, with the platform silently absorbing it. Both measured
// components are now covered.
//
// STILL UNKNOWN: Stripe's international-card surcharge (~1.5%). The
// probe used a US test card, so it never applied — but iTutor's students
// hold T&T cards, which ARE international to a US account. If that
// surcharge does apply in practice, this under-collects by a further
// ~1.5% and fee_variance_ttd will go negative on real charges:
//     SELECT count(*), avg(fee_variance_ttd), sum(fee_variance_ttd)
//     FROM payments WHERE provider='stripe' AND fee_variance_ttd IS NOT NULL;
// Raise to 0.054 if that's what the live data shows. Deliberately NOT
// assumed up-front, since guessing high overcharges every student.
const STRIPE_PERCENTAGE_FEE = 0.039;
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
