// =====================================================
// EVENT FORWARDING TO CUSTOMER.IO
// =====================================================
// Product events already flow through one function — lib/analytics/track.ts —
// on their way into the product_events table. Forwarding from there rather than
// from each call site means Customer.io automatically sees any event added to
// the taxonomy later, with no second wiring step to forget.
//
// Event NAMES are reused verbatim from the frozen taxonomy in
// lib/analytics/events.ts. Renaming them on the way out would mean a campaign
// trigger and a funnel query disagree about what an event is called, and the
// taxonomy file is explicit that renaming after data accumulates is expensive.

import { PRODUCT_EVENTS, type ProductEvent } from '@/lib/analytics/events';
import { getCustomerIoConfig } from './config';
import { trackEvent, REQUEST_PATH_CALL } from './client';

/**
 * Events worth forwarding.
 *
 * Not every product event belongs in a marketing tool. finder_step fires once
 * per question answered — forwarding it would burn a large share of the Track
 * API budget and Customer.io's per-profile event retention on data nobody will
 * ever build a campaign from. Excluded events remain queryable in
 * product_events, which is where funnel analysis actually happens.
 */
const FORWARDED: ReadonlySet<string> = new Set<string>([
  PRODUCT_EVENTS.SIGNUP_COMPLETED,
  PRODUCT_EVENTS.FINDER_COMPLETED,
  PRODUCT_EVENTS.MATCH_RETURNED,
  PRODUCT_EVENTS.ENROLMENT_STARTED,
  PRODUCT_EVENTS.PAID,
  PRODUCT_EVENTS.RETAINED_30D,
  PRODUCT_EVENTS.DEMAND_RECORDED,
  PRODUCT_EVENTS.NOTIFY_ME_CLICKED,
]);

/**
 * Props that must not leave the platform, even on a forwarded event.
 *
 * finder_completed carries the learner's full answer set. Those answers are
 * useful for matching and useless for campaign triggering, and Customer.io
 * event data is visible to everyone with workspace access — so the event goes
 * without them.
 */
const STRIPPED_PROPS: ReadonlySet<string> = new Set(['answers']);

function sanitize(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (STRIPPED_PROPS.has(key)) continue;
    // Nested objects and arrays of objects segment poorly in Customer.io and
    // are the usual source of oversized event bodies. Scalars and string
    // arrays only.
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
        out[key] = value;
      }
      continue;
    }
    if (typeof value === 'object') continue;
    out[key] = value;
  }
  return out;
}

/**
 * Forward one product event. Never throws, never awaited by a user-facing path.
 *
 * Anonymous (pre-signup) events are dropped rather than sent against an
 * anonymous id: they would each create a profile in Customer.io that can never
 * be mailed, while counting toward the billable profile total. Those events
 * still land in product_events, and the funnel is reconstructable there once
 * the user signs up and their anon_id joins to a user_id.
 */
export async function forwardEvent(
  event: ProductEvent | string,
  props: Record<string, unknown>,
  userId: string | null | undefined
): Promise<void> {
  try {
    if (!userId) return;
    if (!FORWARDED.has(event)) return;
    if (!getCustomerIoConfig()) return;

    // Bounded to a single 3s attempt: track() is awaited inside user-facing
    // requests (registration, enrolment), so this must add a small, predictable
    // ceiling to those rather than up to three retries' worth of latency.
    const result = await trackEvent(userId, event, sanitize(props ?? {}), REQUEST_PATH_CALL);

    if (!result.ok && !result.skipped) {
      // Logged, not retried. An event is a point-in-time fact; by the time a
      // retry landed the campaign window it was meant to open may have passed,
      // and product_events already holds the durable copy.
      console.error(`[customerio] event ${event} failed:`, result.error);
    }
  } catch (err) {
    console.error(`[customerio] event ${event} threw:`, err);
  }
}
