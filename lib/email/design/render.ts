/**
 * The chrome every iTutor email shares, and the one function that builds one.
 *
 * Top to bottom: a tone-coloured rule, a black band with the wordmark, the white
 * body (badge, eyebrow, heading, blocks, button, fine print), a black footer
 * carrying the socials and the company details, and one grey line outside the
 * card saying what kind of mail this is.
 *
 * `renderEmail` returns the subject alongside the HTML and a plain-text
 * alternative. All three come from the same object on purpose: a subject written
 * at the call site and a body written here is how you end up with "Your session
 * was cancelled" over a booking confirmation.
 */

import { renderBlock, type EmailBlock } from './blocks';
import { escapeHtml } from './escape';
import {
  brandAssets,
  cardWidth,
  companyDetails,
  families,
  fontStack,
  palette,
  socialLinks,
  tones,
  type EmailFamily,
  type Tone,
} from './theme';

export type EmailCta = { label: string; href: string };

/**
 * A URL, ready for an href.
 *
 * encodeURI on the way out, so a stray space or quote in a signed link cannot
 * break out of the attribute — EXCEPT when the "URL" is a mail-template
 * placeholder. The Supabase auth templates are rendered by this same code with
 * `{{ .ConfirmationURL }}` in place of a link, and encoding it to
 * %7B%7B%20.ConfirmationURL%20%7D%7D leaves Supabase nothing to substitute and
 * every confirmation email pointing at a dead relative path. Placeholders pass
 * through untouched; they come from our own template definitions, never from a
 * request.
 */
function safeHref(href: string): string {
  return href.includes('{{') ? href : encodeURI(href);
}

export type RenderEmailInput = {
  family: EmailFamily;
  /** The subject line. Returned with the body so the two are written together. */
  subject: string;
  /**
   * The inbox preview line. Defaults to the intro, but set it when the intro
   * repeats the heading — the preview is the reader's second look at the email,
   * and "Everything is confirmed." earns its place there more than a repeat of
   * the subject does.
   */
  preheader?: string;
  /** The big line. Not a sentence — "You're booked for Mathematics". */
  heading: string;
  /** One line under the heading, centred. */
  intro?: string;
  /** The body, in order. */
  blocks?: EmailBlock[];
  /** The green button. */
  cta?: EmailCta;
  /**
   * When the CTA is a link the reader may have to paste — a confirmation or
   * reset link — this prints it underneath. Clients that rewrite or strip the
   * button leave the reader with nothing otherwise.
   */
  showCtaUrl?: boolean;
  /** A quieter link under the button. */
  secondary?: EmailCta;
  /** Closing fine print inside the card. */
  closing?: string;
  /** Overrides the family's tone. */
  tone?: Tone;
  /** Overrides the family's eyebrow. */
  eyebrow?: string;
  /** Overrides the family's badge glyph — a reminder sets "24h", "1h" or "10m". */
  badge?: string;
  /** Overrides the line outside the card. */
  footerNote?: string;
  /** Marketing mail only: the unsubscribe destination. */
  unsubscribeUrl?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

const ESSENTIAL_NOTE = 'This is an essential iTutor email related to your account or activity.';
const ACCOUNT_NOTE = 'This is an essential account email and cannot be unsubscribed from.';

/**
 * Hidden preview text.
 *
 * The trailing run of zero-width joiners is not decoration: without it, Gmail
 * and Apple Mail fill the rest of the preview line with whatever text comes
 * next in the markup, which is the wordmark's alt text.
 */
function preheaderBlock(text: string): string {
  const pad = '&#8203;&nbsp;'.repeat(60);
  return (
    `<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">` +
    `${escapeHtml(text)}${pad}</div>`
  );
}

function header(accent: string): string {
  return (
    `<tr><td style="background:${accent};height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>` +
    `<tr><td align="center" style="background:${palette.ink};padding:22px 24px;">` +
    `<img src="${brandAssets.logoOnDark}" width="${brandAssets.logoWidth}" height="${brandAssets.logoHeight}" alt="iTutor" ` +
    `style="display:block;border:0;width:${brandAssets.logoWidth}px;height:auto;" />` +
    `</td></tr>`
  );
}

function badgeCircle(glyph: string, tone: Tone): string {
  const t = tones[tone];
  // Sized on the <td> with a matching line-height rather than on a div: it is
  // the only way to centre a glyph in a circle that survives Outlook.
  const long = glyph.length > 1;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;"><tr>` +
    `<td align="center" width="44" height="44" style="background:${t.wash};border-radius:22px;font-family:${fontStack};font-size:${
      long ? '14px' : '18px'
    };font-weight:700;color:${t.ink};line-height:44px;">${escapeHtml(glyph)}</td>` +
    `</tr></table>`
  );
}

