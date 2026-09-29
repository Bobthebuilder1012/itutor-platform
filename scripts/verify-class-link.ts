/**
 * Behavioural checks for normalizeClassLinkUrl (lib/utils/meetingLink.ts) —
 * the gate every tutor-typed class link passes before it is stored and put in
 * an href in front of students.
 *
 * Run: npm run classlink:verify
 *   (= npx ts-node --project scripts/tsconfig.verify.json scripts/verify-class-link.ts)
 */

import './_alias';
import { CLASS_LINK_SAFE_RE, normalizeClassLinkUrl } from '../lib/utils/meetingLink';

const failures: string[] = [];

const ACCEPT: Array<[string, string]> = [
  ['zoom.us/j/123', 'https://zoom.us/j/123'],
  ['https://us06web.zoom.us/j/123?pwd=abc.1', 'https://us06web.zoom.us/j/123?pwd=abc.1'],
  ['HTTPS://Meet.Google.com/abc-defg-hij', 'https://meet.google.com/abc-defg-hij'],
  ['​meet.google.com/abc-defg-hij ', 'https://meet.google.com/abc-defg-hij'],
  // Existing escapes are kept exactly — re-encoding %3a to %253a is what kills Teams links.
  [
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%7d',
    'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc%40thread.v2/0?context=%7b%22Tid%22%7d',
  ],
  // A pasted invitation keeps only its link.
  ['Join Zoom Meeting\nhttps://zoom.us/j/999?pwd=x\nMeeting ID: 999', 'https://zoom.us/j/999?pwd=x'],
  // Characters that could break out of an attribute are percent-encoded.
  ["https://x.com/a'b\"c<d>`e{f}", 'https://x.com/a%27b%22c%3Cd%3E%60e%7Bf%7D'],
];

const REJECT: string[] = [
  'javascript:alert(1)',
  'JavaScript:alert(1)',
  ' javascript:alert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'http://zoom.us/j/1',
  'mailto:tutor@example.com',
  'https://user:pw@zoom.us/j/1',
  'localhost:3000/x',
  'https://intranet/x',
  '',
  '   ',
  'not a link at all',
  `https://example.com/${'a'.repeat(2100)}`,
];

for (const [input, expected] of ACCEPT) {
  const r = normalizeClassLinkUrl(input);
  if (!r.ok) failures.push(`should accept ${JSON.stringify(input)}, got error "${r.error}"`);
  else {
    if (r.url !== expected) failures.push(`${JSON.stringify(input)}: expected ${expected}, got ${r.url}`);
    if (!CLASS_LINK_SAFE_RE.test(r.url)) failures.push(`${r.url} fails CLASS_LINK_SAFE_RE (the DB CHECK would reject it)`);
  }
}
for (const input of REJECT) {
  const r = normalizeClassLinkUrl(input);
  if (r.ok) failures.push(`should reject ${JSON.stringify(input).slice(0, 60)}, got ${r.url.slice(0, 60)}`);
}
for (const input of [null, undefined, 42, {}]) {
  if (normalizeClassLinkUrl(input).ok) failures.push(`should reject non-string ${String(input)}`);
}

if (failures.length) {
  console.error(`✗ ${failures.length} failure(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ normalizeClassLinkUrl: ${ACCEPT.length} accepted, ${REJECT.length + 4} rejected as expected`);
