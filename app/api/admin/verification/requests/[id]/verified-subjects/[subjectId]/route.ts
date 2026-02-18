// =====================================================
// REMOVE VERIFIED SUBJECT (ADMIN)
// =====================================================
// Admin removes a verified subject from a verification request

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; subjectId: string } }
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
  const requestId = params.id;
  const verifiedSubjectId = params.subjectId;

  try {
    const { data: row, error: deleteError } = await supabase
      .from('tutor_verified_subjects')
      .delete()
      .eq('id', verifiedSubjectId)
      .eq('source_request_id', requestId)
      .select('id')
      .single();

    if (deleteError) {
      if (deleteError.code === 'PGRST116') {
        return NextResponse.json(
          { error: 'Verified subject not found or not linked to this request' },
          { status: 404 }
        );
      }
      console.error('Error removing verified subject:', deleteError);
      return NextResponse.json(
        { error: 'Failed to remove verified subject' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Verified subject removed successfully',
      removedId: verifiedSubjectId,
    });
  } catch (error) {
    console.error('Exception removing verified subject:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
