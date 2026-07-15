// =====================================================
// GET USER ACCOUNT DETAILS (ADMIN)
// =====================================================
// Admin can view detailed information about a specific user

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/middleware/adminAuth';
import { getServiceClient } from '@/lib/supabase/server';
import { logAdminAction } from '@/lib/services/adminAudit';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// Fields an admin may edit on any account. Everything else — role, is_reviewer,
// verification status, suspension, billing_mode, ratings, email, money — is
// deliberately excluded and must go through its dedicated endpoint. Never spread
// the request body into update(); only these keys are copied.
const EDITABLE_FIELDS = [
  'full_name', 'display_name', 'username', 'bio', 'phone_number',
  'country', 'region', 'school', 'form_level',
  'avatar_url', 'profile_banner_url',
  'tutor_type', 'teaching_mode', 'subjects_of_study',
] as const;

export async function GET(
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

    // Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Fetch additional data based on role
    let additionalData: any = {};

    if (profile.role === 'parent') {
      // Fetch children
      const { data: children } = await supabase
        .from('parent_child_links')
        .select(`
          child_id,
          created_at,
          child:profiles!parent_child_links_child_id_fkey(
            id,
            full_name,
            email,
            form_level
          )
        `)
        .eq('parent_id', userId);

      additionalData.children = children;
    }

    if (profile.role === 'student') {
      // Fetch parent links
      const { data: parents } = await supabase
        .from('parent_child_links')
        .select(`
          parent_id,
          created_at,
          parent:profiles!parent_child_links_parent_id_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('child_id', userId);

      additionalData.parents = parents;
    }

    if (profile.role === 'tutor') {
      // Fetch tutor subjects
      const { data: subjects } = await supabase
        .from('tutor_subjects')
        .select(`
          *,
          subject:subjects(name, curriculum, level)
        `)
        .eq('tutor_id', userId);

      // Fetch verified subjects
      const { data: verifiedSubjects } = await supabase
        .from('tutor_verified_subjects')
        .select(`
          *,
          subject:subjects(name, curriculum, level)
        `)
        .eq('tutor_id', userId);

      additionalData.subjects = subjects;
      additionalData.verifiedSubjects = verifiedSubjects;

      // Tutor's classes (via service client so archived/private are included —
      // needed for the per-class QR codes and banner controls).
      const svc = getServiceClient();
      const { data: classes } = await svc
        .from('groups')
        .select('id, name, archived_at, cover_image')
        .eq('tutor_id', userId)
        .order('created_at', { ascending: false });
      additionalData.classes = classes ?? [];
    }

    // Fetch session statistics
    const { count: totalSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .or(`student_id.eq.${userId},tutor_id.eq.${userId}`);

    const { count: completedSessions } = await supabase
      .from('sessions')
      .select('*', { count: 'exact', head: true })
      .or(`student_id.eq.${userId},tutor_id.eq.${userId}`)
      .eq('status', 'completed');

    // Fetch ratings given (if student) or received (if tutor)
    let ratings: any = null;
    if (profile.role === 'student') {
      const { data: ratingsGiven } = await supabase
        .from('ratings')
        .select('*')
        .eq('student_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      ratings = { given: ratingsGiven };
    } else if (profile.role === 'tutor') {
      const { data: ratingsReceived } = await supabase
        .from('ratings')
        .select('*')
        .eq('tutor_id', userId)
        .order('created_at', { ascending: false })
        .limit(10);
      ratings = { received: ratingsReceived };
    }

    // Fetch suspension history
    const { data: suspensionHistory } = await supabase
      .from('profiles')
      .select('is_suspended, suspension_reason, suspended_at, suspended_by, suspension_lifted_at, suspension_lifted_by')
      .eq('id', userId)
      .single();

    return NextResponse.json({
      profile,
      additionalData,
      statistics: {
        totalSessions: totalSessions || 0,
        completedSessions: completedSessions || 0,
      },
      ratings,
      suspensionHistory,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/accounts/[userId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// =====================================================
// EDIT USER PROFILE (ADMIN) — whitelisted fields only
// =====================================================
export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const auth = await requireAdmin('full');
    if (auth.error) return auth.error;

    const { userId } = params;
    const body = await request.json().catch(() => ({}));
    const reason: string | null = typeof body?.reason === 'string' ? body.reason.trim() || null : null;

    // Copy only whitelisted keys that are actually present in the body.
    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        const value = body[field];
        if (field === 'subjects_of_study') {
          if (value !== null && !Array.isArray(value)) {
            return NextResponse.json({ error: 'subjects_of_study must be an array or null' }, { status: 400 });
          }
        } else if (value !== null && typeof value !== 'string') {
          return NextResponse.json({ error: `${field} must be a string or null` }, { status: 400 });
        }
        updates[field] = value === '' ? null : value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
    }

    const admin = getServiceClient();

    // Snapshot before, for the audit record and to confirm the target exists.
    const { data: before, error: beforeError } = await admin
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .single();
    if (beforeError || !before) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    updates.updated_at = new Date().toISOString();

    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select('*')
      .single();

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json({ error: 'That username is already taken' }, { status: 409 });
      }
      console.error('Admin profile update failed:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    const { updated_at, ...changed } = updates;
    await logAdminAction(
      { id: auth.profile?.id, email: auth.profile?.email },
      {
        action: 'account.update',
        targetType: 'account',
        targetId: userId,
        targetLabel: before.email || before.full_name || userId,
        details: { fields: Object.keys(changed) },
        reason,
      }
    );

    return NextResponse.json({ profile: updated });
  } catch (error) {
    console.error('Error in PATCH /api/admin/accounts/[userId]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

