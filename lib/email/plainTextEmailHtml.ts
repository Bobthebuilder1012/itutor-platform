/**
 * The wrapper for admin-authored email.
 *
 * The admin email tool (app/admin/emails) lets someone write plain text and
 * sends it as HTML; this is what turns one into the other. It used to carry its
 * own layout — a black logo bar, a white box, and a "© iTutor · Nora Digital,
 * Ltd." footer naming a company that is no longer the operating entity — which
 * meant every bulk send looked like it came from a different product than every
 * transactional email.
 *
 * It now renders through lib/email/design, in the `service-announcement` family:
 * the reader gets the same chrome, the same footer and the same company details
 * as the rest of their mail.
 */

import { renderEmail } from './design/render';

// escapeHtml moved to ./design/escape so the dependency between this file and
// the design system runs one way. Re-exported because callers import it from
// here and there is no reason to make them move.
export { escapeHtml } from './design/escape';

/**
 * Wrap plain text (with optional `{{firstName}}`) in the iTutor email layout.
 *
 * Blank-line-separated blocks become paragraphs and single newlines become line
 * breaks — the shape the author typed. The first line is NOT promoted to a
 * heading: an admin writing "Hi {{firstName}}," would get it set at 27px, and
 * guessing which first lines are titles is worse than having no title.
 *
 * `title` sets the heading when the caller has one.
 */
export function plainTextToEmailHtml(text: string, title?: string): string {
  const heading = title?.trim() || 'A message from iTutor';

  return renderEmail({
    family: 'service-announcement',
    subject: heading,
    heading,
    eyebrow: 'From iTutor',
    blocks: text.trim() ? [{ kind: 'paragraph', text }] : [],
  }).html;
}

/** Best-effort extract of editable plain text from stored HTML (browser only). */
export function htmlToPlainTextForEditor(html: string): string {
  if (typeof window === 'undefined') return html;
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return html;
  }
}
