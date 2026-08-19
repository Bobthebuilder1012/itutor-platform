/**
 * The tutor onboarding sequence, plus the verification outcome.
 *
 * Seven emails: welcome on signup, then day 1, 3, 5 and 7 for anyone who has
 * not finished setting up, the long-weekend promotion, and the one that is not
 * part of the sequence at all — `verificationCongratulationsEmail`, sent by the
 * reviewer and admin decision routes when a tutor is approved.
 *
 * These were seven hand-written HTML documents sharing a `baseStyles` block,
 * around 510 lines of repeated header, footer, button and emoji-list markup,
 * with a footer naming "Nora Digital, Ltd." — no longer the operating company.
 *
 * The copy is unchanged, including every rate band and claimed statistic.
 * Restyling and rewriting are separate decisions and this only makes the first.
 * The rate bands and the "150%" figure are worth someone checking, but not in
 * the same change that moves the layout.
 */

import { renderEmail } from '@/lib/email/design';
import { brandAssets } from '@/lib/email/design/theme';
import type { EmailTemplateProps, EmailTemplate } from './types';

const CONTACT = brandAssets.contactEmail;

export function welcomeEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `Welcome to iTutor, ${firstName}! Complete your profile 🎓`,
    heading: `Welcome to iTutor, ${firstName}!`,
    intro: "You're about to connect with students who need your expertise.",
    blocks: [
      {
        kind: 'paragraph',
        text:
          'Congrats on joining the #1 tutoring platform in the Caribbean! To start receiving booking requests, complete these quick steps:',
      },
      {
        kind: 'steps',
        steps: [
          { title: 'Add your subjects and hourly rates', body: 'Everything you can teach, and what you charge.' },
          { title: 'Set your availability', body: 'The times students can book you.' },
          { title: 'Write a short bio', body: 'Your experience, in your own words.' },
          { title: 'Upload credentials for verification', body: 'Degrees, certificates, results.' },
        ],
      },
      {
        kind: 'notice',
        body:
          'iTutors who complete their profile in the first 24 hours get their first student 3x faster!',
      },
    ],
    cta: { label: 'Complete Your Profile', href: ctaUrl },
    closing: `Questions? Contact us at ${CONTACT}. We're here to help you succeed!`,
  });
}

/**
 * Sent when a tutor's verification is approved.
 *
 * Family 04 — the one email in this file that is not part of the onboarding
 * sequence. Sent from three places: the reviewer decision route, the reviewer
 * bulk-decide route, and the admin approve route.
 */
export function verificationCongratulationsEmail(firstName: string): EmailTemplate {
  return renderEmail({
    family: 'verification-outcome',
    subject: "Congratulations – You're now a verified iTutor!",
    heading: "You're now a verified iTutor",
    intro: `Congratulations, ${firstName} — your credentials have been approved.`,
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
    cta: { label: 'View my tutor profile', href: `${brandAssets.site}/tutor/profile` },
    closing: `Questions about this decision? Contact us at ${CONTACT}.`,
  });
}

export function day1Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `${firstName}, set your availability and start earning`,
    heading: 'Set your rates and availability',
    intro: `Hi ${firstName},`,
    eyebrow: 'Next step',
    blocks: [
      {
        kind: 'paragraph',
        text:
          'Ready to start earning? The next step is setting up your subjects, rates and teaching preferences.',
      },
      {
        kind: 'steps',
        steps: [
          {
            title: 'Add your subjects',
            body: 'List all subjects you can teach — Maths, Chemistry, English, and so on.',
          },
          {
            title: 'Set competitive rates',
            body:
              'Average rates: Form 1–3 ($50–80/hr), Form 4–5 ($80–120/hr), CAPE/University ($120–200/hr).',
          },
          {
            title: 'Set your availability',
            body: 'The times you can teach. Students book directly into them.',
          },
        ],
      },
      {
        kind: 'notice',
        title: 'Pro tip',
        body: 'The more availability you open, the more bookings you can take.',
      },
    ],
    cta: { label: 'Set Up Your Profile', href: ctaUrl },
  });
}

export function day3Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: 'How to get your first student on iTutor',
    heading: 'Get your first student',
    intro: `Hi ${firstName},`,
    eyebrow: 'Getting booked',
    blocks: [
      { kind: 'paragraph', text: "Here's how to stand out and get bookings fast:" },
      {
        kind: 'steps',
        steps: [
          {
            title: '🌟 Complete your profile',
            body:
              'Students look at your bio, credentials and response time. Make sure everything is filled out.',
          },
          {
            title: '⚡ Respond quickly',
            body:
              'Students often book the first tutor who replies. Check your email and iTutor dashboard regularly.',
          },
          {
            title: '💰 Price competitively',
            body:
              "Check similar itutors' rates in your subjects. You can always adjust prices later based on demand.",
          },
          {
            title: '✅ Get verified',
            body:
              'Verified itutors with credentials get 2x more bookings. Upload your certificates or degree.',
          },
        ],
      },
      {
        kind: 'paragraph',
        text: 'Students are actively searching for itutors right now. Make sure your profile is ready.',
      },
    ],
    cta: { label: 'View Your Profile', href: ctaUrl },
  });
}

