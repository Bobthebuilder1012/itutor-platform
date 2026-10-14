'use client';

// The signed-in user's credits, shared by every chip and control on a page.
// No React Query provider wraps the student and parent shells, so this keeps
// a module-level cache (like useTutorPayoutCurrency) and one request in
// flight per mode; refresh() after anything that changes the balance.

import { useCallback, useEffect, useState } from 'react';
import type { CreditsMePayload } from '@/lib/credits/types';

type Mode = 'lite' | 'full';

const cache: Partial<Record<Mode, { at: number; data: CreditsMePayload }>> = {};
const inflight: Partial<Record<Mode, Promise<CreditsMePayload>>> = {};
const listeners = new Set<() => void>();
const TTL_MS = 30_000;

async function load(mode: Mode, force = false): Promise<CreditsMePayload> {
  const hit = cache[mode];
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.data;
  if (!force && inflight[mode]) return inflight[mode]!;
  const p = fetch(`/api/credits/me${mode === 'lite' ? '?lite=1' : ''}`, { cache: 'no-store' })
    .then(async (res) => (res.ok ? ((await res.json()) as CreditsMePayload) : { available: false }))
    .catch(() => ({ available: false }) as CreditsMePayload)
    .then((data) => {
      cache[mode] = { at: Date.now(), data };
      delete inflight[mode];
      return data;
    });
  inflight[mode] = p;
  return p;
}

/** Drop every cached copy and tell mounted hooks to reload. */
export function invalidateCredits() {
  delete cache.lite;
  delete cache.full;
  listeners.forEach((fn) => fn());
}

/**
 * Whether to show credits UI at all (nav item, chips): credits are set up
 * here and there is something to see — a programme switched on, or a balance.
 * Before launch both switches are off and nobody has credits, so nothing shows.
 */
export function rewardsVisible(d: CreditsMePayload | null | undefined): boolean {
  if (!d?.available) return false;
  const w = d.wallet;
  return Boolean(
    d.programme?.referrals_enabled ||
      d.programme?.campaign_codes_enabled ||
      (w && (w.available > 0 || w.pending > 0 || w.reserved > 0))
  );
}

export function useCredits(mode: Mode = 'lite', enabled = true) {
  const [data, setData] = useState<CreditsMePayload | null>(cache[mode]?.data ?? null);
  const [loading, setLoading] = useState(!cache[mode]);

  const refresh = useCallback(async (force = true) => {
    setLoading(true);
    const next = await load(mode, force);
    setData(next);
    setLoading(false);
  }, [mode]);

  useEffect(() => {
    if (!enabled) return;
    void refresh(false);
    // The cache was just cleared, so the first hook to react fetches and the
    // rest share its in-flight request instead of each forcing their own.
    const onInvalidate = () => void refresh(false);
    listeners.add(onInvalidate);
    return () => {
      listeners.delete(onInvalidate);
    };
  }, [refresh, enabled]);

  return { data, loading, refresh: () => invalidateCredits() };
}

export const fmtCredits = (n: number | null | undefined) =>
  `TT$${Number(n ?? 0).toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
