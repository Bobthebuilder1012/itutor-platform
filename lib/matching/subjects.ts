/**
 * Subject normalisation and matching, shared by every matching surface.
 *
 * `groups.subject` is nullable free text with no foreign key and no check
 * constraint. Mathematics alone fragments into four non-matching strings —
 * `Mathematics`, `CSEC Mathematics`, `CSEC Additional Mathematics`,
 * `CAPE Pure Mathematics Unit 1`. A questionnaire option labelled
 * "Mathematics" compared raw would match SEA but not the Form 4
 * `CSEC Mathematics` classes: silent failure, no error, the parent concludes
 * iTutor does not offer the subject and leaves.
 *
 * So both sides of every comparison pass through `normaliseSubject`, which
 * lowercases, strips punctuation, and expands local abbreviations — a parent
 * in Trinidad types "add maths" and "POB", not "Additional Mathematics" and
 * "Principles of Business".
 *
 * Matching is whole-word containment, not raw substring: "mathematics" should
 * match inside "cape pure mathematics unit 1", but "it" (Information
 * Technology) must never match the "it" inside another word. Comparing token
 * sequences instead of characters gets the word boundaries for free.
 *
 * The canonical vocabulary is `public.subjects`, keyed on `curriculum` —
 * NEVER on `subjects.level`, which is corrupted (131 of 134 rows say 'CSEC',
 * including all 77 CAPE rows). `lib/subjects.ts` is dead code; do not import it.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalLevel } from './levels';
import { classServesLevel } from './levels';

/**
 * Local abbreviations → the full token sequence they stand for. Keys are
 * matched against normalised (lowercase, punctuation-stripped) input, longest
 * phrase first, so "add maths" expands as a unit rather than becoming
 * "add mathematics".
 */
export const SUBJECT_SYNONYMS: Record<string, string[]> = {
  maths: ['mathematics'],
  math: ['mathematics'],
  'add maths': ['additional', 'mathematics'],
  'add math': ['additional', 'mathematics'],
  pob: ['principles', 'of', 'business'],
  poa: ['principles', 'of', 'accounts'],
  edpm: ['electronic', 'document', 'preparation'],
  lit: ['literature'],
  it: ['information', 'technology'],
  hsb: ['human', 'and', 'social', 'biology'],
  bio: ['biology'],
  chem: ['chemistry'],
  phys: ['physics'],
  geo: ['geography'],
  econ: ['economics'],
};

/** Longest synonym key, in words — bounds the greedy phrase scan. */
const MAX_SYNONYM_WORDS = Math.max(
  ...Object.keys(SUBJECT_SYNONYMS).map((key) => key.split(' ').length)
);

/**
 * Lowercase, strip punctuation and parentheses, collapse whitespace.
 *
 * Periods and apostrophes are DELETED rather than turned into spaces, so
 * "I.T." becomes the token "it" (which the synonym map can expand) instead of
 * the unmatchable pair "i t". Everything else non-alphanumeric — hyphens,
 * slashes, parentheses — becomes a word boundary.
 */
