import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { ensureSchoolCommunityAndMembershipWithClient } from '@/lib/server/ensureSchoolCommunity';

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to ensure membership.' },
    { status: 405, headers: { Allow: 'POST' } }
  );
}

/**
 * Ensures the current user's school community (v2) and membership exist.
 * Returns communityId so the client can redirect to /community/[communityId].
 */
export async function POST() {
  try {
    const supabaseAuth = await getServerClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabaseAdmin = getServiceClient();
    const result = await ensureSchoolCommunityAndMembershipWithClient(supabaseAdmin, user.id);
    return NextResponse.json(result);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : typeof e === 'string' ? e : String(e) || 'Unknown error';
    console.error('[ensure-membership]', e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
