/**
 * Shared meeting-link validity helper.
 *
 * A generated Zoom / Google Meet link is reused for 30 days from the moment it
 * was generated. After that it is considered stale and the next request
 * regenerates a fresh link. There is intentionally NO join-window / time-of-
 * session gating anywhere — a present, non-stale link is joinable at any time.
 *
 * Pure + deterministic (accepts `now`) so it can be unit-tested.
 */
export const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function isLinkStillValid(
  generatedAt: string | Date | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!generatedAt) return false;
  const ts = generatedAt instanceof Date ? generatedAt.getTime() : new Date(generatedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return now - ts < THIRTY_DAYS_MS;
}

// ── A tutor's own class link ────────────────────────────────────────────────
//
// In 'custom' mode the tutor types the link every Join button opens, so it
// ends up as a raw <a href> in front of every student and in reminder emails.
// Everything that stores one goes through normalizeClassLinkUrl, on the client
// for live feedback and again in the route that writes it.

export const CLASS_LINK_MAX_LENGTH = 2048;

/** Same character set as the groups_meeting_link_safe CHECK (migration 262). */
export const CLASS_LINK_SAFE_RE = /^https:\/\/[^\s"'<>`\\{}]+$/;

const ZERO_WIDTH_RE = /[​-‍⁠﻿]/g;
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;

export type ClassLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * A tutor-typed class link, made safe to store and to put in an href.
 *
 * - "zoom.us/j/123" gains https://. Any other scheme — javascript:, data:,
 *   http: — is refused rather than rewritten: an http link rewritten to https
 *   may simply not exist.
 * - A pasted Zoom or Teams invitation keeps only its first link.
 * - The result is what the URL parser serialises, with the few characters it
 *   leaves alone that could still break out of an attribute percent-encoded.
 *   Existing escapes (a Teams link's %3a) are kept as they are.
 */
export function normalizeClassLinkUrl(raw: unknown): ClassLinkResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Enter your class link.' };
  let s = raw.replace(ZERO_WIDTH_RE, '').trim();
  if (!s) return { ok: false, error: 'Enter your class link.' };

  if (/\s/.test(s)) {
    // A bracketed link first — Outlook's plain-text invitations write
    // "Join the meeting now<https://teams…>" — so the brackets aren't kept.
    const found = s.match(/<(https?:\/\/[^>\s]+)>/i) ?? s.match(/(https?:\/\/\S+)/i);
    if (!found) return { ok: false, error: "That doesn't look like a link. Paste just the meeting link." };
    s = found[1];
  }
  // Wrapping and sentence punctuation that came along with a copied link:
  // "(https://zoom.us/j/1?pwd=abc)." would otherwise keep ")." and store a
  // wrong passcode. No meeting link ends in any of these.
  s = s.replace(/^[<(\["']+/, '').replace(/[>)\]}.,;:!?'"]+$/, '');

  if (!HAS_SCHEME_RE.test(s)) s = `https://${s}`;
  if (!/^https:\/\//i.test(s)) {
    return {
      ok: false,
      error: /^http:\/\//i.test(s)
        ? 'Use the secure version of the link — it starts with https://'
        : 'Only https:// meeting links can be used.',
    };
  }

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return { ok: false, error: "That link isn't valid. Check it and try again." };
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.')) {
    return { ok: false, error: "That link isn't valid. Check it and try again." };
  }
  if (u.username || u.password) {
    return { ok: false, error: "Links with a username or password in them can't be used." };
  }

  const url = u
    .toString()
    .replace(/[{}`\\']/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  if (url.length > CLASS_LINK_MAX_LENGTH) return { ok: false, error: 'That link is too long.' };
  if (!CLASS_LINK_SAFE_RE.test(url)) return { ok: false, error: "That link isn't valid. Check it and try again." };
  return { ok: true, url };
}
