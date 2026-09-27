/**
 * Claiming an anonymous Class Match Week submission onto an account.
 *
 * The algorithm moved to `lib/matching/claim.ts` — it is identical for any flow
 * that collects answers before an account exists, and Find Your iTutor needs
 * the same thing against a different table. This file is the campaign's binding
 * of it: it names the table and keeps the `{ submission }` result key the three
 * portal pages already destructure, so no call site changed.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { claimTokenRow } from '@/lib/matching/claim';
import type { ClassMatchSubmission } from './types';

export async function claimSubmission(
  admin: SupabaseClient,
  { token, userId }: { token: string; userId: string }
): Promise<{ claimed: boolean; submission: ClassMatchSubmission | null }> {
  const { claimed, row } = await claimTokenRow<ClassMatchSubmission>(admin, {
    table: 'class_match_submissions',
    token,
    userId,
  });
  return { claimed, submission: row };
}
