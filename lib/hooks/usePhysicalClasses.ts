'use client';

/**
 * Is the physical-classes feature on?
 *
 * The flag itself is server-side (lib/featureFlags/physicalClasses.ts); this is
 * how the client surfaces that create or choose a physical arrangement read it.
 *
 * ── DEFAULTS TO FALSE, AND THAT IS THE POINT ───────────────────────────────
 * Same reasoning as SignupCard's parent-account card: starting at `true` would
 * render the format picker, the venue manager and the location filter for one
 * paint and then withdraw them, which looks like a bug and is worse than a
 * short delay. Everything gated on this simply appears once the answer lands.
 *
 * A failed fetch therefore leaves the feature hidden. That is the safe
 * direction: the server refuses a non-online format regardless, so a client
 * that guessed `true` would only offer controls the API then rejects.
 */

import { useEffect, useState } from 'react';

export function usePhysicalClasses(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/feature-flags')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive) setEnabled(Boolean(d?.physicalClassesEnabled));
      })
      .catch(() => {
        /* hidden is the safe default — see above */
      });
    return () => {
      alive = false;
    };
  }, []);

  return enabled;
}
