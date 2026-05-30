// GET /api/groups/[groupId]/access
// Returns the current subscription access state for the authenticated student.
// Used by the group detail CTA to render the correct multi-state UI.

import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ groupId: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { groupId } = await params;

    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getServiceClient();

    // Call the check_subscription_access RPC (defined in migration 159)
    const { data, error } = await admin.rpc('check_subscription_access', {
      p_student_id: user.id,
      p_group_id: groupId,
    });

    if (error) {
      console.error('[GET /api/groups/[groupId]/access] RPC error:', error);
      // Fallback: return no-access so the UI can still render
      return NextResponse.json({
        has_access: false,
        enrollment_id: null,
        status: null,
        payment_status: null,
      });
    }

    // The RPC returns a jsonb object with full access context
    return NextResponse.json(data ?? { has_access: false });

  } catch (err) {
    console.error('[GET /api/groups/[groupId]/access]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
