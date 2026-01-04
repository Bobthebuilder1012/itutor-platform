import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCommunityById, updateCommunity, getMemberCount } from '@/lib/supabase/community';
import { checkModeratorPermission } from '@/lib/utils/rateLimits';
import type { UpdateCommunityData } from '@/lib/types/community';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const community = await getCommunityById(params.communityId);

    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Get member count
    const memberCount = await getMemberCount(params.communityId);

    return NextResponse.json({
      ...community,
      member_count: memberCount,
    });
  } catch (error) {
    console.error('Error fetching community:', error);
    return NextResponse.json(
      { error: 'Failed to fetch community' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is moderator/admin
    const isModerator = await checkModeratorPermission(user.id, params.communityId);
    if (!isModerator) {
      return NextResponse.json(
        { error: 'Only moderators and admins can update communities' },
        { status: 403 }
      );
    }

    const updates: UpdateCommunityData = await request.json();

    const community = await updateCommunity(params.communityId, updates);

    return NextResponse.json(community);
  } catch (error) {
    console.error('Error updating community:', error);
    return NextResponse.json(
      { error: 'Failed to update community' },
      { status: 500 }
    );
  }
}






