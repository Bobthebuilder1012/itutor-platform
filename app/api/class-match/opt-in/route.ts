import { NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { checkTutorEligibility } from '@/lib/classMatchWeek/eligibility';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';

export const dynamic = 'force-dynamic';

// POST /api/class-match/opt-in — a teacher joins the live campaign.
export async function POST() {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    // The gate returns its failures rather than a bare no, because the teacher
    // has to be told what to fix — a silent 422 produces a support ticket.
    const eligibility = await checkTutorEligibility(service, user.id);
    if (!eligibility.eligible) {
      return NextResponse.json({ failures: eligibility.failures }, { status: 422 });
    }

    const campaign = await getLiveCampaign(service);
    if (!campaign) {
      return NextResponse.json({ error: 'no_live_campaign' }, { status: 409 });
    }

    // Snapshot the gate at opt-in: every clause is mutable (a teacher can be
    // suspended, revoke Meet, or unpublish mid-week), so the row records what
    // was true when they joined. ON CONFLICT DO NOTHING keeps a double-tap
    // from overwriting the original snapshot.
    const { error } = await service
      .from('class_match_participation')
      .upsert(
        {
          campaign_id: campaign.id,
          tutor_id: user.id,
          gate_snapshot: eligibility,
        },
        { onConflict: 'campaign_id,tutor_id', ignoreDuplicates: true }
      );

    if (error) throw error;

    return NextResponse.json({ optedIn: true });
  } catch (err) {
    console.error('[POST class-match/opt-in]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