function button(cta: EmailCta, accent: string): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:4px 0 12px;"><tr>` +
    `<td align="center" style="background:${accent};border-radius:8px;">` +
    `<a href="${safeHref(cta.href)}" style="display:block;padding:14px 24px;font-family:${fontStack};font-size:15px;font-weight:700;color:${
      palette.ink
    };text-decoration:none;">${escapeHtml(cta.label)}</a>` +
    `</td></tr></table>`
  );
}

function footer(note: string, unsubscribeUrl?: string): string {
  const socials = socialLinks
    .map(
      (s) =>
        `<td style="padding:0 5px;">` +
        `<a href="${s.href}" style="text-decoration:none;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td align="center" width="30" height="30" style="background:#1e2620;border-radius:15px;">` +
        `<img src="${s.icon}" width="14" height="14" alt="${s.label}" style="display:block;border:0;margin:0 auto;" />` +
        `</td></tr></table></a></td>`
    )
    .join('');

  const unsubscribe = unsubscribeUrl
    ? `<div style="margin-top:8px;font-family:${fontStack};font-size:11px;line-height:1.6;color:#7f8c83;">` +
      `<a href="${safeHref(unsubscribeUrl)}" style="color:#9aa8a0;text-decoration:underline;">Unsubscribe from iTutor updates</a></div>`
    : '';

  return (
    `<tr><td align="center" style="background:${palette.ink};padding:24px;">` +
    `<img src="${brandAssets.logoOnDark}" width="80" height="24" alt="iTutor" style="display:block;border:0;width:80px;height:auto;margin:0 auto 12px;" />` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;"><tr>${socials}</tr></table>` +
    `<div style="font-family:${fontStack};font-size:11px;line-height:1.7;color:#9aa8a0;">` +
    `<a href="${brandAssets.termsUrl}" style="color:#c8d3cb;text-decoration:underline;">Terms of Service</a>` +
    `<span style="color:#5d6a61;"> &middot; </span>` +
    `<a href="${brandAssets.privacyUrl}" style="color:#c8d3cb;text-decoration:underline;">Privacy Policy</a>` +
    `</div>` +
    `<div style="margin-top:8px;font-family:${fontStack};font-size:11px;line-height:1.6;color:#7f8c83;">` +
    `${escapeHtml(companyDetails.name)}<br />${escapeHtml(companyDetails.address)}<br />${escapeHtml(
      companyDetails.copyright()
    )}</div>${unsubscribe}` +
    `</td></tr>`
  );
}

