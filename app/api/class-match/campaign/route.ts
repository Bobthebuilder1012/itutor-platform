import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';
import { getLiveCampaign } from '@/lib/classMatchWeek/portalData';

// Public and uncached. The portal is anonymous-first and every RLS policy on
// campaign-adjacent tables is TO authenticated, so this reads through the
// service client — the anon key would return empty silently, not error.
export const dynamic = 'force-dynamic';

// GET /api/class-match/campaign — the live campaign, or null outside the week.
export async function GET() {
  try {
    const campaign = await getLiveCampaign(getServiceClient());
    return NextResponse.json({ campaign });
  } catch (err) {
    console.error('[GET class-match/campaign]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
