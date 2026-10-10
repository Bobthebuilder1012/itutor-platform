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
 * Read attribution for the current request. `attribution` prefers first touch
 * and falls back to last touch — a returning user with no first-touch cookie
 * (cleared, or from before Phase 0 shipped) should still attribute somewhere
 * rather than nowhere. `first` and `last` are the two cookies as they are, for
 * the callers that store both.
 */
export async function getRequestAttribution(): Promise<{
  attribution: Attribution | null;
  first: Attribution | null;
  last: Attribution | null;
  anonId: string | null;
}> {
  try {
    const store = await cookies();
    const first = parseAttribution(store.get(ATTR_COOKIE)?.value);
    const last = parseAttribution(store.get(LAST_COOKIE)?.value);
    return {
      attribution: first ?? last,
      first,
      last,
      anonId: store.get(ANON_COOKIE)?.value ?? null,
    };
  } catch {
    // cookies() throws outside a request scope (e.g. a cron invocation).
    return { attribution: null, first: null, last: null, anonId: null };
  }
}

/**
 * Stamp the campaign that produced a NEW account onto its profile, for every
 * signup path other than /api/auth/register (which writes the same three
 * columns in its own insert). In practice that is Google: bootstrapProfileIfMissing
 * creates every Google profile, and before this no Google signup — the
 * majority of signups — recorded where it came from, so /admin/link-tracking
 * would have credited links with email signups only.
 *
 * Fills only what is empty, so it can never rewrite an existing account's
 * history, nor a signup_ref a class or teacher invitation already claimed.
 * Never throws: a missed stamp costs a link one signup, not a person their
 * account.
 */
export async function stampSignupAttribution(userId: string): Promise<void> {
  try {
    const { first, last } = await getRequestAttribution();
    const firstTouch = first ?? last;
    if (!firstTouch) return;

    const service = getServiceClient();
    const { error } = await service
      .from('profiles')
      .update({ first_touch: firstTouch, last_touch: last ?? firstTouch })
      .eq('id', userId)
      .is('first_touch', null);
    if (error) {
      console.error('[analytics] failed to stamp signup attribution:', error.message);
      return;
    }

    if (firstTouch.ref) {
      const { error: refError } = await service
        .from('profiles')
        .update({ signup_ref: firstTouch.ref })
        .eq('id', userId)
        .is('signup_ref', null);
      if (refError) {
        console.error('[analytics] failed to stamp signup_ref:', refError.message);
      }
    }
  } catch (err) {
    console.error('[analytics] threw while stamping signup attribution:', err);
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

/**
 * Write one product event for a known user, WITHOUT a request cookie.
 *
 * WHY THIS EXISTS SEPARATELY FROM track(). The server-authoritative events —
 * `paid`, `retained_30d` — are emitted from Stripe webhooks and cron jobs. In
 * both, `cookies()` either throws or returns Stripe's cookie jar, which is
 * empty. track() would therefore write attribution: null on exactly the two
 * events the funnel exists to attribute, and "which campaign produced revenue"
 * — the whole point of §2 — would be unanswerable.
 *
 * So attribution is read from where it was durably stored at signup:
 * `profiles.first_touch`, falling back to `last_touch`. That is the same
 * precedence getRequestAttribution uses, for the same reason: a user with no
 * first touch should attribute somewhere rather than nowhere.
 *
 * `dedupeKey` is what makes this safe to call from a webhook. Stripe redelivers,
 * and a redelivered `paid` would overstate revenue. Migration 239 puts a partial
 * unique index on (user_id, event, props->>'dedupe_key'), so a second write with
 * the same key is rejected by Postgres rather than by remembering to check.
 * Pass the provider's payment reference — never a timestamp, which differs per
 * delivery and would defeat the whole mechanism.
 */
export async function trackForUser<E extends ProductEvent>(
  event: E,
  props: E extends keyof EventProps ? EventProps[E] : Record<string, unknown>,
  options: { userId: string; dedupeKey?: string | null }
): Promise<void> {
  try {
    const service = getServiceClient();

    let attribution: Attribution | null = null;

    // Tiered select: first_touch / last_touch arrived in migration 238, which
    // is applied on staging and not yet on production. A missing column fails
    // the WHOLE PostgREST select, so an untiered read here would silently stop
    // every `paid` event on the environment that has the real money in it.
    const { data: profile, error: profileError } = await service
      .from('profiles')
      .select('first_touch, last_touch')
      .eq('id', options.userId)
      .maybeSingle();

    if (profileError) {
      console.warn(
        `[analytics] attribution lookup failed for ${event} (recording unattributed):`,
        profileError.message
      );
    } else if (profile) {
      const row = profile as { first_touch?: unknown; last_touch?: unknown };
      attribution =
        (row.first_touch as Attribution | null) ??
        (row.last_touch as Attribution | null) ??
        null;
    }

    const payload: Record<string, unknown> = { ...(props ?? {}) };
    if (options.dedupeKey) payload.dedupe_key = options.dedupeKey;

    const { error } = await service.from('product_events').insert({
      user_id: options.userId,
      anon_id: null,
      event,
      props: payload,
      attribution,
    });

    if (error) {
      // 23505 is the dedupe index doing its job on a redelivered webhook. That
      // is the designed outcome, not a fault, and logging it as an error would
      // train whoever reads these logs to ignore them.
      if (String(error.code) === '23505') return;
      console.error(`[analytics] failed to write ${event}:`, error.message);
    }
  } catch (err) {
    console.error(`[analytics] threw while writing ${event}:`, err);
  }
}
