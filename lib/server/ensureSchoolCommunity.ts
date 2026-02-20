import type { SupabaseClient } from '@supabase/supabase-js';

export interface EnsureSchoolCommunityResult {
  success: boolean;
  error?: string;
  communityId?: string;
}

/**
 * Leaves any SCHOOL community the user is in that is not their current institution.
 * When currentInstitutionId is null, leaves all SCHOOL communities.
 */
async function leaveOtherSchoolCommunities(
  supabase: SupabaseClient,
  userId: string,
  currentInstitutionId: string | null
): Promise<void> {
  let communityIdsQuery = supabase
    .from('communities_v2')
    .select('id')
    .eq('type', 'SCHOOL');

  if (currentInstitutionId !== null) {
    communityIdsQuery = communityIdsQuery.neq('school_id', currentInstitutionId);
  }

  const { data: otherSchoolCommunities } = await communityIdsQuery;
  if (!otherSchoolCommunities?.length) return;

  const now = new Date().toISOString();
  await supabase
    .from('community_memberships_v2')
    .update({ status: 'LEFT', left_at: now })
    .eq('user_id', userId)
    .eq('status', 'ACTIVE')
    .in('community_id', otherSchoolCommunities.map((c) => c.id));
  }

/**
 * Ensures the school community exists for the user's institution (communities_v2)
 * and the user has an ACTIVE membership (community_memberships_v2).
 * Use with service-role client (e.g. in API routes or server actions).
 */
export async function ensureSchoolCommunityAndMembershipWithClient(
  supabase: SupabaseClient,
  userId: string
): Promise<EnsureSchoolCommunityResult> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('institution_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      return { success: false, error: profileError.message };
    }

    if (!profile?.institution_id) {
      await leaveOtherSchoolCommunities(supabase, userId, null);
      return { success: true };
    }

    const institutionId = profile.institution_id;

    await leaveOtherSchoolCommunities(supabase, userId, institutionId);

    const { data: institution, error: instError } = await supabase
      .from('institutions')
      .select('id, name')
      .eq('id', institutionId)
      .single();

    if (instError || !institution) {
      return { success: false, error: 'Institution not found' };
    }

    let communityId: string;

    const { data: existing } = await supabase
      .from('communities_v2')
      .select('id')
      .eq('school_id', institutionId)
      .eq('type', 'SCHOOL')
      .maybeSingle();

    if (existing) {
      communityId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from('communities_v2')
        .insert({
          type: 'SCHOOL',
          school_id: institutionId,
          name: `${institution.name} Community`,
          description: `School community for ${institution.name}`,
          created_by: null,
        })
        .select('id')
        .single();

      if (insertError) {
        return { success: false, error: insertError.message };
      }
      communityId = inserted!.id;
    }

    const { data: membership, error: memError } = await supabase
      .from('community_memberships_v2')
      .select('id, status')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (memError) {
      return { success: false, error: memError.message };
    }

    if (!membership) {
      const { error: insertMemError } = await supabase
        .from('community_memberships_v2')
        .insert({
          community_id: communityId,
          user_id: userId,
          role: 'MEMBER',
          status: 'ACTIVE',
        });

      if (insertMemError) {
        return { success: false, error: insertMemError.message };
      }
    } else if (membership.status === 'LEFT') {
      const { error: updateError } = await supabase
        .from('community_memberships_v2')
        .update({
          status: 'ACTIVE',
          left_at: null,
          joined_at: new Date().toISOString(),
        })
        .eq('community_id', communityId)
        .eq('user_id', userId);

      if (updateError) {
        return { success: false, error: updateError.message };
      }
    }

    await syncSchoolCommunityMembers(supabase, communityId, institutionId);

    return { success: true, communityId };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Ensures every profile with the given institution_id has an ACTIVE membership
 * in the school community (inserts only for users who have no row yet).
 */
export async function syncSchoolCommunityMembers(
  supabase: SupabaseClient,
  communityId: string,
  institutionId: string
): Promise<void> {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id')
    .eq('institution_id', institutionId);

  if (!profiles?.length) return;

  const { data: existing } = await supabase
    .from('community_memberships_v2')
    .select('user_id')
    .eq('community_id', communityId);

  const existingIds = new Set((existing ?? []).map((r) => r.user_id));
  const toInsert = profiles.filter((p) => !existingIds.has(p.id)).map((p) => ({
    community_id: communityId,
    user_id: p.id,
    role: 'MEMBER' as const,
    status: 'ACTIVE' as const,
  }));

  if (!toInsert.length) return;

  const BATCH = 100;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    await supabase.from('community_memberships_v2').insert(chunk);
  }
}

/** Alias for plan: ensure school community and auto-join. */
export const ensureSchoolCommunityAndAutoJoin = ensureSchoolCommunityAndMembershipWithClient;
