// Does the name on the verified ID match the teacher's profile name? Stored as a plain
// yes or no (tutor_verification_v2.identity_name_match) for the admin review screen. The
// name that is on the document is read from the provider's result, compared and thrown away:
// it is never stored, logged or returned.

import type { Db } from '@/lib/verification/setStatus';

/** Lower case, accents removed, punctuation gone, split into words. */
function words(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '') // O'Neil and ONeil are the same name
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * True when every word of the shorter name is in the longer one, so "Ana Maria Ramdhanie"
 * matches "Ana Ramdhanie", in any order and ignoring accents and case. An empty name never matches.
 */
export function namesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const A = words(a ?? '');
  const B = words(b ?? '');
  if (A.length === 0 || B.length === 0) return false;
  const inside = (x: string[], y: string[]) => x.every((w) => y.includes(w));
  return inside(A, B) || inside(B, A);
}

/**
 * The extra column to write with an identity result, or undefined when the provider gave no
 * name (nothing is overwritten then). Never throws.
 */
export async function nameMatchExtra(
  db: Db,
  tutorId: string,
  documentName: string | null | undefined
): Promise<Record<string, unknown> | undefined> {
  if (!documentName) return undefined;
  try {
    const { data } = await db.from('profiles').select('full_name, display_name').eq('id', tutorId).maybeSingle();
    if (!data) return undefined;
    // The legal-looking name first; the display name only if there is no full name.
    const profileName = (data as { full_name?: string | null }).full_name || (data as { display_name?: string | null }).display_name;
    if (!profileName) return undefined;
    return { identity_name_match: namesMatch(profileName, documentName) };
  } catch {
    return undefined;
  }
}
