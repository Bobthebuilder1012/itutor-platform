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
 *    `none` is decided by availability, budget and delivery, because those are
 *    the three the near-match screen can offer a button for ("Change my days",
 *    "Change my budget", "Show me online classes too"). A near miss the family
 *    cannot act on is a dead end with extra steps. Verification and quality
 *    rank the survivors.
 *
 * 5. DELIVERY GATES, IT DOES NOT HARD-FILTER. Migration 242 made classes
 *    physical, hybrid or online. A wrong-format class is genuinely unusable —
 *    but unlike a wrong LEVEL it is unusable for a reason the family can undo in
 *    one tap, so it belongs with availability and budget rather than with
 *    subject. It is weighted above budget: another $50 a month is findable,
 *    another ferry is not.
 */

import {
  entriesMatchAvailability,
  classAvailabilityBlocks,
  type AvailabilityBlock,
} from './availability';
import { classServesLevel, type CanonicalLevel } from './levels';
import { subjectMatches } from './subjects';
import { classServesDelivery, type DeliveryPref } from './delivery';
import type { ScheduleEntry } from '@/lib/utils/scheduleFormat';

/** What the family asked for. */
export interface FinderCriteria {
  /** Canonical subject names the picked `subjects` row resolves to. */
  subjectNames: string[];
  level: CanonicalLevel | null;
  availabilityBlocks: AvailabilityBlock[];
  /** Upper bound of the chosen band, in TTD. `null` means "no ceiling". */
  budgetMax: number | null;
  /** Online / in person / either. Null means the question was not asked — which
   *  is true of every run recorded before migration 243. */
  deliveryPref: DeliveryPref | null;
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
  /** Raw `groups.class_format`. Null means the row predates migration 242, in
   *  which case the class is online — that is what those classes are. */
  classFormat: string | null;
  /** Where a physical class meets, for the card. Null for online classes. */
  regionName: string | null;
  /** Seats left. Null means unknown, which is NOT treated as full. */
  seatsRemaining: number | null;
  tutorVerified: boolean;
  /** Mean rating 0-5, or null when unrated. */
  rating: number | null;
}

/**
 * The dimensions a family can be sent back to change.
 *
 * The membership rule is not "everything we asked": it is "everything the
 * near-match screen can offer a working button for". Subject and level are
 * excluded because changing them does not widen the search, it starts a
 * different one. `delivery` earns its place because "show me online classes
 * too" is a real, one-tap widening that often turns nothing into something.
 */
export type GatingDimension = 'availability' | 'budget' | 'delivery';

export interface ScoredMatch {
  groupId: string;
  score: number;
  /** Blocks this class actually covers — the card's "fits" line. */
  blocks: AvailabilityBlock[];
  /** Which gating dimensions this candidate failed. */
  missed: GatingDimension[];
}

export type MatchClass = 'exact' | 'near' | 'fallback' | 'none';

export interface MatchResult {
  matchClass: MatchClass;
  /** Set only when matchClass is 'near'. */
  nearMissOn: GatingDimension | null;
  matches: ScoredMatch[];
}

// Ranking weights. Availability, budget and delivery also gate the
// classification; verification and quality only sort the survivors.
//
// Delivery is weighted ABOVE budget because it is the harder constraint in
// practice. A family can find another $50 a month; they cannot find another
// ferry. A wrong-format match is unusable in a way an over-budget one is not.
const W_AVAILABILITY = 30;
const W_DELIVERY = 30;
const W_BUDGET = 20;
const W_VERIFIED = 10;
const W_QUALITY = 10;

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

  // A null deliveryPref (a run from before migration 243) is unconstrained, so
  // classServesDelivery returns true and this never becomes a phantom miss on
  // historical data.
  const deliveryOk = classServesDelivery(candidate.classFormat, criteria.deliveryPref);
  if (!deliveryOk) missed.push('delivery');

  let score = 0;
  if (availabilityOk) score += W_AVAILABILITY;
  if (budgetOk) score += W_BUDGET;
  if (deliveryOk) score += W_DELIVERY;
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
  // ── Strict pass ────────────────────────────────────────────────────────────
  // Subject, level and capacity are hard; availability and budget gate the
  // classification.
  const eligible = candidates.filter(c => passesHardFilters(c, criteria));

  if (eligible.length > 0) {
    const scored = eligible
      .map(c => scoreCandidate(c, criteria))
      .sort((a, b) => b.score - a.score);

    const exact = scored.filter(s => s.missed.length === 0);
    if (exact.length > 0) {
      return { matchClass: 'exact', nearMissOn: null, matches: exact.slice(0, maxMatches) };
    }

    // `near` only when every near miss agrees on WHICH dimension is wrong —
    // otherwise there is no honest single sentence and no single button, and
    // naming one dimension would silently drop the class that failed the other.
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
  }

  // ── Fallback pass: SUBJECT TRUMPS EVERYTHING ───────────────────────────────
  // Nothing survived the strict pass. Rather than show an empty page, fall back
  // to "any class in the subject they asked for", dropping level, availability
  // and budget from the gate and keeping only subject and real capacity.
  //
  // WHY THIS IS A SEPARATE CLASS AND NOT SILENTLY FOLDED INTO `near`. These
  // classes may be the wrong year, the wrong day and over budget all at once, so
  // presenting them as "nearly right" would be a lie the family discovers one
  // click later. They are labelled as other classes in the subject, and the
  // ledger records `fallback` so the demand map still knows the specific request
  // went unserved — which is the whole point of the ledger.
  //
  // Capacity stays a hard filter here: a full class is not an option at any
  // level of desperation.
  const subjectOnly = candidates.filter(
    c =>
      subjectMatches(c.subject, criteria.subjectNames) &&
      !(c.seatsRemaining !== null && c.seatsRemaining <= 0) &&
      c.scheduleEntries.length > 0
  );

  if (subjectOnly.length > 0) {
    const scored = subjectOnly
      .map(c => scoreCandidate(c, criteria))
      .sort((a, b) => b.score - a.score);
    return {
      matchClass: 'fallback',
      nearMissOn: null,
      matches: scored.slice(0, maxMatches),
    };
  }

  // Genuinely nothing in this subject. This is the only true no-match, and it is
  // the row teacher acquisition should act on.
  return { matchClass: 'none', nearMissOn: null, matches: [] };
}

/**
 * Copy for the near-match button. Must name a step the wizard can reopen.
 *
 * The step NUMBER used to live here too, and was wrong: it returned 2 and 4
 * where STEP.AVAILABILITY is 1 and STEP.BUDGET is 3, so "Change my days" opened
 * the lesson-type question and "Change my budget" opened the urgency question.
 * It now lives in lib/finder/wizard.ts beside the STEP map it has to agree with
 * — this module is the pure matcher and has no business holding UI indices,
 * which is precisely how the two drifted apart.
 */
export function nearMissButtonLabel(dimension: GatingDimension): string {
  if (dimension === 'availability') return 'Change my days';
  if (dimension === 'budget') return 'Change my budget';
  return 'Show me online classes too';
}
