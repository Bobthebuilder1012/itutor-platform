'use client';

// =====================================================
// CLIENT EVENT EMITTER
// =====================================================
// Posts to /api/events, which supplies identity and attribution server-side.
// Deliberately fire-and-forget: analytics must never block an interaction or
// surface an error to a student mid-enrolment.

import type { EventProps, ProductEvent } from './events';

/**
 * Emit one product event from the browser.
 *
 * `keepalive` matters here — several of these fire immediately before a
 * navigation (enrolment_started, match_viewed), and without it the browser
 * cancels the request on unload and the event is simply lost.
 */
export function trackClient<E extends ProductEvent>(
  event: E,
  props: E extends keyof EventProps ? EventProps[E] : Record<string, unknown>
): void {
  try {
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // Swallowed on purpose. See file header.
    });
  } catch {
    // Swallowed on purpose. See file header.
  }
}
