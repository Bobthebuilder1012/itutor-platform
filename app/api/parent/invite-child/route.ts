// Parent → student CONSENT invite. Replaces the instant link/create paths.
// Validates that a student account with the given email already exists, then
// creates a pending invite the student must actively accept. No account is
// created here, and no link is made until the student consents.

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { ParentAccessError, requireParentContext } from '@/lib/server/parentAccess';
import { sendEmail } from '@/lib/services/emailService';
import { parentInviteEmailHtml } from '@/lib/services/parentInviteEmail';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { admin, parentProfile } = await requireParentContext();
    const body = (await request.json().catch(() => ({}))) as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email) return NextResponse.json({ error: 'Enter your child’s email address.' }, { status: 400 });

    // 1) A student account must already exist for this email.
    const { data: child } = await admin
      .from('profiles')
      .select('id, role, full_name, display_name, email')
      .eq('email', email)
      .maybeSingle();
    if (!child || child.role !== 'student') {
      return NextResponse.json(
        { error: 'We couldn’t find a student account with that email. Ask them to create one first, then try again.' },
        { status: 404 }
      );
    }
    if (child.id === parentProfile.id) {
      return NextResponse.json({ error: 'You can’t invite your own account.' }, { status: 400 });
    }

    // 2) Not already linked (to this parent or another).
    const { data: links } = await admin.from('parent_child_links').select('parent_id').eq('child_id', child.id);
    if ((links ?? []).some((l) => l.parent_id === parentProfile.id)) {
      return NextResponse.json({ error: 'This child is already linked to your account.' }, { status: 409 });
    }
    if ((links ?? []).length > 0) {
      return NextResponse.json({ error: 'This student is already linked to another parent account.' }, { status: 409 });
    }

    // 3) One outstanding invite per pair — offer resend instead of duplicating.
    const { data: pending } = await admin
      .from('parent_child_invites')
      .select('id')
      .eq('parent_id', parentProfile.id)
      .eq('child_id', child.id)
      .eq('status', 'pending')
      .maybeSingle();
    if (pending) {
      return NextResponse.json(
        { error: 'You already have a pending invite to this student.', code: 'pending_exists', inviteId: pending.id },
        { status: 409 }
      );
    }

    // 4) Create the invite.
    const token = randomBytes(32).toString('base64url');
    const { data: invite, error: insErr } = await admin
      .from('parent_child_invites')
      .insert({ parent_id: parentProfile.id, child_id: child.id, child_email: email, token })
      .select('id, token, child_email, status, expires_at, created_at')
      .single();
    if (insErr || !invite) return NextResponse.json({ error: insErr?.message ?? 'Could not create invite.' }, { status: 500 });

    await deliverInvite(admin, {
      origin: new URL(request.url).origin,
      token,
      childId: child.id,
      parentName: parentProfile.full_name || 'A parent/guardian',
    });

    return NextResponse.json({ success: true, invite });
  } catch (error) {
    if (error instanceof ParentAccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Shared by create + resend: send the email AND drop an in-app notification to
// the student, so consent works even when email delivery is off.
export async function deliverInvite(
  admin: ReturnType<typeof import('@/lib/supabase/server').getServiceClient>,
  opts: { origin: string; token: string; childId: string; parentName: string }
) {
  const acceptUrl = `${opts.origin}/invites/accept?token=${encodeURIComponent(opts.token)}`;
  const relLink = `/invites/accept?token=${encodeURIComponent(opts.token)}`;

  const { data: childProfile } = await admin.from('profiles').select('email').eq('id', opts.childId).maybeSingle();
  if (childProfile?.email) {
    await sendEmail({
      to: childProfile.email,
      subject: `${opts.parentName} wants to connect as your parent/guardian on iTutor`,
      html: parentInviteEmailHtml({ parentName: opts.parentName, acceptUrl }),
    }).catch(() => {});
  }

  await admin.from('notifications').insert({
    user_id: opts.childId,
    type: 'parent_invite',
    title: 'Parent/guardian connection request',
    message: `${opts.parentName} wants to connect as your parent or guardian. Review and respond.`,
    link: relLink,
    metadata: { token: opts.token },
  }).then(undefined, () => {});
}
