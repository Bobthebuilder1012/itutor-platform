// =====================================================
// API: SIGNUP WITH ONBOARDING EMAILS
// =====================================================
// Handles user signup and queues onboarding emails

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { queueOnboardingEmails } from '@/lib/services/onboardingEmailQueue';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName, username, role, countryCode } = body;

    if (!email || !password || !fullName || !role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Use service role for admin operations
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
    });

    if (authError || !authData.user) {
      console.error('Signup error:', authError);
      return NextResponse.json(
        { error: authError?.message || 'Failed to create account' },
        { status: 400 }
      );
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        display_name: username || fullName.split(' ')[0],
        username: username || null,
        role,
        country_code: countryCode || null,
      });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      // Clean up auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create profile' },
        { status: 500 }
      );
    }

    // Queue onboarding emails
    try {
      await queueOnboardingEmails({
        userId: authData.user.id,
        userType: role,
      });
      console.log(`✓ Queued onboarding emails for ${email}`);
    } catch (emailError) {
      console.error('Error queuing emails (non-fatal):', emailError);
      // Don't fail signup if email queueing fails
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: authData.user.email,
      },
    });
  } catch (error: any) {
    console.error('Signup API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
