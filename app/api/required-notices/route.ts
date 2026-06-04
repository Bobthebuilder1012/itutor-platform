import { NextResponse } from 'next/server';
import { authenticateUser } from '@/lib/api/groupAuth';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await authenticateUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = getServiceClient();
    const { data, error } = await service
      .from('required_notices')
      .select('*')
      .eq('user_id', user.id)
      .is('acknowledged_at', null)
      .order('requires_ack', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ notices: data ?? [] });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Internal server error' },
      { status: 500 }
    );
  }
}
