// =====================================================
// SUSPEND USER ACCOUNT (ADMIN)
// =====================================================
// Admin can suspend a user account

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
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
    
    const { userId } = params;
    const body = await request.json();
    const { reason } = body;

    if (!reason || reason.trim().length === 0) {
      return NextResponse.json({ error: 'Suspension reason is required' }, { status: 400 });
    }

    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, is_suspended')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.is_suspended) {
      return NextResponse.json({ error: 'User is already suspended' }, { status: 400 });
    }

    // Suspend the account
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_suspended: true,
        suspension_reason: reason,
        suspended_at: new Date().toISOString(),
        suspended_by: auth.user.id,
        suspension_lifted_at: null,
        suspension_lifted_by: null,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error suspending account:', updateError);
      return NextResponse.json({ error: 'Failed to suspend account' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Account suspended successfully`,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Error in POST /api/admin/accounts/[userId]/suspend:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

