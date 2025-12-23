import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  // Debug: Log all environment variables related to Supabase
  console.log('Environment check:');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'EXISTS (length: ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'MISSING');
  
  try {
    const body = await request.json();
    const { email, password, fullName, institutionId, institutionName, formLevel, subjects } = body;

    // Get parent's session
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.error('No session found');
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('Session user ID:', session.user.id);

    // Verify parent is actually a parent
    const { data: parentProfile, error: profileFetchError } = await supabase
      .from('profiles')
      .select('role, country')
      .eq('id', session.user.id)
      .single();

    console.log('Parent profile:', parentProfile);
    console.log('Profile fetch error:', profileFetchError);

    if (!parentProfile) {
      return NextResponse.json({ 
        error: 'Profile not found. Please ensure you have completed signup.',
        debug: { userId: session.user.id, profileFetchError }
      }, { status: 404 });
    }

    if (parentProfile.role !== 'parent') {
      return NextResponse.json({ 
        error: `Only parents can add children. Your role: ${parentProfile.role}`,
        debug: { role: parentProfile.role }
      }, { status: 403 });
    }

    // Check environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('Supabase URL exists:', !!supabaseUrl);
    console.log('Service Role Key exists:', !!serviceRoleKey);
    console.log('Service Role Key length:', serviceRoleKey?.length || 0);

    if (!supabaseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_SUPABASE_URL is not configured' }, { status: 500 });
    }

    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Please add it to .env.local and restart your dev server.' 
      }, { status: 500 });
    }

    // Create admin client with service role key
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Create the child auth user
    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName,
        role: 'student'
      }
    });

    if (signUpError) {
      console.error('Signup error:', signUpError);
      return NextResponse.json({ error: signUpError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    // Create profile for child
    const { data: childProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        school: institutionName,
        institution_id: institutionId,
        form_level: formLevel,
        role: 'student',
        billing_mode: 'parent_required',
        rating_count: 0,
        country: parentProfile.country || 'TT',
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 500 });
    }

    // Create parent-child link
    const { error: linkError } = await supabase
      .from('parent_child_links')
      .insert({
        parent_id: session.user.id,
        child_id: childProfile.id
      });

    if (linkError) {
      console.error('Link error:', linkError);
      return NextResponse.json({ error: `Failed to link parent and child: ${linkError.message}` }, { status: 500 });
    }

    // Save subjects
    if (subjects && subjects.length > 0) {
      // Get subject IDs from labels
      const { data: subjectRecords } = await supabase
        .from('subjects')
        .select('id')
        .in('label', subjects);

      if (subjectRecords && subjectRecords.length > 0) {
        const userSubjects = subjectRecords.map((s) => ({
          user_id: authData.user.id,
          subject_id: s.id,
        }));

        await supabase.from('user_subjects').insert(userSubjects);
      }
    }

    return NextResponse.json({ 
      success: true, 
      childId: childProfile.id 
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

