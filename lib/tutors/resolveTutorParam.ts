// =====================================================
// TUTOR ROUTE PARAM → CANONICAL ID
// =====================================================
// /tutors/[tutorId] and /student/tutors/[tutorId] are reached two ways: a QR
// code, which encodes the UUID, and the "Share your profile" link, which
// encodes the username. Every query, API route and child component on those
// pages keys off the UUID, so a username has to be exchanged for one before
// anything else runs.

import { supabase } from '@/lib/supabase/client';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * `_` and `%` are wildcards to LIKE, and usernames legitimately contain
 * underscores — alejandro_lee would otherwise also match alejandroXlee.
 */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * The tutor id behind a username, or null when there is no unambiguous answer.
 *
 * Usernames are not unique case-insensitively — production currently holds two
 * distinct accounts for each of alejandro_lee and saphire. So an exact match
 * always wins, and a case-insensitive match only counts when it returns a
 * single row; showing a stranger the wrong tutor's profile would be worse than
 * showing them nothing.
 */
export async function resolveTutorIdFromUsername(username: string): Promise<string | null> {
  const trimmed = username.trim();
  if (!trimmed) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, username')
    .eq('role', 'tutor')
    .ilike('username', escapeLikePattern(trimmed))
    .limit(5);

  if (error || !data?.length) return null;

  const exact = data.find((row) => row.username === trimmed);
  if (exact) return exact.id;

  return data.length === 1 ? data[0].id : null;
}
