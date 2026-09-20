/**
 * The teacher → student (or parent) class invitation.
 *
 * Family 12, `invitation`, the same family as the parent-link invite.
 *
 * TWO VOICES, ONE TEMPLATE. A teacher inviting a student is speaking to the
 * person who will be in the room; a teacher inviting a parent is speaking to
 * someone who will never attend and whose decision is about their child. The
 * parent copy therefore says what happens next in full — they add their child,
 * then approve — because a parent who accepts and then finds nothing has
 * happened is the commonest way this flow quietly dies.
 *
 * It does not invent a price. A class with no price loaded says nothing about
 * cost rather than implying free, which is the same trap the student share
 * sheet had to fix.
 */

import { renderEmail, type RenderedEmail } from '@/lib/email/design';

export function classInviteEmail(opts: {
  tutorName: string;
  className: string | null;
  inviteeName: string | null;
  inviteeKind: 'student' | 'parent' | 'unknown';
  acceptUrl: string;
  scheduleLabel?: string | null;
  note?: string | null;
}): RenderedEmail {
  const tutor = opts.tutorName || 'A teacher';
  const forParent = opts.inviteeKind === 'parent';
  const klass = opts.className?.trim() || null;

  const subject = klass
    ? forParent
      ? `${tutor} invited your child to ${klass} on iTutor`
      : `${tutor} invited you to ${klass} on iTutor`
    : `${tutor} invited you to learn on iTutor`;

  const heading = klass
    ? forParent
      ? `${tutor} invited your child to ${klass}`
      : `${tutor} invited you to ${klass}`
    : `${tutor} invited you to iTutor`;

  const intro = forParent
    ? `${tutor} teaches ${klass ?? 'on iTutor'} and would like your child in the class. You'll set up their place from your own account.`
    : klass
      ? `${tutor} teaches ${klass} on iTutor and would like you in the room.`
      : `${tutor} teaches on iTutor and would like you to join them.`;

  const blocks: Parameters<typeof renderEmail>[0]['blocks'] = [
    { kind: 'person', name: tutor },
  ];

  if (opts.note?.trim()) {
    blocks.push({ kind: 'paragraph', text: `“${opts.note.trim()}”` });
  }

  if (opts.scheduleLabel) {
    blocks.push({
      kind: 'notice',
      title: 'When it meets',
      body: `Next session: ${opts.scheduleLabel}.`,
    });
  }

  if (forParent) {
    blocks.push({
      kind: 'steps',
      steps: [
        {
          title: 'Create your account',
          body: 'Sign up as a parent, or sign in to the account you already have.',
        },
        {
          title: 'Add your child',
          body: 'Link their iTutor account to yours. They confirm it from their side.',
        },
        {
          title: 'Approve the class',
          body: 'Give the go-ahead and their place in the class is set.',
        },
      ],
    });
  }

  blocks.push({
    kind: 'paragraph',
    text: 'This invitation expires in 30 days. If you were not expecting it, you can ignore this email and nothing happens.',
  });

  return renderEmail({
    family: 'invitation',
    subject,
    preheader: forParent
      ? 'Add your child and approve the class.'
      : 'Accept the invitation and join the class.',
    heading,
    intro,
    eyebrow: 'Class invite',
    blocks,
    cta: {
      label: forParent ? 'Set up their place' : 'Join the class',
      href: opts.acceptUrl,
    },
    closing: opts.inviteeName
      ? `Sent to ${opts.inviteeName} by ${tutor} through iTutor.`
      : `Sent by ${tutor} through iTutor.`,
  });
}
