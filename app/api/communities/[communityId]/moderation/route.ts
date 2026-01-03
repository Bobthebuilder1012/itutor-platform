import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { moderateUser, getModActions } from '@/lib/supabase/community';
import { checkModeratorPermission } from '@/lib/utils/rateLimits';
import type { ModerateUserData } from '@/lib/types/community';

export async function GET(
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
        { error: 'Only moderators and admins can view moderation actions' },
        { status: 403 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const pagination = {
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '50'),
    };

    const actions = await getModActions(params.communityId, pagination);

    return NextResponse.json({ actions });
  } catch (error) {
    console.error('Error fetching mod actions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch moderation actions' },
      { status: 500 }
    );
  }
}

export async function POST(
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
        { error: 'Only moderators and admins can take moderation actions' },
        { status: 403 }
      );
    }

    const body: Omit<ModerateUserData, 'community_id'> = await request.json();

    // Validate required fields
    if (!body.user_id || !body.action) {
      return NextResponse.json(
        { error: 'user_id and action are required' },
        { status: 400 }
      );
    }

    const moderationData: ModerateUserData = {
      ...body,
      community_id: params.communityId,
    };

    await moderateUser(moderationData);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error moderating user:', error);
    return NextResponse.json(
      { error: 'Failed to moderate user' },
      { status: 500 }
    );
  }
}





