/**
 * The iTutor email design system.
 *
 * Build an email by naming its family and describing its content:
 *
 *   import { renderEmail } from '@/lib/email/design';
 *
 *   const { subject, html, text } = renderEmail({
 *     family: 'booking-confirmation',
 *     subject: 'You are booked for CSEC Mathematics',
 *     heading: "You're booked for Mathematics",
 *     intro: 'Everything is confirmed. Here are your session details.',
 *     blocks: [
 *       { kind: 'details', rows: [
 *         { label: 'Tutor', value: 'Ms. Tricia Singh' },
 *         { label: 'Date',  value: 'Wednesday, 19 August 2026' },
 *       ] },
 *       { kind: 'paragraph', text: 'We will send you a reminder before it begins.' },
 *     ],
 *     cta: { label: 'View my booking', href: url },
 *   });
 *
 * Then hand `html` and `text` to sendEmail. Nothing else in the codebase should
 * be writing email markup — see docs/EMAIL_DESIGN_SYSTEM.md for which family a
 * given message belongs to.
 */

export { renderEmail } from './render';
export type { RenderEmailInput, RenderedEmail, EmailCta } from './render';
export { renderBlock } from './blocks';
export type { EmailBlock, DetailRow, Step } from './blocks';
export {
  families,
  palette,
  tones,
  fontStack,
  monoStack,
  brandAssets,
  companyDetails,
  socialLinks,
  cardWidth,
} from './theme';
export type { EmailFamily, FamilyDefinition, Tone, ToneColours } from './theme';
