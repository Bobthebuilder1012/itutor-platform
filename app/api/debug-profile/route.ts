import { NextRequest, NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });
    }

    const supabase = getServiceClient();

    console.log('Debugging profile for user:', userId);

    // Try to fetch the profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    console.log('Profile result:', { profile, error: profileError });

    // Also check if user exists in auth.users
    const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);

    console.log('Auth user result:', { authUser, error: authError });

    return NextResponse.json({
      userId,
      profile: profile || null,
      profileError: profileError?.message || null,
      authUser: authUser ? {
        id: authUser.user?.id,
        email: authUser.user?.email,
        created_at: authUser.user?.created_at
      } : null,
      authError: authError?.message || null,
      diagnosis: !profile ? 'Profile does not exist in profiles table' :
                 !profile.email ? 'Profile exists but has no email' :
                 'Profile looks good'
    });

  } catch (error) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json({
      error: 'Debug failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
