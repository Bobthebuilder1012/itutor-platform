const LUNIPAY_PERCENTAGE_FEE = parseFloat(
  process.env.LUNIPAY_PERCENTAGE_FEE ?? '0.03'   // confirm from dashboard
);
const LUNIPAY_FIXED_FEE_TTD = parseFloat(
  process.env.LUNIPAY_FIXED_FEE_TTD ?? '1.00'    // confirm from dashboard
);

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
