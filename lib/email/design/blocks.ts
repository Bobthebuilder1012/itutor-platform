/**
 * The content blocks an iTutor email body is assembled from.
 *
 * Twelve of them, and between them they render every one of the fourteen
 * families in the gallery. A caller describes an email as a heading and a list
 * of blocks; nothing composes raw HTML at the call site, which is how the old
 * hand-written strings drifted into six different paddings and three different
 * greens.
 *
 * ESCAPING IS THE DEFAULT. Every field is escaped on the way in. The one
 * exception is the `html` block, which exists for the handful of places that
 * genuinely need markup — and its name says so at the call site, so a reviewer
 * can find every one of them with a search.
 */

import { escapeHtml } from '../plainTextEmailHtml';
import { fontStack, monoStack, palette, tones, type Tone } from './theme';

/** One label/value row of a detail panel. */
export type DetailRow = {
  label: string;
  value: string;
  /** Totals and amounts due — heavier, and in the panel's tone. */
  strong?: boolean;
};

export type Step = { title: string; body: string };

export type EmailBlock =
  /** Body copy. Blank-line-separated text becomes separate paragraphs. */
  | { kind: 'paragraph'; text: string; align?: 'left' | 'center' }
  /** Pre-escaped markup, for the rare body that needs a link mid-sentence. */
  | { kind: 'html'; html: string }
  /** The label/value table: booking details, receipt lines, change summaries. */
  | { kind: 'details'; rows: DetailRow[]; title?: string; tone?: Tone }
  /** A short tinted callout. The "secure, one-time link" and "verification complete" boxes. */
  | { kind: 'notice'; body: string; title?: string; tone?: Tone }
  /** A verification or two-factor code. */
  | { kind: 'code'; code: string; note?: string }
  /** The dark session card of a reminder: what, when, with whom. */
  | { kind: 'card'; title: string; lines: string[] }
  /** Numbered onboarding steps. */
  | { kind: 'steps'; steps: Step[] }
  /** Who invited you — avatar initials, name, caption. */
  | { kind: 'person'; name: string; caption?: string; initials?: string }
  /** Was / is now, for a reschedule. Struck-through old value, tinted new one. */
  | { kind: 'compare'; beforeLabel: string; before: string; afterLabel: string; after: string }
  /** A hairline. */
  | { kind: 'divider' }
  /** Fine print inside the body, above the footer. */
  | { kind: 'fineprint'; text: string; align?: 'left' | 'center' };

/** Split on blank lines so a multi-paragraph string renders as paragraphs. */
function paragraphs(text: string): string[] {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Escape, then turn single newlines into <br> — a line break the author meant. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\n/g, '<br />');
}

function renderParagraph(text: string, align: 'left' | 'center' = 'left'): string {
  return paragraphs(text)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${fontStack};font-size:15px;line-height:1.62;color:${palette.body};text-align:${align};">${inline(
          p
        )}</p>`
    )
    .join('');
}

function renderDetails(rows: DetailRow[], title: string | undefined, tone: Tone): string {
  const t = tones[tone];
  const head = title
    ? `<tr><td colspan="2" style="padding:0 0 10px;font-family:${fontStack};font-size:14px;font-weight:700;color:${palette.ink};">${escapeHtml(
        title
      )}</td></tr>`
    : '';

  const body = rows
    .map((r, i) => {
      // A hairline between rows but never above the first or below the last:
      // the panel border is already doing that job.
      const sep = i === 0 ? '' : `border-top:1px solid ${t.edge};`;
      const valueWeight = r.strong ? '700' : '500';
      const valueColour = r.strong ? t.ink : palette.inkSoft;
      return (
        `<tr>` +
        `<td style="${sep}padding:9px 0;font-family:${fontStack};font-size:13px;color:${palette.muted};">${escapeHtml(
          r.label
        )}</td>` +
        `<td align="right" style="${sep}padding:9px 0;font-family:${fontStack};font-size:13px;font-weight:${valueWeight};color:${valueColour};">${inline(
          r.value
        )}</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="margin:0 0 18px;background:${t.wash};border:1px solid ${t.edge};border-radius:10px;">` +
    `<tr><td style="padding:14px 16px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${head}${body}</table>` +
    `</td></tr></table>`
  );
}

function renderNotice(body: string, title: string | undefined, tone: Tone): string {
  const t = tones[tone];
  const heading = title
    ? `<div style="font-family:${fontStack};font-size:13px;font-weight:700;color:${t.ink};">${escapeHtml(
        title
      )}</div>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="margin:0 0 18px;background:${t.wash};border:1px solid ${t.edge};border-radius:10px;">` +
    `<tr><td style="padding:13px 16px;">${heading}` +
    `<div style="margin-top:${title ? '4px' : '0'};font-family:${fontStack};font-size:13px;line-height:1.55;color:${palette.body};">${inline(
      body
    )}</div>` +
    `</td></tr></table>`
  );
}

function renderCode(code: string, note?: string): string {
  const tail = note
    ? `<p style="margin:10px 0 0;font-family:${fontStack};font-size:12px;line-height:1.5;color:${palette.muted};text-align:center;">${inline(
        note
      )}</p>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 6px;">` +
    `<tr><td align="center" style="background:${palette.ink};border-radius:10px;padding:20px 16px;">` +
    // letter-spacing on a digit run is the difference between a code that can be
    // read aloud over a phone and one that cannot.
    `<span style="font-family:${monoStack};font-size:30px;font-weight:700;letter-spacing:8px;color:${palette.white};">${escapeHtml(
      code
    )}</span>` +
    `</td></tr></table>${tail}<div style="height:12px;"></div>`
  );
}

