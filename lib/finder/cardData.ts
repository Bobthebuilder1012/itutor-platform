/**
 * A live class row → the marketplace card's shape.
 *
 * The Finder results page renders the SAME `ClassCard` as Explore. This is the
 * one adapter between them, so "identical" is a property of the code rather
 * than something that has to be re-checked by eye every time either side
 * changes.
 *
 * ── WHY LIVE ROWS AND NOT THE STORED SNAPSHOT ──────────────────────────────
 * `finder_requests.results` freezes what was recommended, which is exactly
 * right for the ranking — "what did we actually recommend" must stay
 * answerable. It is exactly wrong for the card's contents: a cover image, a
 * blurb, a price and a seat count all move after the run is recorded, and a
 * frozen copy of those is not stale, it is incorrect. So the snapshot decides
 * WHICH classes appear and in what ORDER, and everything drawn on the card is
 * read fresh.
 */

import { scheduleToCompact } from '@/lib/utils/scheduleFormat';
import { formatLevel } from '@/lib/utils/formatLevel';
import type { ClassCardData } from '@/components/marketplace/ClassCard';
import type { SupplyRow } from '@/lib/finder/supply';

/**
 * The gradient behind a class with no banner. Same palette and same
 * first-match-wins rule the marketplace uses, keyed off subject then name so a
 * class reads the same colour on both surfaces.
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

function gradientFor(...candidates: Array<string | null | undefined>): string {
  const hay = candidates.filter(Boolean).join(' ').toLowerCase();
  for (const [key, gradient] of Object.entries(SUBJECT_GRADIENT)) {
    if (hay.includes(key)) return gradient;
  }
  return 'from-brand to-brand-deep';
}

export function supplyRowToCard(row: SupplyRow): ClassCardData {
  const compact = row.scheduleEntries.length ? scheduleToCompact(row.scheduleEntries) : null;

  // `seatsRemaining` is what the matcher works in; the card wants taken/total.
  // Reconstructing rather than guessing: with no stated capacity the card must
  // show nothing at all, which classCapacityDisplay does for total === null.
  const total = row.maxStudents ?? null;
  const taken =
    total !== null && row.seatsRemaining !== null ? Math.max(0, total - row.seatsRemaining) : 0;

  return {
    id: row.groupId,
    title: row.name,
    tutor: row.tutorName ?? 'an iTutor',
    tutorAvatar: row.tutorAvatarUrl,
    subject: row.subject ?? '',
    level: row.formLevel ? formatLevel(row.formLevel) : '',
    day: compact ?? '',
    time: '',
    hasCompactSchedule: !!compact,
    scheduleEntries: row.scheduleEntries,
    monthlyPrice: row.monthlyPrice ?? 0,
    seats: { taken, total },
    sessionLength: row.sessionLengthMinutes,
    tutorRating: row.rating ?? null,
    // The supply loader does not carry a review count, and inventing one would
    // put a number under a star that nothing backs. 0 hides the count, keeping
    // the rating itself, which IS real.
    tutorReviews: 0,
    color: gradientFor(row.subject, row.name),
    description: row.description,
    coverImage: row.coverImage,
    classFormat: (row.classFormat as ClassCardData['classFormat']) ?? 'online',
    venueArea: row.regionName,
  };
}
