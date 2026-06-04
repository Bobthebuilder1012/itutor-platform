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
