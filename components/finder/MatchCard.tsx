'use client';

/**
 * One recommended class.
 *
 * SAME CARD LANGUAGE AS THE EXPLORE MARKETPLACE. `/find/results` and
 * `/find/browse` used to render a plain bordered list — a different visual
 * vocabulary from the one thing a visitor is about to be handed off to
 * (`/student/explore/[id]`, built on the marketplace's own card). This card
 * borrows the marketplace's shape — `rounded-3xl`, a gradient header band, a
 * price-and-CTA footer split by a border — deliberately, so the Finder does
 * not look like a different, thinner product from the marketplace it feeds
 * into.
 *
 * IT DOES NOT COPY THE MARKETPLACE CARD'S DATA, ONLY ITS SHAPE.
 * `MatchCardData` is a stored SNAPSHOT (see MatchResults' header comment), and
 * it deliberately carries none of a cover image, a tutor avatar, or a subject
 * field — those are live catalogue fields with no reason to be frozen onto a
 * match result. The gradient band below is keyed off the class NAME instead of
 * a subject id, the same fallback the marketplace card itself uses when a
 * class has no cover image.
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
 *
 * IT STAYS `View class` FOR AN ANONYMOUS VIEWER TOO, and the href still points at
 * the class page rather than at signup. That looks like it contradicts "clicking
 * a card takes them to sign up", and the reason it does not is that
 * `/api/groups/[groupId]` deliberately serves anonymous reads — its own comment
 * says "you cannot ask someone to sign up for a class they have not been allowed
 * to look at" — and the class page's Join button already redirects to
 * `/login?redirect=…`. So the account is asked for at the moment it is genuinely
 * needed, one screen later, which is more of what this change is for rather than
 * less. `ctaHref` exists so a caller can still override it.
 */

