'use client';

/**
 * One recommended class.
 *
 * THE MATCH REASON IS RENDERED FACTS, NOT A GENERATED SENTENCE. "Saturday
 * mornings · $5/month · 4 seats left" is faster to produce and more trustworthy
 * to a parent than prose, and it is the reason the matcher is deterministic.
 *
 * ON THE CTA. The build spec says to reuse `Secure your spot`. That label is not
 * a constant — ClassDetailView computes it from class state (`Secure your spot`
 * only for a preorder, otherwise `Join class`, `Request to join`, `Join waitlist`,
 * `Complete payment`…). A results card cannot know which applies without loading
 * enrolment, payment and request state for every class, so hardcoding the
 * preorder wording would promise a flow most classes do not have. `View class`
 * is used instead — the same label Class Match Week's result card uses — and the
 * class page then shows the correct verb. Same rule as the spec intends: the
 * action keeps one name across the product.
 */

import Link from 'next/link';
import { availabilityLabel } from '@/lib/finder/wizard';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import type { GatingDimension } from '@/lib/matching/finder';
import { trackClient } from '@/lib/analytics/client';
import { PRODUCT_EVENTS } from '@/lib/analytics/events';

export interface MatchCardData {
  group_id: string;
  rank: number;
  blocks: string[];
  missed: string[];
  name: string | null;
  tutor_name: string | null;
  tutor_verified: boolean;
  monthly_price: number | null;
  seats_remaining: number | null;
  session_length_minutes: number | null;
}

function priceText(monthly: number | null): string {
  if (monthly === null || monthly === 0) return 'Free';
  // Whole dollars unless the class is priced in cents.
  const isWhole = Number.isInteger(monthly);
  return `$${isWhole ? monthly : monthly.toFixed(2)}/month`;
}

function blocksText(blocks: string[]): string {
  if (blocks.length === 0) return 'Schedule to be confirmed';
  return blocks.map(b => availabilityLabel(b as AvailabilityBlock)).join(' · ');
}

export default function MatchCard({
  data,
  rank,
  nearMissOn,
  requestedBlocks,
}: {
  data: MatchCardData;
  rank: number;
  nearMissOn: GatingDimension | null;
  requestedBlocks: string[];
}) {
  const missedAvailability = nearMissOn === 'availability';
  const missedBudget = nearMissOn === 'budget';

  return (
    <div className="rounded-2xl border border-itutor-border bg-itutor-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-[16px] font-semibold text-itutor-white">
            {data.name ?? 'Class'}
          </h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-itutor-muted">
            <span className="truncate">with {data.tutor_name ?? 'an iTutor'}</span>
            {data.tutor_verified ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-itutor-green/15 px-2 py-0.5 text-[11px] font-medium text-itutor-green">
                Verified
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* The match reason */}
      <div className="mt-3.5 space-y-1 text-[14px]">
        <p className={missedAvailability ? 'text-itutor-white' : 'text-itutor-white'}>
          {blocksText(data.blocks)}
          {data.session_length_minutes ? (
            <span className="text-itutor-muted"> · {data.session_length_minutes} min</span>
          ) : null}
        </p>

        {/* Name the miss, rather than saying "close". */}
        {missedAvailability && requestedBlocks.length > 0 ? (
          <p className="text-[13px] text-itutor-muted">
            You asked for {requestedBlocks.map(b => availabilityLabel(b as AvailabilityBlock).toLowerCase()).join(' or ')}
          </p>
        ) : null}

        <p className={missedBudget ? 'text-itutor-muted' : 'text-itutor-white'}>
          {priceText(data.monthly_price)}
          {data.seats_remaining !== null ? (
            <span className="text-itutor-muted">
              {' '}
              · {data.seats_remaining} {data.seats_remaining === 1 ? 'seat' : 'seats'} left
            </span>
          ) : null}
        </p>

        {missedBudget ? (
          <p className="text-[13px] text-itutor-muted">Above the budget you picked</p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-end">
        <Link
          href={`/student/explore/${data.group_id}`}
          onClick={() =>
            trackClient(PRODUCT_EVENTS.MATCH_VIEWED, { group_id: data.group_id, rank })
          }
          className="rounded-full bg-itutor-green px-5 py-2.5 text-[14px] font-semibold text-black hover:brightness-110"
        >
          View class
        </Link>
      </div>
    </div>
  );
}
