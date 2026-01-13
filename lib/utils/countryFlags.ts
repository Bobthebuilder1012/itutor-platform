/**
 * Convert ISO alpha-2 country code to flag emoji
 * @param countryCode - ISO alpha-2 code (e.g., 'TT', 'US', 'GB')
 * @returns Flag emoji string
 */
export function getFlagEmoji(countryCode: string): string {
  if (!countryCode || countryCode.length !== 2) {
    return '🏳️'; // Default flag
  }

  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map((char) => 127397 + char.charCodeAt(0));

  return String.fromCodePoint(...codePoints);
}
















