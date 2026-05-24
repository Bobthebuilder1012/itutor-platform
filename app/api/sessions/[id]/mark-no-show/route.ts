import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';
import { markStudentNoShow, markTutorNoShow } from '@/lib/services/sessionService';

export const dynamic = 'force-dynamic';

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Look up the session once and dispatch based on whether the caller is
    // the tutor (marking student no-show) or the student (reporting tutor).
    const admin = getServiceClient();
    const { data: session, error: sessionError } = await admin
      .from('sessions')
      .select('id, tutor_id, student_id')
      .eq('id', params.id)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let updated;
    if (session.tutor_id === user.id) {
      updated = await markStudentNoShow(params.id, user.id);
    } else if (session.student_id === user.id) {
      updated = await markTutorNoShow(params.id, user.id);
    } else {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({ session: updated }, { status: 200 });
  } catch (error) {
    console.error('Error marking no-show:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to mark no-show' },
      { status: 500 }
    );
  }
}













