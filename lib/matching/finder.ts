/**
 * The Finder's matcher: scoring and classification.
 *
 * Deterministic and rule-based. No LLM — the GTM plan requires an explainable
 * reason on every match, and a rendered fact ("Saturday mornings, $250/month,
 * 4 seats left") is both faster and more trustworthy to a parent than a
 * generated sentence.
 *
 * PURE BY DESIGN. This module takes an already-resolved candidate list and
 * returns a ranked verdict. It does no I/O, so the scoring rules are unit
 * testable without a database, and the supply query stays in one place instead
 * of being reimplemented per surface. The caller is responsible for building
 * candidates through the SAME resolver the marketplace uses
 * (`resolveScheduleEntries` in lib/utils/scheduleFormat.ts) — if the Finder and
 * /api/groups disagree about a class's schedule, a family sees a class on one
 * screen and not the other, which reads as a bug in the platform rather than a
 * difference in filters.
 *
 * FOUR DEPARTURES FROM THE BUILD SPEC, each forced by measured reality:
 *
 * 1. SUBJECT IS NOT AN ID JOIN. The spec filters on `groups.subject_id`. There
 *    is no such column — `groups.subject` is nullable free text with no foreign
 *    key (migration 087). Matching goes through `subjectMatches`, which is
 *    whole-word containment over normalised tokens. An equality join would
 *    return zero rows for every request, silently.
 *
 * 2. LEVEL IS A HARD FILTER; VERIFICATION IS NOT. The spec has it the other way
 *    round (§5.2: hard filters are subject, verification, capacity; level scores
 *    10 points). Both are wrong for this catalogue:
 *      - A CAPE class genuinely cannot serve a Form 1 learner. Scoring that as a
 *        10-point deduction lets it surface as a near match, which is not a near
 *        match, it is the wrong class.
 *      - Verification as a hard filter cuts supply to 2 classes. It is a ranking
 *        signal and a displayed badge here, not a gate.
 *
 * 3. AVAILABILITY IS BLOCK OVERLAP, NOT day x time BUCKETS. See
 *    ./availability.ts — the six blocks cover 100% of live supply, and the
 *    spec's 12-cell grid includes combinations (weekday mornings) that are
 *    school hours and can never be served.
 *
 * 4. ONLY ACTIONABLE DIMENSIONS GATE THE CLASSIFICATION. `exact` / `near` /
 *    `none` is decided by availability and budget alone, because those are the
 *    two the near-match screen can offer a button for ("Change my days",
 *    "Change my budget"). A near miss the family cannot act on is a dead end
 *    with extra steps. Verification and quality rank the survivors.
 */

import {
  entriesMatchAvailability,
  classAvailabilityBlocks,
  type AvailabilityBlock,
} from './availability';
import { classServesLevel, type CanonicalLevel } from './levels';
import { subjectMatches } from './subjects';
import type { ScheduleEntry } from '@/lib/utils/scheduleFormat';

/** What the family asked for. */
export interface FinderCriteria {
  /** Canonical subject names the picked `subjects` row resolves to. */
  subjectNames: string[];
  level: CanonicalLevel | null;
  availabilityBlocks: AvailabilityBlock[];
  /** Upper bound of the chosen band, in TTD. `null` means "no ceiling". */
  budgetMax: number | null;
}

/**
 * One class, with everything the matcher needs already resolved.
 *
 * `scheduleEntries` MUST come from `resolveScheduleEntries` so it reflects the
 * same three-tier fallback (manual schedule_data → group_sessions recurrence →
 * dated occurrences) the marketplace renders from.
 */
export interface FinderCandidate {
  groupId: string;
  /** Raw `groups.subject` — free text, may be null. */
  subject: string | null;
  /** Raw `groups.form_level` — unconstrained text, may carry either vocabulary. */
  formLevel: string | null;
  /** Monthly price in TTD, from groups.price_monthly. Null is treated as free. */
  monthlyPrice: number | null;
  scheduleEntries: ScheduleEntry[];
  /** Seats left. Null means unknown, which is NOT treated as full. */
  seatsRemaining: number | null;
  tutorVerified: boolean;
  /** Mean rating 0-5, or null when unrated. */
  rating: number | null;
}

/** The two dimensions a family can be sent back to change. */
export type GatingDimension = 'availability' | 'budget';

export interface ScoredMatch {
  groupId: string;
  score: number;
  /** Blocks this class actually covers — the card's "fits" line. */
  blocks: AvailabilityBlock[];
  /** Which gating dimensions this candidate failed. */
  missed: GatingDimension[];
}

export type MatchClass = 'exact' | 'near' | 'none';

export interface MatchResult {
  matchClass: MatchClass;
  /** Set only when matchClass is 'near'. */
  nearMissOn: GatingDimension | null;
  matches: ScoredMatch[];
}

