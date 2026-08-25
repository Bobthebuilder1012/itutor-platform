/**
 * The nine emails Supabase Auth sends, in the iTutor design system.
 *
 * These are not sent by our code — Supabase sends them, from HTML pasted into
 * the dashboard under Authentication → Emails. That is why they live here as
 * definitions and are written out to `email-templates/*.html`: the file is what
 * gets pasted, and generating it from the same renderer as everything else is
 * what stops the mail a new user sees FIRST from being the only mail still on
 * the old design.
 *
 * `{{ .ConfirmationURL }}` is Supabase's placeholder, substituted at send time.
 * It passes through the renderer untouched — see `safeHref` in render.ts, which
 * exists for exactly this.
 *
 * The copy is the copy these templates already carried, with the headings
 * rewritten from Title Case to sentences. Changing what they say is a separate
 * decision from changing how they look, and this commit only claims the second.
 *
 * TO DEPLOY A CHANGE: edit here, run `node scripts/render-email-templates.js`,
 * then paste the regenerated file into the Supabase dashboard for each
 * environment. Nothing picks these up automatically.
 */

import type { RenderEmailInput } from './render';
import { brandAssets } from './theme';

const CONFIRMATION_URL = '{{ .ConfirmationURL }}';

/** A Supabase template: the subject to set in the dashboard, and the body. */
export type SupabaseTemplate = {
  /** Output filename under email-templates/, without the extension. */
  slug: string;
  /** Set this as the template's subject in the Supabase dashboard. */
  subject: string;
  /** Which dashboard template this is, for the operator pasting it. */
  dashboardName: string;
  email: RenderEmailInput;
};

const SUPPORT = `Need help? Contact us at ${brandAssets.supportEmail}.`;
const NOT_YOU =
  `If you did not make this change, contact us immediately at ${brandAssets.supportEmail}.`;

