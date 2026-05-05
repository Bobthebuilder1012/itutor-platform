import { NextRequest, NextResponse } from 'next/server';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { getServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type Body = {
  email?: string;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;
    const email = body.email?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const { parentProfile } = await requireParentContext();
    const admin = getServiceClient();

    const { data: child, error: childError } = await admin
      .from('profiles')
      .select(
        'id, role, full_name, display_name, email, school, form_level, institution_id, billing_mode'
      )
      .eq('email', email)
      .maybeSingle();

    if (childError) {
      return NextResponse.json({ error: 'Failed to look up child account' }, { status: 500 });
    }

    if (!child) {
      return NextResponse.json({ error: 'No student account found with that email' }, { status: 404 });
    }

    if (child.role !== 'student') {
      return NextResponse.json(
        { error: 'Only student accounts can be linked to a parent' },
        { status: 400 }
      );
    }

    const { data: existingLink, error: existingLinkError } = await admin
      .from('parent_child_links')
      .select('parent_id')
      .eq('child_id', child.id);

    if (existingLinkError) {
      return NextResponse.json({ error: 'Failed to verify existing links' }, { status: 500 });
    }

    const alreadyLinkedToParent = (existingLink ?? []).some(
      (link) => link.parent_id === parentProfile.id
    );

    if (alreadyLinkedToParent) {
      return NextResponse.json({ error: 'This child is already linked to your account' }, { status: 409 });
    }

    const linkedToAnotherParent = (existingLink ?? []).some(
      (link) => link.parent_id !== parentProfile.id
    );

    if (linkedToAnotherParent) {
      return NextResponse.json(
        { error: 'This student account is already linked to another parent' },
        { status: 409 }
      );
    }

    const { error: updateProfileError } = await admin
      .from('profiles')
      .update({ billing_mode: 'parent_required', updated_at: new Date().toISOString() })
      .eq('id', child.id);

    if (updateProfileError) {
      return NextResponse.json({ error: 'Failed to update child billing settings' }, { status: 500 });
    }

    const { error: linkError } = await admin.from('parent_child_links').insert({
      parent_id: parentProfile.id,
      child_id: child.id,
    });

    if (linkError) {
      return NextResponse.json({ error: linkError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      child: {
        id: child.id,
        fullName: child.full_name,
        displayName: child.display_name,
        email: child.email,
        school: child.school,
        formLevel: child.form_level,
      },
    });
  } catch (error) {
    if (error instanceof ParentAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: 'Failed to link child' }, { status: 500 });
  }
}
