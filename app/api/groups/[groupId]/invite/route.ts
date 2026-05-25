import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

type Params = { params: Promise<{ groupId: string }> };

export const dynamic = 'force-dynamic';

// POST /api/groups/[groupId]/invite — tutor directly adds a student by email
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    // Verify caller is the tutor of this group
    const { data: group } = await service
      .from('groups')
      .select('id, tutor_id, name, max_students')
      .eq('id', groupId)
      .is('archived_at', null)
      .single();

    if (!group) return NextResponse.json({ error: 'Class not found' }, { status: 404 });
    if (group.tutor_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const query = (body.email ?? body.username ?? '').trim().toLowerCase();
    if (!query) return NextResponse.json({ error: 'Email or username is required' }, { status: 400 });

    // Look up the student profile by email (profiles.email is indexed)
    const { data: profileRow, error: profileErr } = await service
      .from('profiles')
      .select('id, full_name, email')
      .ilike('email', query)
      .maybeSingle();

    if (profileErr) throw profileErr;

    const studentId: string | null = profileRow?.id ?? null;

    if (!studentId) {
      return NextResponse.json({ error: `No account found for "${query}". They need to sign up first.` }, { status: 404 });
    }

    if (studentId === user.id) {
      return NextResponse.json({ error: 'You cannot invite yourself' }, { status: 400 });
    }

    // Check seat capacity
    const { count: memberCount } = await service
      .from('group_members')
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .eq('status', 'approved');

    if (group.max_students && (memberCount ?? 0) >= group.max_students) {
      return NextResponse.json({ error: 'Class is full' }, { status: 400 });
    }

    // Upsert — if they already have a record, approve it; otherwise insert
    const { data: existing } = await service
      .from('group_members')
      .select('id, status')
      .eq('group_id', groupId)
      .eq('user_id', studentId)
      .maybeSingle();

    let member: any;
    if (existing) {
      if (existing.status === 'approved') {
        return NextResponse.json({ error: 'This student is already a member', already_member: true }, { status: 409 });
      }
      const { data: updated, error } = await service
        .from('group_members')
        .update({ status: 'approved' })
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      member = updated;
    } else {
      const { data: inserted, error } = await service
        .from('group_members')
        .insert({ group_id: groupId, user_id: studentId, status: 'approved' })
        .select()
        .single();
      if (error) throw error;
      member = inserted;
    }

    // Notify the student (non-critical)
    try {
      await service.from('notifications').insert({
        user_id: studentId,
        type: 'class_invite',
        title: 'You were added to a class',
        message: `A tutor added you to "${group.name}".`,
        link: `/classes/${groupId}`,
        group_id: groupId,
      });
    } catch { /* non-critical */ }

    // Fetch their profile for the response
    const { data: profile } = await service
      .from('profiles')
      .select('id, full_name, avatar_url')
      .eq('id', studentId)
      .maybeSingle();

    return NextResponse.json({ member, profile }, { status: 201 });
  } catch (err) {
    console.error('[POST /api/groups/[groupId]/invite]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
