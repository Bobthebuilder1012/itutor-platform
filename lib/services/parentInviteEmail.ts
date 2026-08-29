/**
 * The parent → child connection invite.
 *
 * Family 12, `invitation`. It used to be a hand-built HTML string with its own
 * green, its own radius and a one-line "© iTutor" footer — written that way
 * because @react-email/render was not installed, which was true and is beside
 * the point now that lib/email/design renders plain strings.
 *
 * The copy is unchanged, including the two things that matter most about this
 * particular email: it says exactly what accepting shares, and it says that
 * declining is fine and shares nothing. A child is being asked to hand a parent
 * visibility over their account, and consent that is not informed is not
 * consent.
 */

import { renderEmail, type RenderedEmail } from '@/lib/email/design';

export function parentInviteEmail(opts: {
  parentName: string;
  acceptUrl: string;
}): RenderedEmail {
  const name = opts.parentName || 'A parent/guardian';

  return renderEmail({
    family: 'invitation',
    subject: `${name} wants to connect as your parent/guardian on iTutor`,
    preheader: 'Review the request and decide. Declining shares nothing.',
    heading: `${name} wants to connect`,
    intro: 'They have asked to be linked to your iTutor account as your parent or guardian.',
    eyebrow: 'Parent invite',
    blocks: [
      { kind: 'person', name },
      {
        kind: 'notice',
        title: 'What accepting shares',
        body: 'Your classes, your bookings and your billing. Nothing else — not your messages, and not your marks.',
      },
      {
        kind: 'paragraph',
        text: 'Declining is completely fine and shares nothing at all. This request expires in 7 days.',
      },
    ],
    cta: { label: 'Review and respond', href: opts.acceptUrl },
    closing:
      "You'll be asked to sign in to your student account first. If you didn't expect this, you can ignore this email.",
  });
}

/**
 * Kept for callers that only want the markup.
 *
 * @deprecated Use `parentInviteEmail`, which returns the subject and the
 * plain-text alternative as well — a text part is worth having on every send.
 */
export function parentInviteEmailHtml(opts: { parentName: string; acceptUrl: string }): string {
  return parentInviteEmail(opts).html;
}