export function day5Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `${firstName}, tips to improve your tutor profile`,
    heading: 'Improve your profile',
    intro: `Hi ${firstName},`,
    eyebrow: 'Profile tips',
    blocks: [
      {
        kind: 'paragraph',
        text: 'Want to attract more students? Here are the profile elements that matter most:',
      },
      {
        kind: 'steps',
        steps: [
          {
            title: '📝 Write a strong bio',
            body:
              "Mention your qualifications, teaching experience, exam results you've helped students achieve, and what makes you unique. Keep it friendly and conversational.",
          },
          {
            title: '📸 Add a profile photo',
            body: 'Profiles with photos get 60% more views. Use a clear, professional-looking headshot.',
          },
          {
            title: '🎓 List your credentials',
            body:
              "Degrees, certifications, teaching experience — students want to know you're qualified.",
          },
          {
            title: '💬 Response time matters',
            body: 'Aim to respond to booking requests within 4–6 hours. Fast responses = more bookings.',
          },
        ],
      },
      {
        kind: 'notice',
        title: 'Example of a great bio',
        body:
          "Hi! I'm a certified teacher with 5+ years helping students ace their CXC and CAPE exams. I specialize in Maths and Physics and love making complex topics simple. My students consistently score Grade 1–2. I offer flexible online sessions via Zoom. Let's work together to reach your goals!",
      },
    ],
    cta: { label: 'Edit Your Profile', href: ctaUrl },
  });
}

export function day7Email({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'welcome-onboarding',
    subject: `${firstName}, need help getting verified?`,
    heading: 'Get verified and stand out',
    intro: `Hi ${firstName},`,
    eyebrow: 'Verification',
    blocks: [
      {
        kind: 'paragraph',
        text:
          "We noticed you haven't set up your subjects and availability yet. No worries — we're here to help!",
      },
      {
        kind: 'details',
        title: 'Why verification matters',
        tone: 'neutral',
        rows: [
          { label: '✅ Search results', value: 'Verified itutors appear first' },
          { label: '✅ Trust', value: 'Students trust verified profiles 2x more' },
          { label: '✅ Bookings', value: 'Verified badge lifts bookings by 150%' },
          { label: '✅ Rates', value: 'Unlocks higher tiers ($150–200/hour)' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'What you can upload:\n• University degrees or transcripts\n• Teaching certificates (MOE, private school)\n• Professional credentials (CAPE results for Form 6 itutors)\n• CXC/CAPE Grade 1–2 certificates for subject verification',
      },
      {
        kind: 'notice',
        title: 'Need help?',
        body: `Email us at ${CONTACT} with the subjects you want to teach, your qualifications, and any questions about the verification process. We'll guide you through it step by step.`,
      },
    ],
    cta: { label: 'Complete Your Profile', href: ctaUrl },
    closing: `Already set up but not receiving bookings? Email ${CONTACT} and we'll review your profile.`,
  });
}

export function longWeekendPromoEmail({ firstName, ctaUrl }: EmailTemplateProps): EmailTemplate {
  return renderEmail({
    family: 'marketing-campaign',
    subject: `💰 ${firstName}, earn extra during the long weekend!`,
    heading: '💰 Long weekend = earning opportunity',
    intro: `Hi ${firstName},`,
    blocks: [
      {
        kind: 'paragraph',
        text:
          'The long weekend is coming up — and that means students are looking to catch up on their studies with extra sessions. This is your chance to boost your earnings while helping more students.',
      },
      {
        kind: 'details',
        title: '💵 Potential extra earnings',
        tone: 'warning',
        rows: [
          { label: '2–3 extra sessions', value: '$300–$600+', strong: true },
          { label: 'Full weekend availability', value: 'Even more opportunities' },
        ],
      },
      {
        kind: 'details',
        title: 'Why itutors earn more during long weekends',
        tone: 'neutral',
        rows: [
          { label: '✅ Higher demand', value: 'Students want to use the time' },
          { label: '✅ Flexible scheduling', value: 'Morning, afternoon and evening slots' },
          { label: '✅ Longer sessions', value: 'Students book 2–3 hours for deep work' },
          { label: '✅ Less competition', value: 'Many tutors take the weekend off' },
        ],
      },
      {
        kind: 'steps',
        steps: [
          { title: 'Update your availability', body: 'Add extra time slots.' },
          { title: 'Open your calendar early', body: 'Students are booking now.' },
          { title: 'Promote your availability', body: 'Students see "available now" first.' },
          { title: 'Be responsive', body: 'Quick replies mean more bookings.' },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Popular subjects in high demand: Maths, Physics, Chemistry, English, Accounting, and exam prep (CXC, CAPE).',
      },
    ],
    cta: { label: 'Update My Availability', href: ctaUrl },
    unsubscribeUrl: `${brandAssets.site}/tutor/settings`,
  });
}
