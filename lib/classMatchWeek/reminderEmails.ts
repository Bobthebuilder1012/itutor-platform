/**
 * Class Match Week emails.
 *
 * Two shapes, from docs 03 §3.4 and 04 §4.4:
 *
 *   • the reservation confirmation, sent the moment a seat is taken
 *   • the reminders, 24 hours and 1 hour before the taster starts
 *
 * WHY THESE MATTER MORE THAN THE PLATFORM'S OTHER MAIL. The campaign collects
 * an email address and nothing else — no phone number — so email is the only
 * channel it has. The reminders are the only thing standing between a
 * reservation and attendance, and attendance is how the campaign converts. A
 * reminder that does not arrive is a free half hour nobody turns up to.
 *
 * THE JOIN LINK IS THE JOIN ROUTE, not the Meet URL.
 * /api/class-match/sessions/[id]/join records the join click, issues the
 * attendee's coupon and only then redirects to the room. Putting the raw Meet
 * link in the email would take the family to class and lose both — the metric
 * the campaign is judged on and the discount that is the whole offer.
 *
 * All times are Trinidad wall-clock. Never derive a zone from `groups.timezone`:
 * it reads 'UTC' on every row and is wrong.
 */

import { renderEmail, type RenderedEmail } from '@/lib/email/design';
import type { ClassMatchSession } from './types';

const AST = 'America/Port_of_Spain';

export type ReminderKind = '24h' | '1h';

/** What every one of these emails needs to know. */
export type CampaignEmailContext = {
  /** Absolute origin — an email has none of its own to resolve against. */
  appUrl: string;
  session: Pick<ClassMatchSession, 'id' | 'title' | 'scheduled_at' | 'duration_minutes'>;
  /** The class the taster is a sample of. */
  className: string;
  teacherName: string;
  /** How much comes off that class for anyone who attends. */
  discountPercent: number;
  /** First name if we have one — the campaign's signups often have neither. */
  recipientName?: string | null;
};

function fullDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-TT', {
    timeZone: AST,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeOnly(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-TT', {
    timeZone: AST,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function joinUrl(ctx: CampaignEmailContext): string {
  return `${ctx.appUrl}/api/class-match/sessions/${ctx.session.id}/join`;
}

function greeting(name: string | null | undefined): string | undefined {
  return name ? `Hi ${name},` : undefined;
}

/**
 * Sent when a seat is taken.
 *
 * Deliberately spells out that the taster is free AND that attending is what
 * unlocks the discount. Both are the offer, and a family who reserved on a
 * results page three days ago will not remember either.
 */
export function reservationConfirmationEmail(ctx: CampaignEmailContext): RenderedEmail {
  const when = fullDateTime(ctx.session.scheduled_at);

  return renderEmail({
    family: 'booking-confirmation',
    subject: `Your free taster with ${ctx.teacherName} is booked`,
    preheader: `${when} · ${ctx.session.duration_minutes} minutes · free`,
    heading: 'Your place is reserved',
    intro: greeting(ctx.recipientName)
      ? `${greeting(ctx.recipientName)} your free taster is confirmed.`
      : 'Your free taster is confirmed.',
    eyebrow: 'Class Match Week',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Taster', value: ctx.session.title },
          { label: 'Class', value: ctx.className },
          { label: 'Teacher', value: ctx.teacherName },
          { label: 'When', value: when },
          { label: 'Length', value: `${ctx.session.duration_minutes} minutes` },
          { label: 'Cost', value: 'Free', strong: true },
        ],
      },
      {
        kind: 'notice',
        title: `Turn up and you unlock ${ctx.discountPercent}% off`,
        body: `Attending this taster earns you ${ctx.discountPercent}% off ${ctx.className} if you decide to enrol. Nothing to claim — it appears on the class once you have been.`,
      },
      {
        kind: 'paragraph',
        text:
          'We will remind you the day before and again an hour ahead. The Join button goes live two hours before the session starts.',
      },
    ],
    cta: { label: 'See my tasters', href: `${ctx.appUrl}/class-match-week/my-classes` },
  });
}

/** The 24-hour and 1-hour reminders. Same shape, different urgency. */
export function reminderEmail(ctx: CampaignEmailContext, kind: ReminderKind): RenderedEmail {
  const isFinal = kind === '1h';
  const when = isFinal
    ? `Today at ${timeOnly(ctx.session.scheduled_at)}`
    : fullDateTime(ctx.session.scheduled_at);

  return renderEmail({
    family: 'session-reminder',
    subject: isFinal
      ? `Starting in 1 hour: your taster with ${ctx.teacherName}`
      : `Tomorrow: your free taster with ${ctx.teacherName}`,
    preheader: isFinal
      ? 'The room opens shortly — the Join button is live.'
      : `${when} · ${ctx.session.duration_minutes} minutes · free`,
    heading: isFinal ? 'Your taster starts in 1 hour' : 'Your taster is tomorrow',
    intro: `${ctx.session.title} with ${ctx.teacherName}.`,
    badge: isFinal ? '1h' : '24h',
    blocks: [
      {
        kind: 'card',
        title: ctx.session.title,
        lines: [
          `${when} · ${ctx.session.duration_minutes} minutes`,
          `With ${ctx.teacherName} · a taste of ${ctx.className}`,
        ],
      },
      isFinal
        ? {
            kind: 'paragraph' as const,
            text: 'Join a couple of minutes early if you can. Turning up is what unlocks your discount.',
          }
        : {
            kind: 'notice' as const,
            title: `${ctx.discountPercent}% off if you attend`,
            body: `Turning up earns you ${ctx.discountPercent}% off ${ctx.className}. The Join button goes live two hours before the session.`,
          },
    ],
    // Live for the 1-hour reminder; for the 24-hour one it lands on the portal,
    // because the join route refuses before its window and an email button that
    // answers "not yet" is worse than one that shows you the reservation.
    cta: isFinal
      ? { label: 'Join session', href: joinUrl(ctx) }
      : { label: 'View my taster', href: `${ctx.appUrl}/class-match-week/my-classes` },
    secondary: isFinal
      ? { label: 'See all my tasters', href: `${ctx.appUrl}/class-match-week/my-classes` }
      : undefined,
  });
}

/**
 * Sent when a teacher cancels a taster.
 *
 * docs 01 §1.3 sets the floor: the session stops showing as upcoming and NO
 * automatic email is sent. That floor exists so the platform never directs a
 * family to an empty room, and it is a floor rather than a ceiling — this is the
 * email for when we choose to do better than it. Nothing calls it automatically
 * yet; it is here so that when cancellation notices are turned on, the copy is
 * already written and reviewed rather than typed in a hurry.
 */
export function cancellationEmail(ctx: CampaignEmailContext): RenderedEmail {
  return renderEmail({
    family: 'refund-cancellation',
    subject: `Cancelled: your taster with ${ctx.teacherName}`,
    heading: 'This taster is no longer running',
    intro: `${ctx.teacherName} has cancelled ${ctx.session.title}.`,
    eyebrow: 'Taster cancelled',
    blocks: [
      {
        kind: 'details',
        rows: [
          { label: 'Taster', value: ctx.session.title },
          { label: 'Was scheduled for', value: fullDateTime(ctx.session.scheduled_at) },
          { label: 'Cost to you', value: 'Nothing — it was free', strong: true },
        ],
      },
      {
        kind: 'paragraph',
        text:
          'Nothing was charged and there is nothing to cancel on your side. Other teachers are running free tasters this week, and your place at any of them is one tap.',
      },
    ],
    cta: { label: 'Find another taster', href: `${ctx.appUrl}/class-match-week/explore` },
  });
}
