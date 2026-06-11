import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Returns the IDs of all tutors who have completed tertiary signup:
 *   avatar_url, bio, availability rule, rate > 0, video provider connection.
 * Uses the service client to bypass RLS on protected tables.
 */
export async function GET() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();

    const [
      { data: withAvailability },
      { data: withVideoProvider },
      { data: withPricedSubjects },
    ] = await Promise.all([
      service.from('tutor_availability_rules').select('tutor_id'),
      service.from('tutor_video_provider_connections').select('tutor_id'),
      service.from('tutor_subjects').select('tutor_id').gt('price_per_hour_ttd', 0),
    ]);

    const availSet = new Set((withAvailability ?? []).map(r => r.tutor_id));
    const videoSet = new Set((withVideoProvider ?? []).map(r => r.tutor_id));
    const priceSet = new Set((withPricedSubjects ?? []).map(r => r.tutor_id));

    // Intersect: tutor must pass all three table checks
    const candidates = [...availSet].filter(id => videoSet.has(id) && priceSet.has(id));

    if (candidates.length === 0) {
      return NextResponse.json({ ids: [] });
    }

    // Check whether the requesting user is a dev account
    const { data: requesterProfile } = await service
      .from('profiles')
      .select('is_dev_account')
      .eq('id', user.id)
      .single();
    const requesterIsDev = requesterProfile?.is_dev_account === true;

    // Also require avatar_url and bio from profiles; exclude dev accounts for non-dev viewers
    let profileQuery = service
      .from('profiles')
      .select('id, avatar_url, bio, is_dev_account')
      .in('id', candidates);

    if (!requesterIsDev) {
      profileQuery = profileQuery.neq('is_dev_account', true);
    }

    const { data: profiles } = await profileQuery;

    const listedIds = (profiles ?? [])
      .filter(p => p.avatar_url && p.bio?.trim()?.length > 0)
      .map(p => p.id);

    return NextResponse.json({ ids: listedIds });
  } catch (err) {
    console.error('[GET /api/tutors/listed-ids]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
