import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getCommunities, createCommunity } from '@/lib/supabase/community';
import type { CreateCommunityData } from '@/lib/types/community';

export async function GET(request: NextRequest) {
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

    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');
    const type = searchParams.get('type');
    const is_joinable = searchParams.get('is_joinable');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // If user_id is provided, get their communities via memberships
    if (user_id) {
      // First get the user's community IDs
      const { data: memberships, error: membershipError } = await supabase
        .from('community_memberships')
        .select('community_id')
        .eq('user_id', user_id)
        .eq('status', 'active');

      if (membershipError) throw membershipError;

      const communityIds = memberships?.map(m => m.community_id) || [];

      if (communityIds.length === 0) {
        return NextResponse.json({
          communities: [],
          total: 0,
          page,
          limit,
        });
      }

      // Fetch the communities
      const { data, error, count } = await supabase
        .from('communities')
        .select(`
          *,
          institution:institutions(id, name),
          subject:subjects(id, name)
        `, { count: 'exact' })
        .in('id', communityIds)
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return NextResponse.json({
        communities: data || [],
        total: count || 0,
        page,
        limit,
      });
    }

    // Regular query without user filter
    let query = supabase
      .from('communities')
      .select(`
        *,
        institution:institutions(id, name),
        subject:subjects(id, name)
      `, { count: 'exact' });

    if (type) query = query.eq('type', type);
    if (is_joinable === 'true') query = query.eq('is_joinable', true);
    if (is_joinable === 'false') query = query.eq('is_joinable', false);
    if (search) query = query.ilike('name', `%${search}%`);

    query = query.range(offset, offset + limit - 1).order('created_at', { ascending: false });

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      communities: data || [],
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Error fetching communities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch communities' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
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

    const body: CreateCommunityData = await request.json();

    // Validate required fields
    if (!body.name || !body.type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    // Check permissions for school/form communities
    if (body.type === 'school' || body.type === 'school_form') {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Only admins can create school communities' },
          { status: 403 }
        );
      }
    }

    const community = await createCommunity(body);

    return NextResponse.json(community, { status: 201 });
  } catch (error) {
    console.error('Error creating community:', error);
    return NextResponse.json(
      { error: 'Failed to create community' },
      { status: 500 }
    );
  }
}

