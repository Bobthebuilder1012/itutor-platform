import { NextRequest, NextResponse } from 'next/server';
import { ensureSchoolCommunityAndMembershipWithClient } from '@/lib/server/ensureSchoolCommunity';
import { getServiceClient } from '@/lib/supabase/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, fullName, institutionId, institutionName, formLevel, subjects } = body;
    const { parentProfile } = await requireParentContext();
    const supabaseAdmin = getServiceClient();

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
        subjects_of_study: Array.isArray(subjects) ? subjects : [],
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
        parent_id: parentProfile.id,
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

    if (institutionId) {
      await ensureSchoolCommunityAndMembershipWithClient(supabaseAdmin, authData.user.id);
    }

    return NextResponse.json({ 
      success: true, 
      childId: childProfile.id 
    });

  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'An unexpected error occurred' 
    }, { status: 500 });
  }
}

