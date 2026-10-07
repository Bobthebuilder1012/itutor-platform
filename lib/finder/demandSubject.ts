/**
 * One subject, however it was spelled.
 *
 * The Finder's subject list is the curriculum vocabulary (`subjects.name`, e.g.
 * "Mathematics") UNIONED with live class subjects (free text, e.g. "CSEC
 * Mathematics"). Submit used to resolve the pick with `name ILIKE <pick>`, which
 * missed every class-spelled option, and stored only the resolved id — so the
 * pick was lost and the Demand Map said "Unknown subject" (22 of the first 96
 * production requests). Migration 265 now stores the text, and this file is the
 * one place that turns any spelling into a canonical row and a cluster key.
 *
 * The SQL backfill in migration 265 mirrors `subjectKey` — change both together.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalLevel } from '@/lib/matching/levels';

/**
 * Comparison key: lowercase, "(POB)"-style suffixes and a leading CSEC/CAPE/SEA
 * dropped, "&" read as "and", punctuation collapsed.
 *
 * "CSEC Principles of Business (POB)", "Principles of Business" and
 * "principles of business" all give "principles of business".
 */
export function subjectKey(raw: string | null | undefined): string {
  if (!raw) return '';
  return raw
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(csec|cape|sea)\s+/, '')
    .trim();
}

/** Which curriculum a learner level implies, for breaking same-name ties. */
function curriculumFor(level: CanonicalLevel | null): string | null {
  if (level === 'CAPE') return 'CAPE';
  if (level === 'SEA') return 'SEA';
  if (level && level.startsWith('FORM_')) return 'CSEC';
  return null;
}

export interface ResolvedSubject {
  subjectId: string | null;
  /** The canonical `subjects.name`, or null when nothing matched. */
  name: string | null;
}

/**
 * Resolve a picked subject to its canonical row.
 *
 * Matches on `name` or `label` through `subjectKey`, preferring the curriculum
 * the level implies — "Biology" exists for both CSEC and CAPE, and a Form 5 pick
 * must not be filed under CAPE. Never throws; a miss is `{ null, null }` and the
 * caller still has the text.
 */
export async function resolveSubject(
  service: SupabaseClient,
  picked: string,
  level: CanonicalLevel | null
): Promise<ResolvedSubject> {
  const key = subjectKey(picked);
  if (!key) return { subjectId: null, name: null };

  try {
    const { data, error } = await service
      .from('subjects')
      .select('id, name, label, curriculum');
    if (error || !data) return { subjectId: null, name: null };

    const rows = data as Array<{
      id: string;
      name: string;
      label: string | null;
      curriculum: string | null;
    }>;
    const hits = rows.filter(r => subjectKey(r.name) === key || subjectKey(r.label) === key);
    if (hits.length === 0) return { subjectId: null, name: null };

    const want = curriculumFor(level);
    const best =
      (want && hits.find(r => (r.curriculum ?? '').toUpperCase().startsWith(want))) || hits[0];
    return { subjectId: best.id, name: best.name };
  } catch {
    return { subjectId: null, name: null };
  }
}

/**
 * What a ledger row should be called: the canonical name when it resolved, the
 * family's own words otherwise, and an honest "not recorded" only for the rows
 * that predate migration 265 and could not be recovered.
 */
export function signalSubjectLabel(row: {
  subject?: { name: string | null } | null;
  subject_text?: string | null;
}): string | null {
  const name = row.subject?.name?.trim();
  if (name) return name;
  const text = row.subject_text?.trim();
  return text || null;
}