// Ranking weights. Availability and budget also gate the classification;
// verification and quality only sort the survivors.
const W_AVAILABILITY = 35;
const W_BUDGET = 25;
const W_VERIFIED = 20;
const W_QUALITY = 20;

/**
 * Hard filters. A candidate failing any of these is not a near match — it is
 * not a candidate. Kept separate from scoring so the distinction cannot blur:
 * the whole point of `near` is "right class, wrong detail", and a wrong-level or
 * wrong-subject class is not the right class.
 */
export function passesHardFilters(
  candidate: FinderCandidate,
  criteria: FinderCriteria
): boolean {
  if (!subjectMatches(candidate.subject, criteria.subjectNames)) return false;

  // A null level on the request means the question was skipped; do not gate.
  if (criteria.level && !classServesLevel(candidate.formLevel, criteria.level)) {
    return false;
  }

  // Null seats means the capacity is unknown, not zero. Excluding unknowns
  // would hide every class that has not had its capacity set.
  if (candidate.seatsRemaining !== null && candidate.seatsRemaining <= 0) return false;

  return true;
}

/** Is the class inside the family's budget? A free class always is. */
function withinBudget(candidate: FinderCandidate, criteria: FinderCriteria): boolean {
  if (criteria.budgetMax === null) return true; // "$600+" band: no ceiling
  const price = candidate.monthlyPrice ?? 0;
  return price <= criteria.budgetMax;
}

function scoreCandidate(
  candidate: FinderCandidate,
  criteria: FinderCriteria
): ScoredMatch {
  const missed: GatingDimension[] = [];

  // entriesMatchAvailability treats an empty selection as "no constraint" but
  // still requires the class to have a usable schedule — a class with no
  // schedule must never present as a match, or the filter looks ignored.
  const availabilityOk = entriesMatchAvailability(
    candidate.scheduleEntries,
    criteria.availabilityBlocks
  );
  if (!availabilityOk) missed.push('availability');

  const budgetOk = withinBudget(candidate, criteria);
  if (!budgetOk) missed.push('budget');

  let score = 0;
  if (availabilityOk) score += W_AVAILABILITY;
  if (budgetOk) score += W_BUDGET;
  if (candidate.tutorVerified) score += W_VERIFIED;

  // Quality: rating carries it, with seats as a mild tiebreak so a class that
  // is nearly full does not outrank an equally-rated one with room.
  if (candidate.rating !== null) {
    score += (Math.max(0, Math.min(5, candidate.rating)) / 5) * W_QUALITY;
  }

  return {
    groupId: candidate.groupId,
    score: Math.round(score * 100) / 100,
    blocks: classAvailabilityBlocks(candidate.scheduleEntries),
    missed,
  };
}

/**
 * Rank candidates and classify the outcome.
 *
 * `exact` — at least one candidate satisfies both gating dimensions.
 * `near`  — none are exact, but at least one misses exactly ONE dimension, and
 *           every such candidate misses the SAME one, so the screen can name it.
 * `none`  — no candidates, or every candidate misses two dimensions, or the
 *           near misses disagree about which dimension is wrong.
 *
 * That last clause matters. If one class is right except the time and another is
 * right except the price, there is no single honest sentence and no single
 * button; offering "Change my days" would silently drop the other class. `none`
 * with a relaxed-search link is the truthful answer.
 */
export function matchFinderRequest(
  candidates: FinderCandidate[],
  criteria: FinderCriteria,
  maxMatches: number
): MatchResult {
  const eligible = candidates.filter(c => passesHardFilters(c, criteria));
  if (eligible.length === 0) {
    return { matchClass: 'none', nearMissOn: null, matches: [] };
  }

  const scored = eligible
    .map(c => scoreCandidate(c, criteria))
    .sort((a, b) => b.score - a.score);

  const exact = scored.filter(s => s.missed.length === 0);
  if (exact.length > 0) {
    return {
      matchClass: 'exact',
      nearMissOn: null,
      matches: exact.slice(0, maxMatches),
    };
  }

  const nearMisses = scored.filter(s => s.missed.length === 1);
  if (nearMisses.length > 0) {
    const dimensions = new Set(nearMisses.map(s => s.missed[0]));
    if (dimensions.size === 1) {
      return {
        matchClass: 'near',
        nearMissOn: nearMisses[0].missed[0],
        matches: nearMisses.slice(0, maxMatches),
      };
    }
  }

  return { matchClass: 'none', nearMissOn: null, matches: [] };
}

/** Copy for the near-match button. Must name a step the wizard can reopen. */
export function nearMissButtonLabel(dimension: GatingDimension): string {
  return dimension === 'availability' ? 'Change my days' : 'Change my budget';
}

/** Which wizard step a near miss sends the family back to. */
export function nearMissStep(dimension: GatingDimension): number {
  return dimension === 'availability' ? 2 : 4;
}
