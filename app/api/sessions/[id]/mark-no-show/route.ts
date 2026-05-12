import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { markStudentNoShow } from '@/lib/services/sessionService';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const session = await markStudentNoShow(params.id, user.id);

    return NextResponse.json({ session }, { status: 200 });
  } catch (error) {
    console.error('Error marking no-show:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark no-show' },
      { status: 500 }
    );
  }
}













