// =====================================================
// CBTT TTD/USD selling-rate fetcher
// =====================================================
// The Central Bank of Trinidad & Tobago publishes no API. Its
// exchange-rate page (checked 2026-09-26) renders the table client-side,
// so this parser is best-effort: it looks for a US-dollar row and takes
// the SELLING figure. If CBTT_RATE_URL points at a JSON or text source,
// the same parser applies.
//
// It never guesses. Anything it cannot read confidently, or any value
// outside the sane band, throws, so the cron answers 500 and an admin
// can enter the day's rate through /api/admin/fx-rate instead.

import { isSaneRate } from './rates';

const DEFAULT_URL = 'https://www.central-bank.org.tt/statistics/data-centre/exchange-rates';

export interface CbttRate {
  ttdPerUsd: number;
  publishedDate: string | null;
}

export function parseCbttUsdRate(body: string): CbttRate {
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // A US-dollar label followed (within ~200 chars) by rate-looking numbers.
  const row = text.match(/(?:U\.?S\.?\s*Dollar|United States Dollar|\bUSD\b)(.{0,200})/i);
  if (!row) throw new Error('cbtt_parse: no US dollar row found');

  const nums = (row[1].match(/\d+\.\d{2,4}/g) ?? []).map(Number).filter(isSaneRate);
  if (nums.length === 0) throw new Error('cbtt_parse: no sane rate beside the US dollar row');

  // Buying and selling appear as a pair; selling is the higher of the two.
  const ttdPerUsd = Math.max(...nums.slice(0, 2));

  const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
  return { ttdPerUsd, publishedDate: dateMatch ? dateMatch[1] : null };
}

export async function fetchCbttUsdRate(): Promise<CbttRate> {
  const url = process.env.CBTT_RATE_URL || DEFAULT_URL;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (iTutor rate fetch)' },
    cache: 'no-store',
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`cbtt_fetch: HTTP ${res.status}`);
  return parseCbttUsdRate(await res.text());
}
