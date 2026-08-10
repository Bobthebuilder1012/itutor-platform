import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { timeBandsInRange, type TimeBand } from '@/lib/utils/scheduleFormat';

export const dynamic = 'force-dynamic';

/** When a tutor takes 1:1 bookings, for Explore's day / time-of-day filters. */
export type TutorAvailability = { days: number[]; bands: TimeBand[] };

/**
 * Returns the IDs of all tutors who have completed tertiary signup:
 *   avatar_url, bio, availability rule, rate > 0, video provider connection.
 * Uses the service client to bypass RLS on protected tables.
 *
 * Also returns each listed tutor's weekly availability, bucketed by weekday and
 * time of day. Students can't read `tutor_availability_rules` themselves — RLS,
 * migration 011: "Students cannot read raw rules" — and this route already has
 * every row in hand to decide who is listed at all, so the Explore filters get
 * their availability data here rather than in a second round trip.
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
      availabilityRes,
      { data: withVideoProvider },
      { data: withPricedSubjects },
    ] = await Promise.all([
      service.from('tutor_availability_rules').select('tutor_id, day_of_week, start_time, end_time, is_active'),
      service.from('tutor_video_provider_connections').select('tutor_id'),
      service.from('tutor_subjects').select('tutor_id').gt('price_per_hour_ttd', 0),
    ]);

    // Who gets listed at all depends on this table, so the extra window columns
    // must never be the reason a tutor vanishes: fall back to the bare tutor_id
    // read (and no availability data) if they're unavailable.
    let withAvailability = availabilityRes.data;
    if (availabilityRes.error) {
      console.warn('[tutors/listed-ids] availability columns unavailable:', availabilityRes.error.message);
      const { data } = await service.from('tutor_availability_rules').select('tutor_id');
      withAvailability = data as typeof withAvailability;
    }

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

    // Bucket each listed tutor's weekly rules into weekdays + time-of-day bands.
    const listedSet = new Set(listedIds);
    const availability: Record<string, TutorAvailability> = {};
    for (const row of withAvailability ?? []) {
      const r = row as { tutor_id: string; day_of_week?: number; start_time?: string; end_time?: string; is_active?: boolean };
      if (!listedSet.has(r.tutor_id)) continue;
      if (r.is_active === false) continue;
      if (r.day_of_week == null || !r.start_time || !r.end_time) continue;
      const entry = (availability[r.tutor_id] ??= { days: [], bands: [] });
      if (!entry.days.includes(r.day_of_week)) entry.days.push(r.day_of_week);
      for (const band of timeBandsInRange(r.start_time, r.end_time)) {
        if (!entry.bands.includes(band)) entry.bands.push(band);
      }
    }
    for (const entry of Object.values(availability)) entry.days.sort((a, b) => a - b);

    return NextResponse.json({ ids: listedIds, availability });
  } catch (err) {
    console.error('[GET /api/tutors/listed-ids]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