import Link from 'next/link';
import { BadgeCheck, CalendarDays, Laptop, MapPin, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { availabilityLabel } from '@/lib/finder/wizard';
import type { AvailabilityBlock } from '@/lib/matching/availability';
import { deliveryLabel, normaliseClassFormat } from '@/lib/matching/delivery';
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
  /** Snapshot of groups.class_format at the time of the run. */
  class_format: string | null;
  /** Region of the venue, for a physical or hybrid class. Never the street
   *  address — venue_visibility gates that until enrolment. */
  region_name: string | null;
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

/**
 * The header band's gradient. Same palette and the same "first match wins,
 * default to brand" rule as `ExploreMarketplace`'s `getSubjectStyle` — kept as
 * its own small copy rather than an import, because that function is a
 * closure inside a 1800-line client component and not an exported util.
 */
const SUBJECT_GRADIENT: Record<string, string> = {
  math: 'from-coral to-peach',
  physics: 'from-sky to-lavender',
  chemistry: 'from-brand-deep to-forest',
  biology: 'from-brand to-brand-deep',
  english: 'from-lavender to-brand-soft',
  history: 'from-peach to-coral',
  economics: 'from-peach to-coral',
  information: 'from-sky to-lavender',
  spanish: 'from-coral to-peach',
  french: 'from-sky to-lavender',
  sea: 'from-brand to-brand-deep',
  accounting: 'from-peach to-coral',
};

function gradientFor(name: string | null): string {
  const lower = (name ?? '').toLowerCase();
  for (const [key, gradient] of Object.entries(SUBJECT_GRADIENT)) {
    if (lower.includes(key)) return gradient;
  }
  return 'from-brand to-brand-deep';
}

function initialsOf(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function MatchCard({
  data,
  rank,
  nearMissOn,
  requestedBlocks,
  ctaHref,
  ctaLabel = 'View class',
  ranked = true,
}: {
  data: MatchCardData;
  rank: number;
  nearMissOn: GatingDimension | null;
  requestedBlocks: string[];
  /**
   * Where the card goes. Passed in rather than computed here, so this component
   * stays a renderer and the caller — which is the thing that knows whether the
   * viewer has an account — owns the routing decision.
   */
  ctaHref?: string;
  ctaLabel?: string;
  /**
   * False on /find/browse, whose own header comment is explicit that skipping
   * the questionnaire means there is no query to rank against — "a score with
   * no query behind it is a lie". `rank` there is only a list position, so
   * `rank === 1` must not read as "the best match" the way it correctly does
   * on /find/results.
   */
  ranked?: boolean;
}) {
  const missedAvailability = nearMissOn === 'availability';
  const missedBudget = nearMissOn === 'budget';
  const missedDelivery = nearMissOn === 'delivery';

  // Shown on EVERY card, not only physical ones. "Online" is the answer to a
  // question every family now has, and a card that mentions the format only
  // when it is physical teaches families that silence means online — which
  // stops being true the moment a hybrid class appears.
  const format = normaliseClassFormat(data.class_format);
  const FormatIcon = format === 'online' ? Laptop : MapPin;
  const lowStock = data.seats_remaining !== null && data.seats_remaining > 0 && data.seats_remaining <= 3;

  return (
    <div className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-background transition-all hover:-translate-y-0.5 hover:shadow-card">
      {/* The gradient band the marketplace card falls back to when a class has
          no cover image — every Finder match does, since none is stored on the
          snapshot. Keyed off the name so the same class reads the same colour
          here and on the marketplace itself. */}
      <div className={`relative h-20 bg-gradient-to-br ${gradientFor(data.name)}`}>
        {/* Rank only on the exact-match list, and only while it says something:
            "#1 of 1" is not information. */}
        {ranked && rank === 1 && !nearMissOn ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-deep">
            Best match
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h3 className="truncate text-[16px] font-semibold leading-tight text-ink">
            {data.name ?? 'Class'}
          </h3>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-deep text-[9px] font-bold text-white">
                {initialsOf(data.tutor_name)}
              </span>
              <span className="truncate text-[13px] text-ink-muted">
                by {data.tutor_name ?? 'an iTutor'}
              </span>
            </span>
            {data.tutor_verified ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-[11px] font-semibold text-brand-deep">
                <BadgeCheck className="size-3" strokeWidth={2.5} />
                Verified
              </span>
            ) : null}
          </p>
        </div>

        {/* The match reason, as facts */}
        <dl className="space-y-1.5 text-[13px]">
          <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <dd className="text-ink">
              {blocksText(data.blocks)}
              {data.session_length_minutes ? (
                <span className="text-muted-foreground"> · {data.session_length_minutes} min</span>
              ) : null}
              {/* Name the miss rather than saying "close". */}
              {missedAvailability && requestedBlocks.length > 0 ? (
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  You asked for{' '}
                  {requestedBlocks
                    .map(b => availabilityLabel(b as AvailabilityBlock).toLowerCase())
                    .join(' or ')}
                </span>
              ) : null}
            </dd>
          </div>

          <div className="flex items-start gap-2">
            <FormatIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
            <dd className="text-ink">
              {deliveryLabel(data.class_format)}
              {/* The region, when there is one to travel to. This is the fact
                  that decides whether an otherwise-perfect match is usable at
                  all, so it sits on the card rather than one click away. */}
              {data.region_name ? (
                <span className="text-muted-foreground"> · {data.region_name}</span>
              ) : null}
              {missedDelivery ? (
                <span className="mt-0.5 block text-[12px] text-muted-foreground">
                  Not the way you asked to learn
                </span>
              ) : null}
            </dd>
          </div>

          {data.seats_remaining !== null ? (
            <div className="flex items-start gap-2">
              <Users className={cn('mt-0.5 size-3.5 shrink-0', lowStock ? 'text-coral' : 'text-muted-foreground')} strokeWidth={1.75} />
              <dd className={cn(lowStock ? 'font-semibold text-coral' : 'text-ink')}>
                {data.seats_remaining} {data.seats_remaining === 1 ? 'seat' : 'seats'} left
              </dd>
            </div>
          ) : null}
        </dl>

        {/* Price + CTA, split by a border like every card in the marketplace —
            the one row a visitor scans first on both surfaces. */}
        <div className="mt-auto flex items-end justify-between border-t border-border pt-3">
          <div className="flex items-baseline gap-1">
            {data.monthly_price ? (
              <>
                <span className="text-lg font-bold text-ink">{priceText(data.monthly_price)}</span>
                {missedBudget ? (
                  <span className="ml-1 text-[11px] text-muted-foreground">above budget</span>
                ) : null}
              </>
            ) : (
              <span className="text-lg font-bold text-brand-deep">Free</span>
            )}
          </div>
          <Link
            href={ctaHref ?? `/student/explore/${data.group_id}`}
            onClick={() =>
              trackClient(PRODUCT_EVENTS.MATCH_VIEWED, { group_id: data.group_id, rank })
            }
            className="rounded-xl bg-brand px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-deep"
          >
            {ctaLabel}
          </Link>
        </div>
      </div>
    </div>
  );
}
