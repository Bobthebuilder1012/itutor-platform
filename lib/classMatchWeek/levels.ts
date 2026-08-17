/**
 * Level normalisation for Class Match Week.
 *
 * `groups.form_level` is not an enum. It is unconstrained text carrying two
 * vocabularies at once — enum-style values like `FORM_4` alongside free-text
 * display labels like `CSEC (14–16)` — and the `GroupFormLevel` union in
 * lib/types/groups.ts contains neither of the free-text ones. Matching against
 * that union compiles and silently returns nothing.
 *
 * Three things this has to get right, each of which has already bitten:
 *
 * 1. **Dashes.** The separator in `CSEC (14–16)` and `SEA (10–12)` is EN DASH
 *    (U+2013), not a hyphen. A rule written with an ASCII hyphen matches zero
 *    rows. Rather than asking everyone to copy literals out of the database,
 *    `canonicalise` folds every Unicode dash to `-` before comparing, so the
 *    patterns below can be written in plain ASCII and still match.
 *
 * 2. **One class can be several levels.** `CSEC (14–16)` spans Form 4 and
 *    Form 5. Mapping it to one strands the other; mapping it to neither strands
 *    the class. So a class level resolves to a SET, and a class legitimately
 *    surfaces under two different level selections.
 *
 * 3. **The two sides share no strings.** Classes say `CAPE`; learners
 *    (`profiles.form_level`) say `Lower 6` / `Upper 6`, which share no substring
 *    with it. Measured overlap between the class vocabulary and the learner
 *    vocabulary is zero, so the map has to work in both directions.
 *
 * An unrecognised value resolves to an empty set and is logged. That is
 * deliberate: the column is unconstrained, new values will arrive, and silently
 * dropping a class is how a teacher ends up invisible with nobody knowing.
 */

/** The seven options the questionnaire offers, and the campaign's internal vocabulary. */
export type CanonicalLevel =
  | 'SEA'
  | 'FORM_1'
  | 'FORM_2'
  | 'FORM_3'
  | 'FORM_4'
  | 'FORM_5'
  | 'CAPE';

export const QUESTIONNAIRE_LEVELS: ReadonlyArray<{ value: CanonicalLevel; label: string }> = [
  { value: 'SEA', label: 'SEA' },
  { value: 'FORM_1', label: 'Form 1' },
  { value: 'FORM_2', label: 'Form 2' },
  { value: 'FORM_3', label: 'Form 3' },
  { value: 'FORM_4', label: 'Form 4' },
  { value: 'FORM_5', label: 'Form 5' },
  { value: 'CAPE', label: 'CAPE' },
];

/**
 * Fold a raw level string into a comparable form: Unicode dashes to ASCII,
 * underscores to spaces, whitespace collapsed, upper-cased.
 *
 * The dash fold is the load-bearing part. U+2010..U+2015 covers hyphen through
 * horizontal bar; U+2212 is the minus sign, which occasionally arrives from
 * copy-paste out of a spreadsheet.
 */
function canonicalise(raw: string): string {
  return raw
    .replace(/[‐-―−]/g, '-')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Ordered rules. First match wins, so more specific patterns come first. */
const CLASS_LEVEL_RULES: ReadonlyArray<{
  test: (value: string) => boolean;
  levels: CanonicalLevel[];
}> = [
  // Spans both CSEC years. Prefix-matched so the age range can change without
  // this breaking — `CSEC (14-16)` today, anything `CSEC...` tomorrow.
  { test: (v) => v.startsWith('CSEC'), levels: ['FORM_4', 'FORM_5'] },
  { test: (v) => v.startsWith('SEA'), levels: ['SEA'] },
  // CAPE before FORM, since a CAPE label never contains "FORM".
  { test: (v) => v.startsWith('CAPE'), levels: ['CAPE'] },
  { test: (v) => v.startsWith('LOWER 6') || v.startsWith('UPPER 6'), levels: ['CAPE'] },
  { test: (v) => v.startsWith('FORM 1'), levels: ['FORM_1'] },
  { test: (v) => v.startsWith('FORM 2'), levels: ['FORM_2'] },
  { test: (v) => v.startsWith('FORM 3'), levels: ['FORM_3'] },
  { test: (v) => v.startsWith('FORM 4'), levels: ['FORM_4'] },
  { test: (v) => v.startsWith('FORM 5'), levels: ['FORM_5'] },
];

/**
 * Resolve a `groups.form_level` value to the canonical levels it covers.
 *
 * @returns one or more levels, or an empty array if unrecognised. An empty
 *          array means the class cannot be matched and should be treated as
 *          ineligible — never as "matches everything".
 */
export function normaliseClassLevel(raw: string | null | undefined): CanonicalLevel[] {
  if (!raw || !raw.trim()) return [];

  const value = canonicalise(raw);
  for (const rule of CLASS_LEVEL_RULES) {
    if (rule.test(value)) return rule.levels;
  }

  console.warn(
    `[class-match-week] Unrecognised groups.form_level: ${JSON.stringify(raw)} ` +
      `(canonicalised: ${JSON.stringify(value)}). Class excluded from matching. ` +
      `Add a rule in lib/classMatchWeek/levels.ts.`
  );
  return [];
}

/**
 * Resolve a learner-side level (`profiles.form_level`, or a questionnaire
 * answer) to a single canonical level.
 *
 * Single rather than a set: a child is at one level, even though a class can
 * serve several.
 */
export function normaliseLearnerLevel(raw: string | null | undefined): CanonicalLevel | null {
  if (!raw || !raw.trim()) return null;

  const value = canonicalise(raw);
  for (const rule of CLASS_LEVEL_RULES) {
    if (rule.test(value)) {
      // A learner-side value that spans two levels (a bare "CSEC") is not
      // specific enough to match on; treat it as unknown rather than guessing.
      return rule.levels.length === 1 ? rule.levels[0]! : null;
    }
  }
  return null;
}

/** Does a class serve the level a learner selected? */
export function classServesLevel(
  rawClassLevel: string | null | undefined,
  selected: CanonicalLevel
): boolean {
  return normaliseClassLevel(rawClassLevel).includes(selected);
}

/** Human label for a canonical level, for cards and confirmation copy. */
export function levelLabel(level: CanonicalLevel): string {
  return QUESTIONNAIRE_LEVELS.find((l) => l.value === level)?.label ?? level;
}
