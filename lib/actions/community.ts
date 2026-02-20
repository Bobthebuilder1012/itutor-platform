'use server';

import { getServiceClient } from '@/lib/supabase/server';
import { ensureSchoolCommunityAndMembershipWithClient } from '@/lib/server/ensureSchoolCommunity';

export type { EnsureSchoolCommunityResult } from '@/lib/server/ensureSchoolCommunity';

/**
 * Ensures the school community exists for the user's institution and the user
 * has an ACTIVE membership. Call after signup/onboarding when institution_id is set.
 */
export async function ensureSchoolCommunityAndMembership(userId: string) {
  const supabase = getServiceClient();
  return ensureSchoolCommunityAndMembershipWithClient(supabase, userId);
}
