import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const userId = params.userId;
  if (!UUID_RE.test(userId)) {
    return NextResponse.json({ verified: false });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ verified: false });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from('degrees')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'verified')
    .maybeSingle();

  if (error) {
    console.error('degrees verified lookup:', error);
    return NextResponse.json({ verified: false });
  }

  return NextResponse.json({ verified: !!data });
}
