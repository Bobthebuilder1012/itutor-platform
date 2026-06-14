// =====================================================
// LUNIPAY PROCESSING-FEE GROSS-UP
// =====================================================
// LuniPay's published rate is 10% + US$0.60 per successful transaction
// (see Platform Fees & Billing terms). Our charge math works in TTD, so
// the fixed US$0.60 is converted to TTD here (≈ TT$4.08 at 6.8 TT$/US$).
//
// This fee is ADDED ON TOP of the tutor's set price: the tutor keeps
// their base amount, and the student pays the grossed-up total so
// LuniPay's cut cancels out exactly.
//
// NOTE: these constants are intentionally HARD-CODED, not read from
// environment variables. An earlier version read process.env.LUNIPAY_*,
// which let a stale value left in the Vercel dashboard (e.g. an old
// LUNIPAY_PERCENTAGE_FEE=0.03) silently override the correct rate and
// undercharge the processing fee in deployed environments. Change the
// rate here (one redeploy) rather than via env so the value can never
// drift between environments.
// =====================================================

const LUNIPAY_PERCENTAGE_FEE = 0.10;          // LuniPay: 10%
const LUNIPAY_FIXED_FEE_USD  = 0.60;          // LuniPay: US$0.60 fixed
const USD_TO_TTD_RATE        = 6.8;           // TT$ per US$1 — update if the rate moves
const LUNIPAY_FIXED_FEE_TTD  =
  Math.round(LUNIPAY_FIXED_FEE_USD * USD_TO_TTD_RATE * 100) / 100; // ≈ TT$4.08

export function calculateGrossAmount(baseAmountTtd: number): {
  baseAmount: number;
  processingFee: number;
  grossAmount: number;
  feeRate: number;
  fixedFee: number;
} {
  const gross = (baseAmountTtd + LUNIPAY_FIXED_FEE_TTD) / (1 - LUNIPAY_PERCENTAGE_FEE);
  const grossAmount = Math.round(gross * 100) / 100;
  const processingFee = Math.round((grossAmount - baseAmountTtd) * 100) / 100;

  return {
    baseAmount: baseAmountTtd,
    processingFee,
    grossAmount,
    feeRate: LUNIPAY_PERCENTAGE_FEE,
    fixedFee: LUNIPAY_FIXED_FEE_TTD,
  };
}

// Refund always returns base amount only —
// processing fee is non-refundable (shown clearly at checkout)
export function calculateRefundAmount(baseAmountTtd: number): number {
  return baseAmountTtd;
}
