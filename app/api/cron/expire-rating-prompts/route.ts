import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();

  const { data, error } = await db
    .from('rating_prompts')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('[expire-rating-prompts]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  console.log(`[expire-rating-prompts] expired ${data?.length ?? 0} prompts`);
  return NextResponse.json({ expired: data?.length ?? 0 });
}
