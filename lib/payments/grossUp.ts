// =====================================================
// LUNIPAY PROCESSING-FEE GROSS-UP
// =====================================================
// LuniPay's published rate is 10% + US$0.60 per successful
// transaction (see Platform Fees & Billing terms). Our charge math
// works in TTD, so the fixed US$0.60 is converted to TTD here.
//
// This fee is ADDED ON TOP of the tutor's set price: the tutor keeps
// their base amount, and the student pays the grossed-up total so
// LuniPay's cut cancels out exactly.
//
// Override via env in production so the rate can be tuned without a
// redeploy. Defaults below reflect the real LuniPay rate.
//   LUNIPAY_PERCENTAGE_FEE   default 0.10  (10%)
//   LUNIPAY_FIXED_FEE_USD    default 0.60  (US$0.60)
//   USD_TO_TTD_RATE          default 6.8   (TT$ per US$1)
// =====================================================

const LUNIPAY_PERCENTAGE_FEE = parseFloat(
  process.env.LUNIPAY_PERCENTAGE_FEE ?? '0.10' // LuniPay: 10%
);

// LuniPay's fixed fee is charged in USD; convert to TTD for our math.
const LUNIPAY_FIXED_FEE_USD = parseFloat(
  process.env.LUNIPAY_FIXED_FEE_USD ?? '0.60' // LuniPay: US$0.60
);
const USD_TO_TTD_RATE = parseFloat(
  process.env.USD_TO_TTD_RATE ?? '6.8' // TT$ per US$1 — update if the rate moves
);
const LUNIPAY_FIXED_FEE_TTD =
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
