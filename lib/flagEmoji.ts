export function iso2ToFlagEmoji(iso2: string): string {
  const code = (iso2 ?? '').trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return '🏳️';

  const A = 0x1f1e6; // Regional Indicator Symbol Letter A
  const first = code.charCodeAt(0) - 65 + A;
  const second = code.charCodeAt(1) - 65 + A;

  return String.fromCodePoint(first, second);
}















