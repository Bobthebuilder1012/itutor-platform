import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// DELETE /api/parent/delete-child-account
// Permanently deletes the child's student account and all associated data.
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { childId } = await req.json();
    if (!childId) return NextResponse.json({ error: 'childId required' }, { status: 400 });

    // Verify this parent actually has this child linked
    const { data: link } = await service
      .from('parent_child_links')
      .select('id, child_id')
      .eq('parent_id', user.id)
      .eq('child_id', childId)
      .maybeSingle();

    if (!link) return NextResponse.json({ error: 'Child not found or not linked to your account' }, { status: 404 });

    // Verify the child is actually a student (safety check)
    const { data: childProfile } = await service
      .from('profiles')
      .select('role, billing_mode')
      .eq('id', childId)
      .maybeSingle();

    if ((childProfile as any)?.role !== 'student') {
      return NextResponse.json({ error: 'Can only delete student accounts' }, { status: 400 });
    }

    // Remove parent-child link first
    await service.from('parent_child_links').delete().eq('child_id', childId);

    // Remove from any group memberships
    await service.from('group_members').delete().eq('user_id', childId);

    // Delete the auth user (this cascades to the profile via the database trigger)
    const { error: deleteError } = await service.auth.admin.deleteUser(childId);
    if (deleteError) throw deleteError;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/parent/delete-child-account]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to delete account' }, { status: 500 });
  }
}
