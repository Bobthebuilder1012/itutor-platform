'use client';

// Browser-side hooks for the v2 badges and nav links.
//
//  - useVerificationV2Enabled: one cached call to /api/verification-v2/flag.
//  - useVerificationSummary: class cards render dozens of badges at once, so ids
//    asked for within a few milliseconds are batched into ONE request.
//
// If the flag is off (the summary API answers 404) the hook remembers it and
// stops asking, so a flagged-off site makes no further requests.
//
// The answers are cached in this tab for SUMMARY_TTL_MS only, and dropped when the
// tab becomes visible again, so a badge that appears (verified) or disappears (revoked,
// verify again) shows up in an open tab within about a minute, and at once on the next
// page load. The server side is never cached: the API sends Cache-Control: no-store.

import { useEffect, useState } from 'react';
import type { PublicSummary } from './publicView';

let flagPromise: Promise<boolean> | null = null;

export function useVerificationV2Enabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    flagPromise ??= fetch('/api/verification-v2/flag', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((b) => !!b.enabled)
      .catch(() => false);
    flagPromise.then((v) => live && setEnabled(v));
    return () => {
      live = false;
    };
  }, []);
  return enabled;
}

// ---- batched summaries ----
export const SUMMARY_TTL_MS = 60_000;

/** Pure, so it can be tested: is a cached answer still good at `now`? */
export function isSummaryFresh(entry: { at: number } | undefined, now: number): boolean {
  return !!entry && now - entry.at < SUMMARY_TTL_MS;
}

const cache = new Map<string, { value: PublicSummary | null; at: number }>();
const pending = new Set<string>();
const inflight = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let disabled = false;

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = Array.from(pending);
  pending.clear();
  ids.forEach((id) => inflight.add(id));
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    let got: Record<string, PublicSummary> | null = null;
    try {
      const res = await fetch(`/api/public/verification-v2/summary?ids=${encodeURIComponent(chunk.join(','))}`, {
        cache: 'no-store',
      });
      if (res.status === 404) disabled = true;
      else if (res.ok) got = ((await res.json()) as { summaries: Record<string, PublicSummary> }).summaries;
    } catch {
      /* treated as "no badge" until the next refresh */
    }
    const at = Date.now();
    chunk.forEach((id) => {
      cache.set(id, { value: got?.[id] ?? null, at });
      inflight.delete(id);
    });
  }
  notify();
}

/** undefined = still loading, null = not verified (or feature off). */
export function useVerificationSummary(tutorId?: string | null): PublicSummary | null | undefined {
  const [, force] = useState(0);

  // One shared ticker re-checks every mounted badge once a minute, and the tab coming
  // back to the front re-checks at once. A stale answer stays on screen until the new
  // one arrives, so a badge never flickers.
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    ticker ??= setInterval(notify, SUMMARY_TTL_MS);
    const onVisible = () => document.visibilityState === 'visible' && notify();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      listeners.delete(l);
      document.removeEventListener('visibilitychange', onVisible);
      if (listeners.size === 0 && ticker) {
        clearInterval(ticker);
        ticker = null;
      }
    };
  }, []);

  // Runs after every render (they are triggered by notify), and only queues a request
  // when the answer is missing or older than the TTL.
  useEffect(() => {
    if (!tutorId || disabled) return;
    if (isSummaryFresh(cache.get(tutorId), Date.now()) || pending.has(tutorId) || inflight.has(tutorId)) return;
    pending.add(tutorId);
    timer ??= setTimeout(flush, 15);
  });

  if (!tutorId || disabled) return null;
  return cache.get(tutorId)?.value;
}