function renderCard(title: string, lines: string[]): string {
  const rest = lines
    .map(
      (l) =>
        `<div style="margin-top:4px;font-family:${fontStack};font-size:13px;line-height:1.5;color:#c8d3cb;">${inline(
          l
        )}</div>`
    )
    .join('');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;">` +
    `<tr><td style="background:${palette.ink};border-radius:10px;padding:16px 18px;">` +
    `<div style="font-family:${fontStack};font-size:16px;font-weight:700;color:${palette.white};">${escapeHtml(
      title
    )}</div>${rest}` +
    `</td></tr></table>`
  );
}

function renderSteps(steps: Step[], tone: Tone): string {
  const t = tones[tone];
  const rows = steps
    .map(
      (s, i) =>
        `<tr>` +
        `<td width="34" valign="top" style="padding:0 0 14px;">` +
        // A round numbered chip. width+height+line-height on the cell rather
        // than border-radius on a div, because Outlook drops the radius but
        // keeps the fill, and a green square reads as deliberate.
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
        `<td align="center" width="22" height="22" style="background:${t.accent};border-radius:11px;font-family:${fontStack};font-size:11px;font-weight:700;color:${palette.white};line-height:22px;">${i + 1}</td>` +
        `</tr></table></td>` +
        `<td valign="top" style="padding:0 0 14px;">` +
        `<div style="font-family:${fontStack};font-size:14px;font-weight:700;color:${palette.ink};">${escapeHtml(
          s.title
        )}</div>` +
        `<div style="margin-top:2px;font-family:${fontStack};font-size:13px;line-height:1.55;color:${palette.body};">${inline(
          s.body
        )}</div>` +
        `</td></tr>`
    )
    .join('');
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="margin:0 0 18px;background:${palette.panel};border:1px solid ${palette.border};border-radius:10px;">` +
    `<tr><td style="padding:16px 18px 4px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>` +
    `</td></tr></table>`
  );
}

/** Two capitals from a name — the avatar when there is no photo to send. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'IT';
  const first = parts[0]![0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '';
  return (first + last).toUpperCase();
}

function renderPerson(name: string, caption: string | undefined, initials: string | undefined): string {
  const tail = caption
    ? `<div style="margin-top:3px;font-family:${fontStack};font-size:12px;color:${palette.muted};">${inline(
        caption
      )}</div>`
    : '';
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="margin:0 0 18px;background:${palette.panel};border:1px solid ${palette.border};border-radius:10px;">` +
    `<tr><td align="center" style="padding:20px 16px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;"><tr>` +
    `<td align="center" width="46" height="46" style="background:${palette.ink};border-radius:23px;font-family:${fontStack};font-size:15px;font-weight:700;color:${palette.white};line-height:46px;">${escapeHtml(
      initials ?? initialsOf(name)
    )}</td>` +
    `</tr></table>` +
    `<div style="margin-top:10px;font-family:${fontStack};font-size:15px;font-weight:700;color:${palette.ink};">${escapeHtml(
      name
    )}</div>${tail}` +
    `</td></tr></table>`
  );
}

function renderCompare(
  beforeLabel: string,
  before: string,
  afterLabel: string,
  after: string
): string {
  const cell = (label: string, value: string, tone: Tone, strike: boolean) => {
    const t = tones[tone];
    return (
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
      `style="margin:0 0 8px;background:${t.wash};border:1px solid ${t.edge};border-radius:10px;">` +
      `<tr><td style="padding:11px 14px;">` +
      `<div style="font-family:${fontStack};font-size:12px;font-weight:700;color:${t.ink};">${escapeHtml(
        label
      )}</div>` +
      `<div style="margin-top:2px;font-family:${fontStack};font-size:13px;color:${palette.body};${
        strike ? 'text-decoration:line-through;' : ''
      }">${inline(value)}</div>` +
      `</td></tr></table>`
    );
  };
  // Struck through on the old value, not on the new one — the reader is
  // scanning for what changed, and the strike is what tells them at a glance.
  return (
    cell(beforeLabel, before, 'alert', true) +
    cell(afterLabel, after, 'success', false) +
    `<div style="height:10px;"></div>`
  );
}

function renderDivider(): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 18px;"><tr><td style="border-top:1px solid ${palette.border};font-size:0;line-height:0;">&nbsp;</td></tr></table>`;
}

function renderFinePrint(text: string, align: 'left' | 'center'): string {
  return paragraphs(text)
    .map(
      (p) =>
        `<p style="margin:0 0 8px;font-family:${fontStack};font-size:12px;line-height:1.55;color:${palette.muted};text-align:${align};">${inline(
          p
        )}</p>`
    )
    .join('');
}

/** Render one block. `tone` is the email's tone, used by blocks that do not carry their own. */
export function renderBlock(block: EmailBlock, tone: Tone): string {
  switch (block.kind) {
    case 'paragraph':
      return renderParagraph(block.text, block.align);
    case 'html':
      return block.html;
    case 'details':
      return renderDetails(block.rows, block.title, block.tone ?? tone);
    case 'notice':
      return renderNotice(block.body, block.title, block.tone ?? tone);
    case 'code':
      return renderCode(block.code, block.note);
    case 'card':
      return renderCard(block.title, block.lines);
    case 'steps':
      return renderSteps(block.steps, tone);
    case 'person':
      return renderPerson(block.name, block.caption, block.initials);
    case 'compare':
      return renderCompare(block.beforeLabel, block.before, block.afterLabel, block.after);
    case 'divider':
      return renderDivider();
    case 'fineprint':
      return renderFinePrint(block.text, block.align ?? 'center');
  }
}

export { escapeHtml };
