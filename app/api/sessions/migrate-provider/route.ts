import { NextRequest, NextResponse } from 'next/server';
import { migrateSessionsToNewProvider } from '@/lib/services/migrateSessionsToNewProvider';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Manual trigger for session migration when a tutor switches video providers
 * This can be used if automatic migration fails or needs to be re-run
 */
export async function POST(request: NextRequest) {
  try {
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

    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    console.log('🔐 Auth check:', {
      hasUser: !!user,
      userId: user?.id,
      userEmail: user?.email,
      authError: authError
    });
    
    if (authError || !user) {
      console.error('❌ No user found:', authError);
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Verify user is a tutor
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, email, full_name')
      .eq('id', user.id)
      .single();

    console.log('🔍 User check:', {
      userId: user.id,
      userEmail: user.email,
      profile: profile,
      profileError: profileError
    });

    if (profileError) {
      console.error('❌ Failed to fetch profile:', profileError);
      return NextResponse.json(
        { error: `Failed to verify user: ${profileError.message}` },
        { status: 500 }
      );
    }

    if (!profile || profile.role !== 'tutor') {
      console.error('❌ User is not a tutor:', { role: profile?.role, userId: user.id });
      return NextResponse.json(
        { error: `Only tutors can migrate sessions. Current role: ${profile?.role || 'unknown'}` },
        { status: 403 }
      );
    }

    console.log('✅ User verified as tutor:', profile.email);

    // Get tutor's current video provider
    const { data: videoConnection } = await supabase
      .from('tutor_video_provider_connections')
      .select('provider')
      .eq('tutor_id', user.id)
      .single();

    if (!videoConnection) {
      return NextResponse.json(
        { error: 'No video provider connected' },
        { status: 400 }
      );
    }

    console.log(`🔄 Manual migration triggered for tutor ${user.id} to ${videoConnection.provider}`);
    console.log(`📧 Tutor email: ${profile.email || 'unknown'}`);

    // Run migration
    const result = await migrateSessionsToNewProvider(
      user.id,
      videoConnection.provider as 'google_meet' | 'zoom'
    );

    console.log(`✅ Migration result:`, {
      success: result.success,
      migratedCount: result.migratedCount,
      error: result.error
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: `Successfully migrated ${result.migratedCount} sessions to ${videoConnection.provider}`,
        migratedCount: result.migratedCount,
        provider: videoConnection.provider
      });
    } else {
      return NextResponse.json({
        success: false,
        message: result.error || 'Migration completed with errors',
        migratedCount: result.migratedCount,
        error: result.error
      }, { status: 207 }); // 207 Multi-Status
    }
  } catch (error) {
    console.error('Migration API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

