/**
 * "What can I attend from here" — the location filter's one rule.
 *
 * Pure, and separate from any component, because the rule is not the obvious
 * one and the obvious one fails silently.
 *
 * ── THE TRAP ────────────────────────────────────────────────────────────────
 * The intuitive implementation of "show me classes in Chaguanas" is
 * `where venue.region === 'Chaguanas'`. That is wrong, and wrong in a way
 * nobody reports: it makes every ONLINE class vanish from a town search. The
 * results still look plausible — a short list of real classes — so the reader
 * concludes there is little on offer in their area rather than that the filter
 * ate most of the catalogue.
 *
 * Picking a town means "what can I attend from here", not "what has a venue
 * here". An online class is attendable from Chaguanas. So a region selection
 * returns physical and hybrid classes with a venue in that region PLUS every
 * online class, with the card saying which is which.
 *
 * `alsoShowOnline` (default true) is the escape hatch for the other intent —
 * someone who specifically wants a room. Turning it off narrows to in-person
 * only.
 *
 * ── FORMAT vs LOCATION ARE DIFFERENT AXES ───────────────────────────────────
 * `format: 'in_person'` means "the class meets somewhere", regardless of where.
 * `region` means "somewhere is this town". They compose, and the combination
 * that reads oddly — in-person + a region + alsoShowOnline — resolves in favour
 * of the explicit format choice: asking for in person and getting online
 * results back would be the same silent contradiction in the other direction.
 */

/** What the visitor asked for. */
export type FormatFilter = 'any' | 'online' | 'in_person';

/** The fields of a class this filter reads. Everything else is irrelevant. */
export interface LocatableClass {
  /** Absent or null on every class before migration 242 — all of them online. */
  classFormat?: 'online' | 'physical' | 'hybrid' | null;
  /** The venue's region id, when the class has a venue. */
  venueRegionId?: string | null;
}

export interface LocationFilterState {
  format: FormatFilter;
  /** null = Anywhere. */
  regionId: string | null;
  /** Only meaningful once a region is chosen. Defaults to true. */
  alsoShowOnline: boolean;
}

export const DEFAULT_LOCATION_FILTER: LocationFilterState = {
  format: 'any',
  regionId: null,
  alsoShowOnline: true,
};

/** Null/undefined means online — that is what pre-242 classes are. */
export function formatOf(c: LocatableClass): 'online' | 'physical' | 'hybrid' {
  return c.classFormat === 'physical' || c.classFormat === 'hybrid' ? c.classFormat : 'online';
}

/** Does this class meet somewhere a person can travel to? */
export function meetsInPerson(c: LocatableClass): boolean {
  const f = formatOf(c);
  return f === 'physical' || f === 'hybrid';
}

/** Can this class be attended from a screen? Hybrid counts — that is the point. */
export function meetsOnline(c: LocatableClass): boolean {
  const f = formatOf(c);
  return f === 'online' || f === 'hybrid';
}

export function isLocationFilterActive(s: LocationFilterState): boolean {
  return s.format !== 'any' || s.regionId !== null;
}

/**
 * The predicate. Returns true when this class should be shown.
 */
export function matchesLocation(c: LocatableClass, s: LocationFilterState): boolean {
  // ── Format axis ──
  if (s.format === 'online' && !meetsOnline(c)) return false;
  if (s.format === 'in_person' && !meetsInPerson(c)) return false;

  // ── Region axis ──
  if (!s.regionId) return true;

  const inRegion = meetsInPerson(c) && c.venueRegionId === s.regionId;

  // An explicit "in person" choice means the room is the point, so a region
  // narrows to rooms in that region and online results would contradict the
  // format the visitor just picked.
  if (s.format === 'in_person') return inRegion;

  // Otherwise: rooms here, plus everything attendable from here.
  if (inRegion) return true;
  return s.alsoShowOnline && meetsOnline(c);
}
