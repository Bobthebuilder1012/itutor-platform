'use client';

/**
 * Scrolls the "return to the card" target into view after the results page
 * hydrates (docs 03 §3.1: the visitor comes back from signup to THE card they
 * tapped — scrolled to, expanded, slot highlighted — never the top of the
 * page). The highlight itself is server-rendered; this only moves the
 * viewport, so a no-JS render degrades to an anchored page, not a broken one.
 */

import { useEffect } from 'react';

export default function ScrollToAnchor({ anchorId }: { anchorId: string }) {
  useEffect(() => {
    // A beat after hydration so layout (fonts, images) has settled enough for
    // the scroll position to land on the card rather than past it.
    const t = window.setTimeout(() => {
      document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => window.clearTimeout(t);
  }, [anchorId]);

  return null;
}