export const supabaseTemplates: SupabaseTemplate[] = [
  {
    slug: 'confirm-signup',
    subject: 'Confirm your iTutor account',
    dashboardName: 'Confirm signup',
    email: {
      family: 'authentication-action',
      subject: 'Confirm your iTutor account',
      heading: 'Confirm your iTutor account',
      intro: "You're one quick step away from getting started.",
      blocks: [
        {
          kind: 'paragraph',
          text: 'Confirm your email address to activate your account and access iTutor.',
          align: 'center',
        },
        {
          kind: 'notice',
          title: 'Secure, one-time link',
          body: 'This confirmation link expires in 24 hours and can only be used once.',
        },
      ],
      cta: { label: 'Confirm my email', href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: `If you did not create an iTutor account, you can safely ignore this email. ${SUPPORT}`,
    },
  },

  {
    slug: 'reset-password',
    subject: 'Reset your iTutor password',
    dashboardName: 'Reset password',
    email: {
      family: 'authentication-action',
      subject: 'Reset your iTutor password',
      heading: 'Reset your password',
      intro: 'You asked to reset the password on your iTutor account.',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Choose a new password using the button below. Your current password stays active until you do.',
          align: 'center',
        },
        {
          kind: 'notice',
          title: 'Secure, one-time link',
          body: 'This reset link expires in 24 hours and can only be used once.',
        },
      ],
      cta: { label: 'Reset my password', href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: `If you did not ask for a password reset, you can safely ignore this email — nothing has changed. ${SUPPORT}`,
    },
  },

  {
    slug: 'magic-link',
    subject: 'Sign in to your iTutor account',
    dashboardName: 'Magic Link',
    email: {
      family: 'authentication-action',
      subject: 'Sign in to your iTutor account',
      heading: 'Your sign-in link',
      intro: 'Use this link to sign in — no password needed.',
      blocks: [
        {
          kind: 'notice',
          title: 'Secure, one-time link',
          body: 'This link signs in whoever opens it, so do not forward it. It expires in one hour.',
        },
      ],
      eyebrow: 'Sign in',
      cta: { label: 'Sign in to iTutor', href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: `If you did not request this link, you can safely ignore this email. ${SUPPORT}`,
    },
  },

  {
    slug: 'change-email',
    subject: 'Confirm your new email address',
    dashboardName: 'Change Email Address',
    email: {
      family: 'authentication-action',
      subject: 'Confirm your new email address',
      heading: 'Confirm your new email',
      intro: 'You asked to change the email address on your iTutor account.',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Confirm the new address to complete the change. Until you do, your account keeps the old one.',
          align: 'center',
        },
      ],
      cta: { label: 'Confirm email change', href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: `If you did not ask to change your email, do not use this link. ${SUPPORT}`,
    },
  },

  {
    slug: 'reauthentication',
    subject: 'Verify your identity',
    dashboardName: 'Reauthentication',
    email: {
      family: 'authentication-action',
      subject: 'Verify your identity',
      heading: "Verify it's you",
      intro: 'One check before we make this change to your account.',
      blocks: [
        {
          kind: 'paragraph',
          text: 'Some actions need confirming from your email as well as your password. Use the button below to continue.',
          align: 'center',
        },
      ],
      eyebrow: 'Security check',
      cta: { label: "Verify it's me", href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: `If you were not trying to change anything, do not use this link — and tell us. ${SUPPORT}`,
    },
  },

  {
    slug: 'invite-user',
    subject: "You're invited to join iTutor",
    dashboardName: 'Invite user',
    email: {
      family: 'invitation',
      subject: "You're invited to join iTutor",
      heading: "You're invited to iTutor",
      intro: 'Someone has invited you to join iTutor.',
      blocks: [
        {
          kind: 'paragraph',
          text: 'iTutor connects students with qualified, verified tutors across Trinidad & Tobago and the wider Caribbean.',
          align: 'center',
        },
        {
          kind: 'paragraph',
          text: 'Accept the invitation to create your account and get started.',
          align: 'center',
        },
      ],
      cta: { label: 'Accept invitation', href: CONFIRMATION_URL },
      showCtaUrl: true,
      closing: 'Not expecting this invitation? You can safely ignore it.',
    },
  },

  {
    slug: 'notify-password-changed',
    subject: 'Your password has been changed',
    dashboardName: 'Notification — password changed',
    email: {
      family: 'security-alert',
      subject: 'Your password has been changed',
      heading: 'Your password was changed',
      intro: "We're letting you know about an important change to your account.",
      blocks: [
        {
          kind: 'details',
          rows: [{ label: 'Change', value: 'Password updated' }],
        },
        {
          kind: 'paragraph',
          text: `Your iTutor password was changed successfully, and you will use the new one from now on. If you made this change, there is nothing else to do.\n\n${NOT_YOU}`,
        },
      ],
      cta: { label: 'Review my account', href: `${brandAssets.site}/login` },
      closing: SUPPORT,
    },
  },

  {
    slug: 'notify-email-changed',
    subject: 'Your email address has been updated',
    dashboardName: 'Notification — email changed',
    email: {
      family: 'security-alert',
      subject: 'Your email address has been updated',
      heading: 'Your email address was updated',
      intro: "We're letting you know about an important change to your account.",
      blocks: [
        {
          kind: 'details',
          rows: [{ label: 'Change', value: 'Email address updated' }],
        },
        {
          kind: 'paragraph',
          text: `You will sign in with the new address from now on, and every account email and notification goes there. If you made this change, there is nothing else to do.\n\n${NOT_YOU}`,
        },
      ],
      cta: { label: 'Review my account', href: `${brandAssets.site}/login` },
      closing: SUPPORT,
    },
  },

  {
    slug: 'notify-phone-changed',
    subject: 'Your phone number has been updated',
    dashboardName: 'Notification — phone changed',
    email: {
      family: 'security-alert',
      subject: 'Your phone number has been updated',
      heading: 'Your phone number was updated',
      intro: "We're letting you know about an important change to your account.",
      blocks: [
        {
          kind: 'details',
          rows: [{ label: 'Change', value: 'Phone number updated' }],
        },
        {
          kind: 'paragraph',
          text: `The new number will be used for account recovery and important notifications. If you made this change, there is nothing else to do.\n\n${NOT_YOU}`,
        },
      ],
      cta: { label: 'Review my account', href: `${brandAssets.site}/login` },
      closing: SUPPORT,
    },
  },
];

export const supabaseTemplateBySlug = new Map(supabaseTemplates.map((t) => [t.slug, t]));
