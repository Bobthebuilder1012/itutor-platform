'use client';

// Browser-side hooks for the v2 badges and nav links.
//
//  - useVerificationV2Enabled: one cached call to /api/verification-v2/flag.
//  - useVerificationSummary: class cards render dozens of badges at once, so ids
//    asked for within a few milliseconds are batched into ONE request.
//
// If the flag is off (the summary API answers 404) the hook remembers it and
// stops asking, so a flagged-off site makes no further requests.

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
const cache = new Map<string, PublicSummary | null>();
const pending = new Set<string>();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let disabled = false;

function notify() {
  listeners.forEach((l) => l());
}

async function flush() {
  timer = null;
  const ids = Array.from(pending);
  pending.clear();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    try {
      const res = await fetch(`/api/public/verification-v2/summary?ids=${encodeURIComponent(chunk.join(','))}`, {
        cache: 'no-store',
      });
      if (res.status === 404) {
        disabled = true;
        chunk.forEach((id) => cache.set(id, null));
      } else if (res.ok) {
        const { summaries } = (await res.json()) as { summaries: Record<string, PublicSummary> };
        chunk.forEach((id) => cache.set(id, summaries[id] ?? null));
      } else {
        chunk.forEach((id) => cache.set(id, null));
      }
    } catch {
      chunk.forEach((id) => cache.set(id, null));
    }
  }
  notify();
}

/** undefined = still loading, null = not verified (or feature off). */
export function useVerificationSummary(tutorId?: string | null): PublicSummary | null | undefined {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  useEffect(() => {
    if (!tutorId || disabled || cache.has(tutorId)) return;
    pending.add(tutorId);
    timer ??= setTimeout(flush, 15);
  }, [tutorId]);

  if (!tutorId || disabled) return null;
  return cache.get(tutorId);
}
