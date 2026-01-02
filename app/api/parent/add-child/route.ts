import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  // Debug: Log all environment variables related to Supabase
  console.log('Environment check:');
  console.log('NEXT_PUBLIC_SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) + '...');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'EXISTS (length: ' + process.env.SUPABASE_SERVICE_ROLE_KEY.length + ')' : 'MISSING');
  
  try {
    const body = await request.json();
    const { email, password, fullName, institutionId, institutionName, formLevel, subjects } = body;

    // Check environment variables first
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
    }

    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: 'SUPABASE_SERVICE_ROLE_KEY is not configured. Please add it to .env.local and restart your dev server.' 
      }, { status: 500 });
    }

    // Get parent's session from Authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    
    // Create admin client with service role key (for all operations)
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

    // Verify the user's token
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error('User error:', userError);
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    console.log('User ID:', user.id);

    // Verify parent is actually a parent (using admin client to bypass RLS)
    const { data: parentProfile, error: profileFetchError } = await supabaseAdmin
      .from('profiles')
      .select('role, country')
      .eq('id', user.id)
      .single();

    console.log('Parent profile:', parentProfile);
    console.log('Profile fetch error:', profileFetchError);

    if (!parentProfile) {
      return NextResponse.json({ 
        error: 'Profile not found. Please ensure you have completed signup.',
        debug: { userId: user.id, profileFetchError }
      }, { status: 404 });
    }

    if (parentProfile.role !== 'parent') {
      return NextResponse.json({ 
        error: `Only parents can add children. Your role: ${parentProfile.role}`,
        debug: { role: parentProfile.role }
      }, { status: 403 });
    }

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

    // Generate username from email
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Create or update profile for child (using admin client with upsert)
    const { data: childProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        username,
        full_name: fullName,
        school: institutionName,
        institution_id: institutionId,
        form_level: formLevel,
        role: 'student',
        billing_mode: 'parent_required',
        rating_count: 0,
        country: parentProfile.country || 'TT',
      }, {
        onConflict: 'id'
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Try to clean up auth user if it was just created
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json({ error: `Profile creation failed: ${profileError.message}` }, { status: 500 });
    }

    // Create parent-child link (using admin client with upsert to handle duplicates)
    const { error: linkError } = await supabaseAdmin
      .from('parent_child_links')
      .upsert({
        parent_id: user.id,
        child_id: childProfile.id
      }, {
        onConflict: 'parent_id,child_id'
      });

    if (linkError) {
      console.error('Link error:', linkError);
      return NextResponse.json({ error: `Failed to link parent and child: ${linkError.message}` }, { status: 500 });
    }

    // Save subjects (using admin client)
    if (subjects && subjects.length > 0) {
      // Get subject IDs from labels
      const { data: subjectRecords } = await supabaseAdmin
        .from('subjects')
        .select('id')
        .in('label', subjects);

      if (subjectRecords && subjectRecords.length > 0) {
        const userSubjects = subjectRecords.map((s) => ({
          user_id: authData.user.id,
          subject_id: s.id,
        }));

        await supabaseAdmin.from('user_subjects').insert(userSubjects);
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

