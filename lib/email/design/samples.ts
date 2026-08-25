/**
 * One worked example per family.
 *
 * These are what /api/email-gallery renders, and they are the reference for
 * which family a new message belongs to: if the email you are about to write
 * looks like one of these with different words, use that family rather than
 * inventing a shape.
 *
 * The copy is deliberately the copy from the approved gallery, down to the
 * example names and amounts, so a reviewer can hold the two side by side.
 */

import type { EmailFamily } from './theme';
import type { RenderEmailInput } from './render';

const SITE = 'https://myitutor.com';

export const familySamples: Record<EmailFamily, RenderEmailInput> = {
  'authentication-action': {
    family: 'authentication-action',
    subject: 'Confirm your iTutor account',
    heading: 'Confirm your iTutor account',
    intro: "Hi Liam, you're one quick step away from getting started.",
    blocks: [
      {
        kind: 'paragraph',
        text: 'Confirm your email address to activate your account and access iTutor.',
        align: 'center',
      },
      {
        kind: 'notice',
        title: 'Secure, one-time link',
        body: 'This confirmation link expires in 24 hours.',
      },
    ],
    cta: { label: 'Confirm my email', href: `${SITE}/confirm/example` },
    showCtaUrl: true,
    closing:
      'If you did not create an iTutor account, you can safely ignore this email. Need help? Contact iTutor Support.',
  },

  'verification-code': {
    family: 'verification-code',
    subject: 'Your iTutor verification code',
    heading: 'Your verification code',
    intro: "Enter this code in iTutor to verify it's you.",
    blocks: [
      { kind: 'code', code: '482 916', note: 'This code expires in 10 minutes and can only be used once.' },
      { kind: 'divider' },
      {
        kind: 'fineprint',
        text:
          'Never share this code with anyone. iTutor Support will never ask you for it.\nIf you did not request this code, you can safely ignore this email.',
      },
    ],
  },

  'security-alert': {
    family: 'security-alert',
    subject: 'Your iTutor password was changed',
    heading: 'Your password was changed',
    intro: "We're letting you know about an important change to your account.",
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Change', value: 'Password updated' },
          { label: 'Date', value: '11 August 2026, 1:42 PM' },
          { label: 'Device', value: 'Chrome on Windows' },
          { label: 'Location', value: 'Trinidad & Tobago' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'If you made this change, no further action is needed. If you did not, secure your account immediately.',
      },
    ],
    cta: { label: 'Secure my account', href: `${SITE}/settings/security` },
    closing: 'Need urgent help? Contact iTutor Support.',
  },

  'verification-outcome': {
    family: 'verification-outcome',
    subject: "You're now a verified iTutor",
    heading: "You're now a verified iTutor",
    intro: 'Congratulations — your credentials have been approved.',
    blocks: [
      {
        kind: 'notice',
        title: 'Verification complete',
        body: 'Your verified badge will now appear on your public tutor profile.',
      },
      {
        kind: 'paragraph',
        text:
          'Students and parents can now clearly see that your identity and credentials have been reviewed by iTutor.',
      },
    ],
    cta: { label: 'View my tutor profile', href: `${SITE}/tutor/profile` },
    closing: 'Questions about this decision? Contact Support.',
  },

  'booking-confirmation': {
    family: 'booking-confirmation',
    subject: "You're booked for CSEC Mathematics",
    heading: "You're booked for Mathematics",
    intro: 'Everything is confirmed. Here are your session details.',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Tutor', value: 'Ms. Tricia Singh' },
          { label: 'Date', value: 'Wednesday, 19 August 2026' },
          { label: 'Time', value: '6:00 PM – 7:30 PM AST' },
          { label: 'Duration', value: '90 minutes' },
          { label: 'Location', value: 'Online · Google Meet' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'We will send you a reminder before the session begins. You can manage or reschedule this booking from your dashboard.',
      },
    ],
    cta: { label: 'View my booking', href: `${SITE}/student/sessions` },
  },

  'session-reminder': {
    family: 'session-reminder',
    subject: 'Your session starts in 1 hour',
    heading: 'Your session starts in 1 hour',
    intro: 'Get ready for Mathematics with Ms. Singh.',
    badge: '1h',
    blocks: [
      {
        kind: 'card',
        title: 'CSEC Mathematics',
        lines: ['Today · 6:00 PM AST · 90 minutes', 'With Ms. Tricia Singh'],
      },
    ],
    cta: { label: 'Join session', href: `${SITE}/student/sessions` },
    secondary: { label: 'Cancel or reschedule', href: `${SITE}/student/sessions` },
  },

  'payment-receipt': {
    family: 'payment-receipt',
    subject: 'Your iTutor receipt',
    heading: 'Thanks for your payment',
    intro: 'Your payment was successful. Keep this email for your records.',
    blocks: [
      {
        kind: 'details',
        title: 'CSEC Mathematics with Ms. Singh',
        tone: 'neutral',
        rows: [
          { label: 'Lesson price', value: 'TT$200.00' },
          { label: 'Processing fee', value: 'TT$7.00' },
          { label: 'Total paid', value: 'TT$207.00', strong: true },
          { label: 'Receipt', value: '#IT-260811-4821 · 11 August 2026' },
        ],
      },
    ],
    cta: { label: 'View receipt', href: `${SITE}/student/payments` },
  },

  'payment-problem': {
    family: 'payment-problem',
    subject: "We couldn't process your payment",
    heading: "We couldn't process your payment",
    intro: 'Your access may be interrupted unless the payment is updated.',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Class', value: 'CSEC Mathematics' },
          { label: 'Amount due', value: 'TT$200.00', strong: true },
          { label: 'Payment method', value: 'Visa ending in 4242' },
          { label: 'Next attempt', value: '13 August 2026' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Update your payment method now to avoid losing access to your class. You will not be charged twice.',
      },
    ],
    cta: { label: 'Update payment method', href: `${SITE}/student/payments` },
    closing: 'Need help? Contact Support.',
  },

  'refund-cancellation': {
    family: 'refund-cancellation',
    subject: 'Your session has been cancelled',
    heading: 'Your session has been cancelled',
    intro: "The booking is no longer active. Here's what happens next.",
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Session', value: 'CSEC Mathematics' },
          { label: 'Original date', value: '19 August 2026 at 6:00 PM' },
          { label: 'Refund', value: 'TT$207.00 issued', strong: true },
          { label: 'Return time', value: '5–10 business days' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Your refund has been sent to the original payment method. Your bank may take additional time to display it.',
      },
    ],
    cta: { label: 'Find another session', href: `${SITE}/student/find-tutors` },
  },

  'schedule-change': {
    family: 'schedule-change',
    subject: 'Your session has a new time',
    heading: 'Your session has a new time',
    intro: 'The tutor changed the schedule. Please review the updated details.',
    blocks: [
      {
        kind: 'compare',
        beforeLabel: 'Previous time',
        before: 'Wednesday, 19 August · 6:00 PM',
        afterLabel: 'New time',
        after: 'Thursday, 20 August · 6:30 PM AST',
      },
      {
        kind: 'paragraph',
        text:
          'Your meeting link remains the same. If the new time does not work, you can contact the tutor or manage the booking.',
      },
    ],
    cta: { label: 'View updated booking', href: `${SITE}/student/sessions` },
  },

  'welcome-onboarding': {
    family: 'welcome-onboarding',
    subject: 'Welcome to iTutor',
    heading: "Let's get you started",
    intro: 'Your account is ready. Complete these steps to get the most from iTutor.',
    blocks: [
      {
        kind: 'steps',
        steps: [
          { title: 'Complete your profile', body: "Tell us what you're studying and your goals." },
          { title: 'Find the right iTutor', body: 'Compare subjects, schedules and verified teachers.' },
          { title: 'Join your first class', body: 'Book securely and manage everything in one place.' },
        ],
      },
    ],
    cta: { label: 'Find my iTutor', href: `${SITE}/student/find-tutors` },
  },

  'invitation': {
    family: 'invitation',
    subject: 'Jovan invited you to connect on iTutor',
    heading: 'Join Jovan on iTutor',
    intro: 'Jovan Goodluck invited you to connect through iTutor.',
    blocks: [
      { kind: 'person', name: 'Jovan Goodluck', caption: 'invited you to join the iTutor team' },
      {
        kind: 'paragraph',
        text:
          'Sign in or create an account to review and accept the invitation. The invitation expires in 7 days.',
        align: 'center',
      },
    ],
    cta: { label: 'Review invitation', href: `${SITE}/invite/example` },
    closing: 'Not expecting this invitation? You can safely ignore it.',
  },

  'service-announcement': {
    family: 'service-announcement',
    subject: 'Payouts are running late this week',
    heading: 'Payouts are running late',
    intro: 'We are sorry — your payout is delayed, and here is where it stands.',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Affected', value: 'Tutor payouts for 4–10 August' },
          { label: 'Expected', value: 'By 14 August 2026' },
          { label: 'Status', value: 'Being processed', strong: true },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Nothing is lost and no action is needed from you. We will email again the moment the payouts land, and the amounts are unchanged.',
      },
    ],
    cta: { label: 'View my earnings', href: `${SITE}/tutor/analytics` },
    closing: 'Questions in the meantime? Contact iTutor Support.',
  },

  'marketing-campaign': {
    family: 'marketing-campaign',
    subject: 'Class Match Week starts Monday',
    heading: 'Meet a teacher, free',
    intro: 'For one week, book a free 30-minute taster with any teacher on iTutor.',
    blocks: [
      {
        kind: 'paragraph',
        text:
          'You see how they teach before you commit to anything, and every taster you attend unlocks a discount on that class.',
      },
      {
        kind: 'details',
        title: 'Class Match Week',
        tone: 'neutral',
        rows: [
          { label: 'When', value: '24–30 August 2026' },
          { label: 'Cost', value: 'Free', strong: true },
          { label: 'Length', value: '30 minutes per taster' },
        ],
      },
    ],
    cta: { label: 'Find my match', href: `${SITE}/class-match-week` },
    unsubscribeUrl: `${SITE}/settings/notifications`,
    footerNote: 'You are receiving this because you have an iTutor account.',
  },
};
