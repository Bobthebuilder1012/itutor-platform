import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCommunityById, joinCommunity, leaveCommunity, getUserMembership } from '@/lib/supabase/community';

// #region agent log
fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/communities/[communityId]/join/route.ts:MODULE_LOAD',message:'Module loaded - checking env vars',data:{supabaseUrl:process.env.NEXT_PUBLIC_SUPABASE_URL,hasAnonKey:!!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'A,C,D'})}).catch(()=>{});
// #endregion

// Force dynamic rendering - prevent static optimization
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { communityId: string } }
) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/communities/[communityId]/join/route.ts:POST_ENTRY',message:'POST handler entered',data:{communityId:params.communityId,envUrl:process.env.NEXT_PUBLIC_SUPABASE_URL},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'B,C'})}).catch(()=>{});
    // #endregion
    
    const cookieStore = cookies();
    
    // #region agent log
    fetch('http://127.0.0.1:7243/ingest/403090cb-4ee1-4433-9d50-c21c9a1713e4',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/communities/[communityId]/join/route.ts:BEFORE_CLIENT',message:'Before createServerClient',data:{url:process.env.NEXT_PUBLIC_SUPABASE_URL,urlType:typeof process.env.NEXT_PUBLIC_SUPABASE_URL,urlLength:process.env.NEXT_PUBLIC_SUPABASE_URL?.length},timestamp:Date.now(),sessionId:'debug-session',hypothesisId:'C,D'})}).catch(()=>{});
    // #endregion
    
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

    // Get community
    const community = await getCommunityById(params.communityId);
    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Check if joinable
    if (!community.is_joinable) {
      return NextResponse.json(
        { error: 'This community cannot be joined manually' },
        { status: 400 }
      );
    }

    // Check if already a member
    const existingMembership = await getUserMembership(params.communityId, user.id);
    if (existingMembership) {
      return NextResponse.json(
        { error: 'Already a member' },
        { status: 400 }
      );
    }

    const membership = await joinCommunity(params.communityId, user.id);

    return NextResponse.json(membership, { status: 201 });
  } catch (error) {
    console.error('Error joining community:', error);
    return NextResponse.json(
      { error: 'Failed to join community' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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

    // Get community
    const community = await getCommunityById(params.communityId);
    if (!community) {
      return NextResponse.json(
        { error: 'Community not found' },
        { status: 404 }
      );
    }

    // Check if joinable (can only leave if it's joinable)
    if (!community.is_joinable) {
      return NextResponse.json(
        { error: 'Cannot leave auto-assigned communities' },
        { status: 400 }
      );
    }

    await leaveCommunity(params.communityId, user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error leaving community:', error);
    return NextResponse.json(
      { error: 'Failed to leave community' },
      { status: 500 }
    );
  }
}






