import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const service = getServiceClient();

    const { data: parent } = await service.from('profiles').select('role').eq('id', user.id).single();
    if ((parent as any)?.role !== 'parent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { childName, childEmail, childPassword } = await req.json();
    if (!childName?.trim() || !childEmail?.trim() || !childPassword?.trim()) {
      return NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 });
    }
    if (childPassword.trim().length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const email = childEmail.trim().toLowerCase();

    if (email === (await service.from('profiles').select('email').eq('id', user.id).single()).data?.email) {
      return NextResponse.json({ error: 'You cannot use your own email for a child account.' }, { status: 400 });
    }

    // Check if email is already in use
    const { data: existing } = await service.from('profiles').select('id, role').eq('email', email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    // Create the student auth account directly with a password — no email sent
    const { data: newUser, error: createError } = await service.auth.admin.createUser({
      email,
      password: childPassword.trim(),
      email_confirm: true, // mark as confirmed so they can log in immediately
      user_metadata: { full_name: childName.trim(), role: 'student' },
    });

    if (createError) {
      console.error('[create-child] createUser error:', createError.message);
      if (createError.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
      }
      throw createError;
    }

    const childId = newUser.user?.id;
    if (!childId) throw new Error('Failed to create account');

    // Create the student profile
    const { error: profileError } = await service.from('profiles').insert({
      id: childId,
      full_name: childName.trim(),
      email,
      role: 'student',
    });

    if (profileError && !profileError.message.includes('duplicate')) {
      console.error('[create-child] profile error:', profileError.message);
      // Non-fatal — profile may have been created by a trigger
    }

    // Link parent → child
    const { error: linkError } = await service.from('parent_child_links').insert({
      parent_id: user.id,
      child_id: childId,
    });

    if (linkError && !linkError.message.includes('duplicate')) {
      console.error('[create-child] link error:', linkError.message);
      throw new Error('Account created but could not link to your profile: ' + linkError.message);
    }

    return NextResponse.json({ success: true, childId, childName: childName.trim() });
  } catch (err: any) {
    console.error('[POST /api/parent/create-child]', err?.message ?? err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create account' }, { status: 500 });
  }
}
