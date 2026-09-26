/**
 * Format a TTD amount as "TT$150" (whole) or "TT$150.50" (decimal).
 * Returns "—" for null/undefined/NaN.
 */
export function fmtTTD(n: number | string | null | undefined): string {
  if (n == null) return '—';
  const num = Number(n);
  if (isNaN(num)) return '—';
  const formatted = num % 1 === 0
    ? num.toLocaleString('en-US')
    : num.toFixed(2);
  return `TT$${formatted}`;
}

export type PayoutCurrency = 'TTD' | 'USD';

/** Format a USD amount as "US$150" or "US$150.50". Returns "—" for empty values. */
export function fmtUSD(n: number | string | null | undefined): string {
  return fmtTTD(n).replace(/^TT\$/, 'US$');
}

/** Format an amount already expressed in `currency`. */
export function fmtMoney(
  n: number | string | null | undefined,
  currency: PayoutCurrency,
): string {
  return currency === 'USD' ? fmtUSD(n) : fmtTTD(n);
}
