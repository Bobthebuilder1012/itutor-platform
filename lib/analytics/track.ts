// =====================================================
// TRACK — server-side product event writer
// =====================================================
// Find Your iTutor Build Plan §2. "Every write carries attribution from the
// cookie" (§2.4).
//
// Server-only: imports next/headers and the service-role client. Never import
// this into a client component.

import { cookies } from 'next/headers';
import { getServiceClient } from '@/lib/supabase/server';
import {
  ATTR_COOKIE,
  LAST_COOKIE,
  ANON_COOKIE,
  parseAttribution,
  type Attribution,
} from './attribution';
import type { EventProps, ProductEvent } from './events';
import { forwardEvent } from '@/lib/customerio/events';

interface TrackOptions {
  userId?: string | null;
  anonId?: string | null;
  /** Override the cookie-derived attribution (used by /r/[code], which knows
   *  the attribution before the cookie round-trips). */
  attribution?: Attribution | null;
}

/**
 * Read attribution for the current request. Prefers first touch, falls back to
 * last touch — a returning user with no first-touch cookie (cleared, or from
 * before Phase 0 shipped) should still attribute somewhere rather than nowhere.
 */
export async function getRequestAttribution(): Promise<{
  attribution: Attribution | null;
  anonId: string | null;
}> {
  try {
    const store = await cookies();
    const first = parseAttribution(store.get(ATTR_COOKIE)?.value);
    const last = parseAttribution(store.get(LAST_COOKIE)?.value);
    return {
      attribution: first ?? last,
      anonId: store.get(ANON_COOKIE)?.value ?? null,
    };
  } catch {
    // cookies() throws outside a request scope (e.g. a cron invocation).
    return { attribution: null, anonId: null };
  }
}

/**
 * Write one product event.
 *
 * Analytics must never break a user flow, so every failure path here is
 * swallowed and logged. A dropped event is a measurement gap; a thrown error
 * during checkout is lost revenue.
 */
export async function track<E extends ProductEvent>(
  event: E,
  props: E extends keyof EventProps ? EventProps[E] : Record<string, unknown>,
  options: TrackOptions = {}
): Promise<void> {
  try {
    let attribution = options.attribution ?? null;
    let anonId = options.anonId ?? null;

    if (attribution === null || anonId === null) {
      const fromRequest = await getRequestAttribution();
      attribution = attribution ?? fromRequest.attribution;
      anonId = anonId ?? fromRequest.anonId;
    }

    const service = getServiceClient();
    const { error } = await service.from('product_events').insert({
      user_id: options.userId ?? null,
      anon_id: anonId,
      event,
      props: props ?? {},
      attribution,
    });

    if (error) {
      console.error(`[analytics] failed to write ${event}:`, error.message);
    }

    // Mirror to Customer.io so campaigns can trigger on product behaviour.
    // Ordered after the product_events insert on purpose: this table is the
    // durable record, and a Customer.io outage must never cost us the row.
    // forwardEvent is a no-op unless the integration is switched on, filters to
    // a campaign-relevant subset, and swallows its own failures.
    await forwardEvent(event, (props ?? {}) as Record<string, unknown>, options.userId);
  } catch (err) {
    console.error(`[analytics] threw while writing ${event}:`, err);
  }
}
