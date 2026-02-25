import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import type { CreateGroupInput } from '@/lib/types/groups';

// GET /api/groups — list all non-archived groups with tutor info and member previews
export async function GET(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const subject = searchParams.get('subject');
    const tutorName = searchParams.get('tutor_name');

    const service = getServiceClient();

    let query = service
      .from('groups')
      .select(`
        id, name, description, tutor_id, subject, pricing, created_at,
        tutor:profiles!groups_tutor_id_fkey(id, full_name, avatar_url),
        group_members(id, user_id, status, profile:profiles(id, full_name, avatar_url))
      `)
      .is('archived_at', null)
      .order('created_at', { ascending: false });

    if (subject) {
      query = query.ilike('subject', `%${subject}%`);
    }

    const { data: groups, error } = await query;
    if (error) throw error;

    // Attach current user membership and member previews
    const enriched = (groups ?? []).map((g: any) => {
      const approvedMembers = (g.group_members ?? []).filter((m: any) => m.status === 'approved');
      const currentUserMembership = (g.group_members ?? []).find((m: any) => m.user_id === user.id) ?? null;

      return {
        ...g,
        group_members: undefined,
        member_count: approvedMembers.length,
        member_previews: approvedMembers.slice(0, 3).map((m: any) => m.profile),
        current_user_membership: currentUserMembership,
      };
    });

    // Filter by tutor name client-side (simple search)
    const filtered = tutorName
      ? enriched.filter((g: any) =>
          g.tutor?.full_name?.toLowerCase().includes(tutorName.toLowerCase())
        )
      : enriched;

    return NextResponse.json({ groups: filtered });
  } catch (err) {
    console.error('[GET /api/groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/groups — create a group (tutor only)
export async function POST(request: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data: profile } = await service
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'tutor') {
      return NextResponse.json({ error: 'Only tutors can create groups' }, { status: 403 });
    }

    const body: CreateGroupInput = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'Group name is required' }, { status: 400 });
    }

    // Store multiple subjects as a comma-separated string
    const subjectString =
      body.subjects && body.subjects.length > 0
        ? body.subjects.join(', ')
        : null;

    const { data: group, error } = await service
      .from('groups')
      .insert({
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        subject: subjectString,
        tutor_id: user.id,
        pricing: 'free',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
