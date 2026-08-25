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
 * only for a preorder, otherwise `Join class`, `Request to join`, `Join
 * waitlist`, `Complete payment`…). A results card cannot know which applies
 * without loading enrolment, payment and request state for every class, so
 * hardcoding the preorder wording would promise a flow most classes do not have.
 * `View class` is used instead — the same label Class Match Week's result card
 * uses — and the class page then shows the correct verb. Same rule the spec
 * intends: one action, one name, product-wide.
 */

import Link from 'next/link';
import { BadgeCheck, CalendarDays, Users, Wallet } from 'lucide-react';
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
  return `$${Number.isInteger(monthly) ? monthly : monthly.toFixed(2)}/month`;
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
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm transition hover:shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[16px] font-semibold text-ink">
            {data.name ?? 'Class'}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
            <span className="truncate">with {data.tutor_name ?? 'an iTutor'}</span>
            {data.tutor_verified ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                <BadgeCheck className="size-3" strokeWidth={2.5} />
                Verified
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {/* The match reason, as facts */}
      <dl className="mt-3.5 space-y-1.5 text-[14px]">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <dd className="text-ink">
            {blocksText(data.blocks)}
            {data.session_length_minutes ? (
              <span className="text-ink-muted"> · {data.session_length_minutes} min</span>
            ) : null}
            {/* Name the miss rather than saying "close". */}
            {missedAvailability && requestedBlocks.length > 0 ? (
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                You asked for{' '}
                {requestedBlocks
                  .map(b => availabilityLabel(b as AvailabilityBlock).toLowerCase())
                  .join(' or ')}
              </span>
            ) : null}
          </dd>
        </div>

        <div className="flex items-start gap-2">
          <Wallet className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
          <dd className="text-ink">
            {priceText(data.monthly_price)}
            {missedBudget ? (
              <span className="mt-0.5 block text-[13px] text-ink-muted">
                Above the budget you picked
              </span>
            ) : null}
          </dd>
        </div>

        {data.seats_remaining !== null ? (
          <div className="flex items-start gap-2">
            <Users className="mt-0.5 size-4 shrink-0 text-ink-muted" strokeWidth={1.75} />
            <dd className="text-ink">
              {data.seats_remaining} {data.seats_remaining === 1 ? 'seat' : 'seats'} left
            </dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 flex items-center justify-end">
        <Link
          href={`/student/explore/${data.group_id}`}
          onClick={() =>
            trackClient(PRODUCT_EVENTS.MATCH_VIEWED, { group_id: data.group_id, rank })
          }
          className="rounded-full bg-brand px-5 py-2.5 text-[14px] font-semibold text-white transition hover:brightness-110"
        >
          View class
        </Link>
      </div>
    </div>
  );
}