function cleanTokens(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Normalise a subject string for comparison: lowercase, punctuation and
 * parentheses stripped, whitespace collapsed, and local abbreviations expanded
 * word-wise ("csec add maths" → "csec additional mathematics").
 *
 * Multi-word abbreviations are expanded greedily, longest phrase first —
 * otherwise the single-word rule maths→mathematics fires inside "add maths"
 * and produces "add mathematics", which matches nothing.
 */
export function normaliseSubject(raw: string): string {
  const tokens = cleanTokens(raw ?? '');
  const out: string[] = [];

  let i = 0;
  while (i < tokens.length) {
    let expanded = false;
    for (let len = Math.min(MAX_SYNONYM_WORDS, tokens.length - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(' ');
      const expansion = SUBJECT_SYNONYMS[phrase];
      if (expansion) {
        out.push(...expansion);
        i += len;
        expanded = true;
        break;
      }
    }
    if (!expanded) {
      out.push(tokens[i]!);
      i += 1;
    }
  }

  return out.join(' ');
}

/** Is `needle` a contiguous run inside `haystack`? Token-level, so word boundaries hold. */
function containsTokenRun(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  outer: for (let start = 0; start <= haystack.length - needle.length; start++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[start + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Does the class's subject cover any of the learner's selections?
 *
 * A selection matches when the normalised class subject contains the
 * normalised selection as a whole-word run — "mathematics" matches
 * "csec mathematics" and "cape pure mathematics unit 1", but "it" only matches
 * where the token "information technology" (its expansion) appears, never
 * inside another word.
 *
 * A null class subject never matches: one eligible class has no subject at
 * all, and treating that as a wildcard would recommend it for everything.
 */
export function subjectMatches(classSubject: string | null, selected: string[]): boolean {
  if (!classSubject || !classSubject.trim()) return false;

  const classTokens = normaliseSubject(classSubject).split(' ').filter(Boolean);
  if (classTokens.length === 0) return false;

  return selected.some((selection) => {
    const selectionTokens = normaliseSubject(selection).split(' ').filter(Boolean);
    return containsTokenRun(classTokens, selectionTokens);
  });
}

/**
 * SEA has no reliable curriculum rows in every environment — the
 * ensure-sea-subjects endpoint seeds them on demand — so when the query finds
 * nothing we fall back to the short canonical SEA list rather than showing a
 * blank Q2.
 */
const SEA_FALLBACK_SUBJECTS = ['Mathematics', 'English Language Arts', 'Science'];

/**
 * The subject options Q2 offers for a level.
 *
 * Two sources, deliberately combined because each fails differently alone:
 *
 * - **The curriculum list** (`public.subjects`, keyed on `curriculum`) is
 *   clean and complete, but a class whose subject string drifted from it
 *   ("CSEC Maths") would be permanently unmatchable from a static list.
 * - **Live inventory** (distinct subjects of published MONTHLY classes serving
 *   the level, resolved through the level normalisation layer) guarantees
 *   every matchable class is reachable, but alone it would expose data-entry
 *   errors as options and go blank where supply is thin.
 *
 * The union is deduped through `normaliseSubject`, curriculum spelling
 * winning, and returned sorted for stable rendering.
 */
export async function subjectsForLevel(
  admin: SupabaseClient,
  level: CanonicalLevel
): Promise<string[]> {
  // Curriculum side. FORM_1..FORM_5 are all CSEC — the level column carries no
  // per-form distinction, and subjects.level is corrupted anyway.
  let curriculumNames: string[] = [];
  if (level === 'CAPE') {
    const { data } = await admin.from('subjects').select('name').eq('curriculum', 'CAPE');
    curriculumNames = (data ?? []).map((row: { name: string }) => row.name);
  } else if (level === 'SEA') {
    const { data } = await admin.from('subjects').select('name').ilike('curriculum', 'SEA%');
    curriculumNames = (data ?? []).map((row: { name: string }) => row.name);
    if (curriculumNames.length === 0) curriculumNames = [...SEA_FALLBACK_SUBJECTS];
  } else {
    const { data } = await admin.from('subjects').select('name').eq('curriculum', 'CSEC');
    curriculumNames = (data ?? []).map((row: { name: string }) => row.name);
  }

  // Inventory side: whatever published MONTHLY classes actually say, filtered
  // to the classes that serve this level. pricing_model, never pricing_mode —
  // the latter is NULL on some rows and its TS union omits MONTHLY.
  const { data: groups } = await admin
    .from('groups')
    .select('subject, form_level')
    .eq('status', 'PUBLISHED')
    .eq('pricing_model', 'MONTHLY')
    .not('subject', 'is', null);

  const inventoryNames = (groups ?? [])
    .filter((g: { form_level: string | null }) => classServesLevel(g.form_level, level))
    .map((g: { subject: string | null }) => String(g.subject ?? '').trim())
    .filter(Boolean);

  // Dedupe by normalised form so "CSEC Mathematics" and "csec maths" collapse;
  // curriculum names come first, so their spelling wins the display string.
  const byKey = new Map<string, string>();
  for (const name of [...curriculumNames, ...inventoryNames]) {
    const key = normaliseSubject(name);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, name);
  }

  return [...byKey.values()].sort((a, b) => a.localeCompare(b));
}