/** The plain-text alternative. Some clients prefer it, and spam filters read it. */
function plainText(input: RenderEmailInput, note: string): string {
  const lines: string[] = [input.heading];
  if (input.intro) lines.push('', input.intro);

  for (const block of input.blocks ?? []) {
    switch (block.kind) {
      case 'paragraph':
        lines.push('', block.text.trim());
        break;
      case 'details':
        lines.push('');
        if (block.title) lines.push(block.title);
        for (const r of block.rows) lines.push(`${r.label}: ${r.value}`);
        break;
      case 'notice':
        lines.push('', [block.title, block.body].filter(Boolean).join(' — '));
        break;
      case 'code':
        lines.push('', block.code);
        if (block.note) lines.push(block.note);
        break;
      case 'card':
        lines.push('', block.title, ...block.lines);
        break;
      case 'steps':
        lines.push('');
        block.steps.forEach((s, i) => lines.push(`${i + 1}. ${s.title} — ${s.body}`));
        break;
      case 'person':
        lines.push('', [block.name, block.caption].filter(Boolean).join(' — '));
        break;
      case 'compare':
        lines.push('', `${block.beforeLabel}: ${block.before}`, `${block.afterLabel}: ${block.after}`);
        break;
      case 'fineprint':
        lines.push('', block.text.trim());
        break;
      case 'divider':
      case 'html':
        // A rule has no text, and the html block's markup is not worth
        // stripping badly — its callers repeat anything load-bearing in a
        // paragraph.
        break;
    }
  }

  if (input.cta) lines.push('', `${input.cta.label}: ${input.cta.href}`);
  if (input.secondary) lines.push('', `${input.secondary.label}: ${input.secondary.href}`);
  if (input.closing) lines.push('', input.closing.trim());
  lines.push('', note, `${companyDetails.name}, ${companyDetails.address}`);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Build one email: subject, HTML and plain text, from one description. */
export function renderEmail(input: RenderEmailInput): RenderedEmail {
  const family = families[input.family];
  const tone = input.tone ?? family.tone;
  const accent = tones[tone].accent;
  const eyebrow = input.eyebrow ?? family.eyebrow;
  const badge = input.badge ?? family.badge;
  const note =
    input.footerNote ?? (input.family === 'authentication-action' ? ACCOUNT_NOTE : ESSENTIAL_NOTE);

  const body = (input.blocks ?? []).map((b) => renderBlock(b, tone)).join('');

  const ctaUrlBlock =
    input.cta && input.showCtaUrl
      ? `<p style="margin:0 0 14px;font-family:${fontStack};font-size:12px;line-height:1.6;color:${palette.muted};">` +
        `If the button does not work, copy and paste this link into your browser:<br />` +
        `<a href="${safeHref(input.cta.href)}" style="color:${tones[tone].ink};text-decoration:underline;word-break:break-all;">${escapeHtml(
          input.cta.href
        )}</a></p>`
      : '';

  const secondaryBlock = input.secondary
    ? `<p style="margin:0 0 14px;font-family:${fontStack};font-size:13px;text-align:center;">` +
      `<a href="${safeHref(input.secondary.href)}" style="color:${tones[tone].ink};text-decoration:underline;font-weight:600;">${escapeHtml(
        input.secondary.label
      )}</a></p>`
    : '';

  const closingBlock = input.closing
    ? `<p style="margin:0;font-family:${fontStack};font-size:12px;line-height:1.6;color:${palette.muted};text-align:center;">${escapeHtml(
        input.closing
      )}</p>`
    : '';

  const html =
    `<!DOCTYPE html><html lang="en" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<meta name="x-apple-disable-message-reformatting" /><meta name="color-scheme" content="light" />` +
    `<meta name="supported-color-schemes" content="light" />` +
    `<title>${escapeHtml(input.subject)}</title>` +
    // The only stylesheet, and nothing here is load-bearing: a client that drops
    // it gets the desktop padding on a phone, which is legible.
    `<style>@media only screen and (max-width:620px){` +
    `.it-card{width:100% !important;}` +
    `.it-pad{padding-left:20px !important;padding-right:20px !important;}` +
    `.it-h1{font-size:23px !important;}` +
    `}</style></head>` +
    `<body style="margin:0;padding:0;background:${palette.canvas};-webkit-font-smoothing:antialiased;">` +
    preheaderBlock(input.preheader ?? input.intro ?? input.heading) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${palette.canvas};">` +
    `<tr><td align="center" style="padding:24px 12px 30px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${cardWidth}" class="it-card" ` +
    `style="width:${cardWidth}px;max-width:100%;background:${palette.card};border-radius:12px;overflow:hidden;">` +
    header(accent) +
    `<tr><td class="it-pad" style="background:${palette.card};padding:30px 40px 32px;">` +
    `<div align="center">${badgeCircle(badge, tone)}</div>` +
    `<p style="margin:0 0 6px;font-family:${fontStack};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${
      tones[tone].ink
    };text-align:center;">${escapeHtml(eyebrow)}</p>` +
    `<h1 class="it-h1" style="margin:0 0 10px;font-family:${fontStack};font-size:27px;line-height:1.22;font-weight:800;color:${
      palette.ink
    };text-align:center;">${escapeHtml(input.heading)}</h1>` +
    (input.intro
      ? `<p style="margin:0 0 20px;font-family:${fontStack};font-size:14px;line-height:1.6;color:${palette.body};text-align:center;">${escapeHtml(
          input.intro
        )}</p>`
      : `<div style="height:8px;"></div>`) +
    body +
    (input.cta ? button(input.cta, accent) : '') +
    ctaUrlBlock +
    secondaryBlock +
    closingBlock +
    `</td></tr>` +
    footer(note, input.family === 'marketing-campaign' ? input.unsubscribeUrl : undefined) +
    `</table>` +
    `<p style="margin:14px auto 0;max-width:${cardWidth}px;font-family:${fontStack};font-size:11px;line-height:1.6;color:${palette.faint};text-align:center;">${escapeHtml(
      note
    )}</p>` +
    `</td></tr></table></body></html>`;

  return { subject: input.subject, html, text: plainText(input, note) };
}
