import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import { markStudentNoShow } from '@/lib/services/sessionService';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Get authenticated user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
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












