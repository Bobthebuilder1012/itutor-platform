// Price and rating filter options for the Explore marketplace.
//
// Both used to be free-form: price was a Min/Max number pair and rating was a
// 1+…5+ row. Typing a range is work the student has to do before they can see
// anything, and "1+ stars" and "2+ stars" filter out nothing anybody wants
// filtered — so both are now short lists of picks.
//
// Day / time-of-day filtering lives in scheduleFormat.ts (TIME_BANDS,
// DAY_FILTER_OPTIONS), next to the schedule parsing it depends on.

export type PriceBand = {
  id: string;
  label: string;
  /** Inclusive bounds in TT$. null = open-ended on that side. */
  min: number | null;
  max: number | null;
};

/**
 * Suggested bands, contiguous so every price is reachable by some band — a
 * class at TT$350 has to be findable. Bounds are inclusive on both sides, so a
 * price landing exactly on a boundary shows up in both neighbouring bands
 * rather than falling between them.
 *
 * Same bands for both tabs; only the unit differs (per hour for 1:1 tutors,
 * per month for a class), which the filter's own label spells out.
 */
export const PRICE_BANDS: PriceBand[] = [
  { id: 'any', label: 'Any price', min: null, max: null },
  { id: 'u100', label: 'Under TT$100', min: null, max: 99 },
  { id: '100-200', label: 'TT$100 – 200', min: 100, max: 200 },
  { id: '200-300', label: 'TT$200 – 300', min: 200, max: 300 },
  { id: '300-400', label: 'TT$300 – 400', min: 300, max: 400 },
  { id: '400-500', label: 'TT$400 – 500', min: 400, max: 500 },
  { id: '500-600', label: 'TT$500 – 600', min: 500, max: 600 },
  { id: '600+', label: 'TT$600+', min: 600, max: null },
];

export const ANY_PRICE = 'any';

export function priceBandById(id: string | null | undefined): PriceBand {
  return PRICE_BANDS.find((b) => b.id === id) ?? PRICE_BANDS[0];
}

export function priceInBand(price: number, band: PriceBand): boolean {
  if (band.min !== null && price < band.min) return false;
  if (band.max !== null && price > band.max) return false;
  return true;
}

/** null = any rating. Nothing below 4 is offered: it filters out nothing real. */
export const RATING_OPTIONS: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Any rating' },
  { value: 4, label: '4 stars & up' },
  { value: 5, label: '5 stars' },
];
