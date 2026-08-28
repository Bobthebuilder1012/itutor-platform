/**
 * The student and parent onboarding sequence.
 *
 * Six emails: welcome on signup, then day 1, 3, 5 and 7 for anyone who has not
 * booked yet, plus the long-weekend promotion. Sent by
 * /api/cron/send-onboarding-emails.
 *
 * These were six hand-written HTML documents sharing a `baseStyles` block, one
 * per email, each repeating the header, the footer, the button and its own
 * emoji-list markup — around 415 lines to say what is now said in a list of
 * blocks. The footer named "Nora Digital, Ltd.", which is not the operating
 * company any more.
 *
 * The copy is unchanged. Restyling and rewriting are separate decisions and this
 * only makes the first: every sentence, price band and emoji here is the
 * sentence, price band and emoji that was going out.
 */

import { renderEmail } from '@/lib/email/design';
import { brandAssets } from '@/lib/email/design/theme';
import type { EmailTemplateProps, EmailTemplate } from './types';

const CONTACT = brandAssets.contactEmail;

export function welcomeEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `Welcome to iTutor, ${firstName}! 🎓`,
    heading: `Welcome to iTutor, ${firstName}!`,
    intro: 'Your account is ready.',
    blocks: [
      {
        kind: 'paragraph',
        text:
          "We're excited to have you join our Caribbean community of students and itutors. iTutor connects you with experienced itutors across Trinidad & Tobago and the wider Caribbean region.\n\nWhether you need help with CXC, CAPE, or university-level subjects, we've got top itutors ready to help you succeed.\n\nReady to start your learning journey?",
      },
    ],
    cta: { label: 'Find Your iTutor', href: ctaUrl },
    closing: `If you have any questions, contact us at ${CONTACT}. We're here to help!`,
  });
}

export function day1Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `${firstName}, ready for your first session?`,
    heading: 'Ready for your first session?',
    intro: `Hi ${firstName},`,
    eyebrow: 'Getting started',
    blocks: [
      {
        kind: 'paragraph',
        text:
          "You're just one step away from getting the help you need. Our itutors are ready and waiting to work with you.",
      },
      {
        kind: 'steps',
        steps: [
          { title: 'Browse itutors by subject', body: 'Filter by the subject you need help with.' },
          { title: 'Check their ratings and availability', body: 'See what other students thought.' },
          { title: 'Book a session that works for your schedule', body: 'Pick a time that suits you.' },
          { title: 'Meet online via Google Meet or Zoom', body: 'No travel needed.' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          "Most students book their first session within 24 hours. Don't wait — your grades will thank you!",
      },
    ],
    cta: { label: 'Book Your First Session', href: ctaUrl },
  });
}

export function day3Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `How iTutor works - Quick guide for ${firstName}`,
    heading: 'How iTutor works',
    intro: `Hi ${firstName},`,
    eyebrow: 'Quick guide',
    blocks: [
      { kind: 'paragraph', text: 'Let me break down how iTutor makes getting help super easy:' },
      {
        kind: 'steps',
        steps: [
          {
            title: '📚 Find your tutor',
            body:
              'Search by subject (Maths, English, Chemistry, etc.) and filter by form level. See ratings, prices and availability at a glance.',
          },
          {
            title: '📅 Book when it suits you',
            body:
              'Pick a time that works with your schedule. Sessions are typically 1–2 hours, and you can book multiple sessions in advance.',
          },
          {
            title: '💻 Meet online',
            body:
              'All sessions happen via Google Meet or Zoom. No travel needed — learn from the comfort of home!',
          },
          {
            title: '💳 Safe and secure payment',
            body:
              'Pay securely through our platform. Your money is protected, and itutors get paid after successful sessions.',
          },
        ],
      },
    ],
    cta: { label: 'Explore iTutors', href: ctaUrl },
  });
}

export function day5Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `Top itutors available now, ${firstName}`,
    heading: 'Top iTutors available now',
    intro: `Hi ${firstName},`,
    eyebrow: 'Available now',
    blocks: [
      {
        kind: 'paragraph',
        text:
          "We have amazing itutors with proven track records ready to help you excel. Here's what makes our itutors special:",
      },
      {
        kind: 'details',
        tone: 'neutral',
        rows: [
          { label: '✅ Verified credentials', value: 'All itutors are vetted' },
          { label: '⭐ Student reviews', value: 'Real ratings from students like you' },
          { label: '🎓 Subject experts', value: 'CXC, CAPE and Caribbean curriculum' },
          { label: '💬 Fast response', value: 'Most reply within hours' },
          { label: '💰 Fair prices', value: '$50–$200/hour by level' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          "Whether you need help with Maths, Sciences, Languages, or exam prep, we've got you covered.",
      },
      {
        kind: 'notice',
        title: 'Pro tip',
        body:
          'iTutors with 4.5+ ratings and "Professional Teacher" badges are in high demand. Book early to secure your spot!',
      },
    ],
    cta: { label: 'Browse Top iTutors', href: ctaUrl },
  });
}

export function day7Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `${firstName}, we're here to help you get started`,
    heading: 'Need help getting started?',
    intro: `Hi ${firstName},`,
    eyebrow: 'A hand from us',
    blocks: [
      {
        kind: 'paragraph',
        text:
          "We noticed you haven't booked your first session yet. No worries — sometimes finding the right tutor takes a bit of guidance!",
      },
      {
        kind: 'notice',
        title: 'Tell us what you need help with',
        body: `Just email us at ${CONTACT} with:\n📝 Your subject(s) — Maths, Chemistry, English\n📚 Your form level — Form 4, CAPE, University\n🎯 Any specific topics or exam prep needs`,
      },
      {
        kind: 'paragraph',
        text:
          "We'll personally recommend 2–3 itutors who are perfect for your needs and budget. Many students find this helpful when starting out.\n\nYou can also browse our full tutor directory anytime:",
      },
    ],
    cta: { label: 'Find Your iTutor', href: ctaUrl },
    closing: `Having technical issues or questions? Contact us at ${CONTACT} or visit our Help Centre.`,
  });
}

export function longWeekendPromoEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'marketing-campaign',
    subject: `🎉 Long weekend coming up, ${firstName}! Perfect time to book sessions`,
    heading: '🎉 Long weekend coming up!',
    intro: `Hi ${firstName},`,
    blocks: [
      {
        kind: 'paragraph',
        text:
          'The long weekend is almost here — and what better time to catch up on your studies? While everyone else is relaxing, you can use this extra time to get ahead in your classes!',
      },
      {
        kind: 'notice',
        title: '⏰ Perfect time to book',
        body:
          "📚 Catch up on topics you're struggling with\n📝 Prepare for upcoming tests and exams\n🎯 Get ahead on assignments and projects\n💡 Review before the new school week starts",
      },
      {
        kind: 'details',
        title: 'Why book during the long weekend?',
        tone: 'neutral',
        rows: [
          { label: '✅ More availability', value: 'Extra time slots open' },
          { label: '✅ No time pressure', value: 'Longer, more thorough sessions' },
          { label: '✅ Fresh start', value: 'Go into next week prepared' },
          { label: '✅ Beat the rush', value: 'Book before spots fill up' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Whether you need help with Maths, Sciences, English, or exam prep, our top-rated iTutors are ready to help you succeed.',
      },
    ],
    cta: { label: 'Find Your iTutor Now', href: ctaUrl },
    closing:
      '💡 Pro tip: sessions booked 24–48 hours in advance give you the best choice of time slots.',
    unsubscribeUrl: `${brandAssets.site}/student/settings`,
  });
}
