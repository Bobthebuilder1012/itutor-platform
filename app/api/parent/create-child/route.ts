import { NextRequest, NextResponse } from 'next/server';
import { getServerClient, getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Verify caller is a parent
    const service = getServiceClient();
    const { data: parent } = await service.from('profiles').select('role, full_name').eq('id', user.id).single();
    if ((parent as any)?.role !== 'parent') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { childName, childEmail, yearLevel } = await req.json();
    if (!childName?.trim() || !childEmail?.trim()) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // Create the student auth account
    const { data: newUser, error: createError } = await service.auth.admin.createUser({
      email: childEmail.trim().toLowerCase(),
      email_confirm: true,
      user_metadata: { full_name: childName.trim(), role: 'student' },
    });

    if (createError) {
      if (createError.message.includes('already registered') || createError.message.includes('already been registered')) {
        return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
      }
      throw createError;
    }

    const childId = newUser.user?.id;
    if (!childId) throw new Error('Failed to create user');

    // Create the student profile
    await service.from('profiles').upsert({
      id: childId,
      full_name: childName.trim(),
      email: childEmail.trim().toLowerCase(),
      role: 'student',
      billing_mode: 'parent_required',
    });

    // Link parent → child
    const { error: linkError } = await service.from('parent_child_links').insert({
      parent_id: user.id,
      child_id: childId,
    });
    if (linkError && !linkError.message.includes('duplicate')) throw linkError;

    // Send magic link so child can set their password
    await service.auth.admin.generateLink({
      type: 'magiclink',
      email: childEmail.trim().toLowerCase(),
    });

    return NextResponse.json({ success: true, childId, childName: childName.trim() });
  } catch (err: any) {
    console.error('[POST /api/parent/create-child]', err);
    return NextResponse.json({ error: err?.message ?? 'Failed to create account' }, { status: 500 });
  }
}
