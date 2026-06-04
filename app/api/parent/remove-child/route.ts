import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// DELETE /api/parent/remove-child — unlinks a child from a parent account
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();
    const { childId } = await req.json();
    if (!childId) return NextResponse.json({ error: 'childId required' }, { status: 400 });

    // Verify the link exists and belongs to this parent
    const { data: link } = await service
      .from('parent_child_links')
      .select('id')
      .eq('parent_id', user.id)
      .eq('child_id', childId)
      .maybeSingle();

    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Remove the link
    await service.from('parent_child_links').delete().eq('parent_id', user.id).eq('child_id', childId);

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[DELETE /api/parent/remove-child]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed' }, { status: 500 });
  }
}
