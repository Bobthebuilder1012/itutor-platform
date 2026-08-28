import { getServiceClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/services/emailService';
import { parentInviteEmail } from '@/lib/services/parentInviteEmail';

type ServiceClient = ReturnType<typeof getServiceClient>;

// Shared by the invite-create + resend routes: emails the invited student AND
// drops an in-app notification, so consent works even when email delivery is off.
export async function deliverInvite(
  admin: ServiceClient,
  opts: { origin: string; token: string; childId: string; parentName: string }
) {
  const acceptUrl = `${opts.origin}/invites/accept?token=${encodeURIComponent(opts.token)}`;
  const relLink = `/invites/accept?token=${encodeURIComponent(opts.token)}`;

  const { data: childProfile } = await admin.from('profiles').select('email').eq('id', opts.childId).maybeSingle();
  if (childProfile?.email) {
    // Subject, HTML and text all come from the one description, so the subject
    // cannot drift from what the body says.
    const email = parentInviteEmail({ parentName: opts.parentName, acceptUrl });
    await sendEmail({
      to: childProfile.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
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
