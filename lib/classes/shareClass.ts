// =====================================================
// CLASS SHARING — URL + INVITATION COPY
// =====================================================
// One source of truth for what a tutor sends when they invite a student, so
// the My Classes card, the class detail page and any future surface cannot
// drift apart.

import { formatLevel } from '@/lib/utils/formatLevel';

/**
 * Shared links are printed, pasted into WhatsApp and forwarded for months.
 * They outlive the tab they were copied from, so they always encode the
 * production host — the same reasoning as components/QrCodePanel.tsx, which
 * hardcodes this for QR codes. NEXT_PUBLIC_APP_URL is a preview or localhost
 * host in every environment except production and would bake a dead domain
 * into someone's group chat.
 */
const PUBLIC_BASE = 'https://myitutor.com';

export type ShareClassInput = {
  id: string;
  title: string;
  subject?: string | null;
  level?: string | null;
  /** '1on1-*' or 'group-*'. Anything else is treated as a group class. */
  kind?: string | null;
  capacity?: number | null;
  enrolled?: number | null;
  pricePerSession?: number | null;
  tutorName?: string | null;
};

/**
 * The public class page — the one with the banner, schedule and Join button.
 * `/classes/[id]` is the older dark-themed view; it now redirects here, so
 * links already in the wild keep working, but nothing new should emit it.
 */
export function classShareUrl(groupId: string): string {
  return `${PUBLIC_BASE}/student/explore/${groupId}`;
}

/** "Form 5 (15–16)" reads as form-filling in a text message. Drop the range. */
function shortLevel(level?: string | null): string | null {
  if (!level) return null;
  const label = formatLevel(level);
  if (label === '—') return null;
  return label.replace(/\s*\([^)]*\)\s*$/, '').trim() || null;
}

/**
 * The invitation a tutor sends. Written in the tutor's own voice rather than
 * as a system notice — it lands in a personal chat, usually from someone the
 * recipient already knows, and a marketing blurb there reads as spam.
 *
 * Every claim in it has to be true: the scarcity line only appears when seats
 * really are running out, because a tutor cannot vet copy they did not write.
 */
export function classInviteMessage(c: ShareClassInput): string {
  const isOneOnOne = (c.kind ?? '').startsWith('1on1');
  const isFree = c.pricePerSession == null || c.pricePerSession <= 0;

  const opener = isOneOnOne
    ? `I'm taking on students for ${c.title} on iTutor and I'd love to work with you.`
    : `I'm teaching ${c.title} on iTutor and I'd love you in the room.`;

  // Subject · Form 5 · live group classes with <tutor>.
  const facts = [c.subject?.trim(), shortLevel(c.level)].filter(Boolean);
  facts.push(isOneOnOne ? 'one-to-one sessions online' : 'live group classes online');
  let detail = facts.join(' · ');
  if (c.tutorName?.trim()) detail += ` with ${c.tutorName.trim()}`;
  detail += '.';
  // A class with no subject or level starts this line on the kind phrase.
  detail = detail.charAt(0).toUpperCase() + detail.slice(1);

  // Seats only get mentioned when the number is real and actually tight.
  // Never for a 1:1, where the capacity is 1 by definition — "only 1 seat
  // left" there is manufactured urgency, and it would be on every invitation.
  const capacity = c.capacity ?? 0;
  const enrolled = c.enrolled ?? 0;
  const left = capacity - enrolled;
  const scarce = !isOneOnOne && capacity > 1 && left > 0 && left <= 5;

  let callToAction: string;
  if (scarce) callToAction = `Only ${left} ${left === 1 ? 'seat' : 'seats'} left — claim yours here:`;
  else if (isOneOnOne) callToAction = 'Book a time that suits you here:';
  else callToAction = 'Come and see what we do:';

  return [
    isFree ? `${opener} It's free to join.` : opener,
    '',
    detail,
    '',
    callToAction,
    classShareUrl(c.id),
  ].join('\n');
}

/** Subject line for the email target. */
export function classInviteSubject(c: ShareClassInput): string {
  return `Join ${c.title} on iTutor`;
}
