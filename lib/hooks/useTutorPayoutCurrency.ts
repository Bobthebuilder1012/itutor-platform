'use client';
// The calling tutor's payout currency and today's CBTT rate (migration 260).
// Used for "≈ US$" previews on forward-looking figures such as prices;
// settled earnings use the rate frozen on each payout_ledger row instead.
//
// Plain fetch + a module cache rather than React Query: tutor pages are not
// wrapped in a QueryClientProvider.
import { useEffect, useState } from 'react';

export interface TutorPayoutCurrency {
  currency: 'TTD' | 'USD';
  rate: { rate_date: string; ttd_per_usd: number } | null;
}

const TTL_MS = 10 * 60 * 1000;
let cached: { value: TutorPayoutCurrency; at: number } | null = null;
let inflight: Promise<TutorPayoutCurrency> | null = null;

async function load(): Promise<TutorPayoutCurrency> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  if (!inflight) {
    inflight = fetch('/api/tutor/payout-currency')
      .then(async (res) => {
        if (!res.ok) return { currency: 'TTD', rate: null } as TutorPayoutCurrency;
        const json = await res.json();
        return { currency: json.currency === 'USD' ? 'USD' : 'TTD', rate: json.rate ?? null } as TutorPayoutCurrency;
      })
      .catch(() => ({ currency: 'TTD', rate: null }) as TutorPayoutCurrency)
      .then((value) => {
        cached = { value, at: Date.now() };
        inflight = null;
        return value;
      });
  }
  return inflight;
}

export function useTutorPayoutCurrency() {
  const [data, setData] = useState<TutorPayoutCurrency | null>(cached?.value ?? null);

  useEffect(() => {
    let alive = true;
    load().then((v) => { if (alive) setData(v); });
    return () => { alive = false; };
  }, []);

  const usdMode = data?.currency === 'USD' && !!data.rate;
  /** "≈ US$12.34" for a TTD amount, or null when the tutor is paid in TTD. */
  const approxUsdLabel = (ttd: number): string | null =>
    usdMode ? `≈ US$${(ttd / data!.rate!.ttd_per_usd).toFixed(2)}` : null;

  return { currency: data?.currency ?? 'TTD', rate: data?.rate ?? null, usdMode, approxUsdLabel };
}
